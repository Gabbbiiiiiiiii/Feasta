import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {getStorage} from "firebase-admin/storage";
import {getAuth, type UserRecord} from "firebase-admin/auth";
import type {
  DocumentData,
  DocumentReference,
  Transaction,
} from "firebase-admin/firestore";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  isProviderVerificationTransitionAllowed,
  MAX_VERIFICATION_DOCUMENT_SIZE_BYTES,
  providerVerificationDocumentPolicy,
  shouldPublishProvider,
  type ProviderVerificationStatus,
  USER_ROLES,
  VERIFICATION_DOCUMENT_CONTENT_TYPES,
  verificationDocumentsSatisfyPolicy,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  createIdempotencyKey,
  failIdempotentOperation,
} from "../shared/idempotency.js";
import {logError, logInfo} from "../shared/logger.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {writeVerificationHistoryInTransaction} from "../shared/verification-history.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {requireTrustedProviderIdentity} from "../shared/provider-identity-prerequisites.js";
import {
  requireEnum,
  requireObject,
  requireString,
} from "../shared/validation.js";

const REVIEW_ACTIONS = [
  "start_review",
  "approve",
  "reject",
  "require_resubmission",
  "suspend",
] as const;

type ReviewAction =
  (typeof REVIEW_ACTIONS)[number];

const REVIEWABLE_STATUSES = [
  "submitted",
  "under_review",
  "approved",
] as const;

export const reviewProviderVerification = onCall(
  appCheckCallableOptions,
  async (request) => {
    const authenticatedUser = requireAuth(request);

    await enforceCallableRateLimit(request, {
      scope: "reviewProviderVerification",
      limit: 30,
      windowSeconds: 10 * 60,
    });

    try {
      await requireRole(
        authenticatedUser.uid,
        [USER_ROLES.admin],
      );
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "The administrator account could not be verified.",
      );
    }

    const input = requireObject(request.data);

    const verificationId = requireString(
      input.verificationId,
      "verificationId",
      {
        minLength: 1,
        maxLength: 128,
      },
    );

    const action = requireEnum(
      input.action,
      "action",
      REVIEW_ACTIONS,
    );

    const remarks = typeof input.reason === "string"
      ? input.reason.trim()
      : typeof input.remarks === "string"
        ? input.remarks.trim()
        : "";

    const actionRequiresReason =
      action === "reject" ||
      action === "require_resubmission" ||
      action === "suspend";

    if (
      actionRequiresReason &&
      remarks.length < 10
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Provide a meaningful reason with at least 10 characters.",
      );
    }

    if (remarks.length > 2000) {
      throw new HttpsError(
        "invalid-argument",
        "The review reason must not exceed 2000 characters.",
      );
    }

    const verificationReference = db
      .collection("providerVerifications")
      .doc(verificationId);

    const idempotencyKey = createIdempotencyKey({
      operation: "reviewProviderVerification",
      actorId: authenticatedUser.uid,
      clientKey: input.idempotencyKey,
      payload: input,
    });
    const idempotency = await beginIdempotentOperation({
      key: idempotencyKey,
      operation: "reviewProviderVerification",
      actorId: authenticatedUser.uid,
    });
    if (idempotency.state === "completed") {
      return {...idempotency.result, idempotentReplay: true};
    }

    try {
      const [storageValidatedDocuments, approvalOwnerAuth] = action ===
        "approve" ?
        await Promise.all([
          validateApprovalStorageEvidence(verificationId),
          loadApprovalOwnerAuth(verificationReference),
        ]) :
        [null, null];
      const result = await db.runTransaction(
        async (transaction) => {
          const verificationSnapshot =
            await transaction.get(
              verificationReference,
            );

          if (!verificationSnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "Provider verification was not found.",
            );
          }

          const verificationData =
            verificationSnapshot.data();

          const providerId =
            verificationData?.providerId;

          if (
            typeof providerId !== "string" ||
            providerId.length === 0
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The verification record has no valid provider reference.",
            );
          }

          const providerReference = db
            .collection("providers")
            .doc(providerId);

          const providerSnapshot =
            await transaction.get(
              providerReference,
            );

          if (!providerSnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "The related provider profile was not found.",
            );
          }

          const providerData =
            providerSnapshot.data();

          const ownerId = providerData?.ownerId;

          if (
            typeof ownerId !== "string" ||
            ownerId.length === 0
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The provider profile has no valid owner.",
            );
          }

          const currentStatus =
            verificationData?.status;

          if (providerData?.verificationStatus !== currentStatus) {
            throw new HttpsError(
              "failed-precondition",
              "The provider and verification statuses are inconsistent.",
            );
          }
          const ownerSnapshot = await transaction.get(
            db.collection("users").doc(ownerId),
          );
          if (!ownerSnapshot.exists) {
            throw new HttpsError(
              "failed-precondition",
              "The provider owner account was not found.",
            );
          }

          const ownerData = ownerSnapshot.data();
          if (action === "approve") {
            if (
              !approvalOwnerAuth ||
              approvalOwnerAuth.uid !== ownerId ||
              ownerData?.role !== USER_ROLES.provider ||
              ownerData.accountStatus !== "active" ||
              ownerData.isActive !== true ||
              ownerData.isBlocked !== false ||
              ownerData.providerId !== providerId
            ) {
              throw new HttpsError(
                "failed-precondition",
                "The provider owner identity is incomplete or incorrectly linked.",
              );
            }
            await requireTrustedProviderIdentity(
              approvalOwnerAuth,
              ownerData,
            );
          }

          if (ownerId === authenticatedUser.uid) {
            throw new HttpsError(
              "permission-denied",
              "Administrators cannot review a provider they own.",
            );
          }

          if (
            typeof currentStatus !== "string" ||
            !REVIEWABLE_STATUSES.includes(
              currentStatus as
                | "submitted"
                | "under_review"
                | "approved",
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "This verification cannot be reviewed from its current status.",
            );
          }

          const nextStatus = resolveNextStatus(
            action,
          );

          validateTransition({
            currentStatus,
            action,
            nextStatus,
          });

          const approvedDocumentReferences = action === "approve" ?
            await validateApprovalDocumentsInTransaction({
              transaction,
              verificationReference,
              providerId,
              providerData: providerData ?? {},
              storageValidatedDocuments:
                storageValidatedDocuments ?? new Map(),
            }) :
            [];
          const packageSnapshot = await transaction.get(
            db.collection("packages")
              .where("providerId", "==", providerId)
              .limit(101),
          );
          if (packageSnapshot.size > 100) {
            throw new HttpsError(
              "failed-precondition",
              "Provider package visibility requires administrative support.",
            );
          }

          const verificationUpdate =
            buildVerificationUpdate({
              action,
              nextStatus,
              adminId:
                authenticatedUser.uid,
              remarks,
            });

          const providerUpdate =
            buildProviderUpdate({
              nextStatus,
              adminId: authenticatedUser.uid,
              remarks,
              publiclyVisible:
                nextStatus === "approved" &&
                shouldPublishProvider(
                  {
                    ...(providerData ?? {}),
                    id: providerId,
                    verificationStatus: "approved",
                    isActive: true,
                    isSuspended: false,
                  },
                  ownerSnapshot.data() ?? {},
                ),
            });

          transaction.update(
            verificationReference,
            verificationUpdate,
          );

          transaction.update(
            providerReference,
            providerUpdate,
          );

          transaction.update(
            db.collection("users").doc(ownerId),
            {
              verificationStatus:
                adminUserVerificationStatus(
                  nextStatus,
                ),
              updatedAt: serverTimestamp(),
            },
          );

          for (const documentReference of approvedDocumentReferences) {
            transaction.update(documentReference, {
              status: "verified",
              verifiedAt: serverTimestamp(),
              verifiedBy: authenticatedUser.uid,
              rejectionReason: null,
              updatedAt: serverTimestamp(),
            });
          }
          for (const packageDocument of packageSnapshot.docs) {
            const packageData = packageDocument.data();
            transaction.update(packageDocument.ref, {
              providerPubliclyVisible:
                publiclyVisibleForPackage(packageData, providerUpdate),
              updatedAt: serverTimestamp(),
            });
          }

          const auditLogReference = writeAuditLogInTransaction(
            transaction,
            {
              actorId:
                authenticatedUser.uid,
              actorRole:
                USER_ROLES.admin,
              action:
                `provider_verification_${nextStatus}`,
              targetCollection:
                "providerVerifications",
              targetId:
                verificationId,
              reason:
                remarks.length > 0
                  ? remarks
                  : undefined,
              source:
                "cloud_function",
              before: {
                status: currentStatus,
              },
              after: {
                status: nextStatus,
                ...(action === "approve" ? {
                  verifiedDocumentCount:
                    approvedDocumentReferences.length,
                } : {}),
              },
              metadata: {
                providerId,
                reviewAction: action,
              },
            },
          );
          writeVerificationHistoryInTransaction(transaction, {
            verificationId,
            providerId,
            actorId: authenticatedUser.uid,
            actorRole: USER_ROLES.admin,
            eventType: `verification_${nextStatus}`,
            fromStatus: currentStatus,
            toStatus: nextStatus,
            remarks: remarks || null,
            auditLogId: auditLogReference.id,
            metadata: {reviewAction: action},
          });

          createNotificationInTransaction(
            transaction,
            {
              userId: ownerId,
              title: notificationTitle(
                nextStatus,
              ),
              message: notificationMessage({
                status: nextStatus,
                businessName:
                  typeof providerData
                    ?.businessName === "string"
                    ? providerData.businessName
                    : "Your provider profile",
                remarks,
              }),
              type: "verification",
              relatedId: verificationId,
              relatedCollection:
                "providerVerifications",
              metadata: {
                providerId,
                status: nextStatus,
              },
            },
          );

          return {
            verificationId,
            providerId,
            previousStatus:
              currentStatus,
            status: nextStatus,
          };
        },
      );

      logInfo(
        "Provider verification reviewed",
        {
          adminId:
            authenticatedUser.uid,
          verificationId:
            result.verificationId,
          providerId:
            result.providerId,
          previousStatus:
            result.previousStatus,
          status: result.status,
          action,
        },
      );
      logSecurityEvent({
        action: "provider_verification_decision",
        outcome: "succeeded",
        actorUid: authenticatedUser.uid,
        targetId: result.verificationId,
        correlationId: authenticatedUser.correlationId,
        reasonCode: action,
        metadata: {
          providerId: result.providerId,
          previousStatus: result.previousStatus,
          status: result.status,
        },
      });

      const response = {
        success: true,
        ...result,
      };
      await completeIdempotentOperation({
        key: idempotencyKey,
        operation: "reviewProviderVerification",
        actorId: authenticatedUser.uid,
        result: response,
      });
      return {...response, idempotentReplay: false};
    } catch (error) {
      await failIdempotentOperation({
        key: idempotencyKey,
        errorCode: error instanceof HttpsError ? error.code : "internal",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => undefined);
      logError(
        "Provider verification review failed",
        error,
        {
          adminId:
            authenticatedUser.uid,
          verificationId,
          action,
        },
      );

      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "The provider verification could not be reviewed.",
      );
    }
  },
);

async function loadApprovalOwnerAuth(
  verificationReference: DocumentReference,
): Promise<UserRecord> {
  const verificationSnapshot = await verificationReference.get();
  if (!verificationSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "Provider verification was not found.",
    );
  }

  const providerId = verificationSnapshot.data()?.providerId;
  if (typeof providerId !== "string" || providerId.trim() === "") {
    throw new HttpsError(
      "failed-precondition",
      "The verification record has no valid provider reference.",
    );
  }

  const providerSnapshot = await db.collection("providers").doc(providerId).get();
  const ownerId = providerSnapshot.data()?.ownerId;
  if (!providerSnapshot.exists || typeof ownerId !== "string" || !ownerId) {
    throw new HttpsError(
      "failed-precondition",
      "The provider profile has no valid owner.",
    );
  }

  try {
    return await getAuth().getUser(ownerId);
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "The provider owner authentication account was not found.",
    );
  }
}

function resolveNextStatus(
  action: ReviewAction,
):
  | "under_review"
  | "approved"
  | "rejected"
  | "resubmission_required"
  | "suspended" {
  switch (action) {
    case "start_review":
      return "under_review";

    case "approve":
      return "approved";

    case "reject":
      return "rejected";

    case "require_resubmission":
      return "resubmission_required";

    case "suspend":
      return "suspended";
  }
}

function validateTransition({
  currentStatus,
  nextStatus,
}: {
  currentStatus: string;
  action: ReviewAction;
  nextStatus: string;
}): void {
  if (!isProviderVerificationTransitionAllowed(
    currentStatus as ProviderVerificationStatus,
    nextStatus as ProviderVerificationStatus,
  )) {
    throw new HttpsError(
      "failed-precondition",
      `The verification cannot transition to ${nextStatus}.`,
    );
  }
}

function buildVerificationUpdate({
  action,
  nextStatus,
  adminId,
  remarks,
}: {
  action: ReviewAction;
  nextStatus:
    | "under_review"
    | "approved"
    | "rejected"
    | "resubmission_required"
    | "suspended";
  adminId: string;
  remarks: string;
}): Record<string, unknown> {
  const update: Record<string, unknown> = {
    status: nextStatus,
    reviewedBy: adminId,
    remarks:
      remarks.length > 0
        ? remarks
        : null,
    updatedAt:
      serverTimestamp(),
  };

  if (action === "start_review") {
    update.reviewedAt =
      serverTimestamp();
  }

  if (action === "approve") {
    update.reviewedAt =
      serverTimestamp();
    update.approvedAt =
      serverTimestamp();
    update.rejectedAt = null;
    update.suspendedAt = null;
    update.rejectionReason = null;
    update.resubmissionReason = null;
    update.suspensionReason = null;
  }

  if (action === "suspend") {
    update.suspendedAt =
      serverTimestamp();
    update.suspensionReason = remarks;
    update.resubmissionReason = null;
  }

  if (action === "reject") {
    update.reviewedAt =
      serverTimestamp();
    update.rejectedAt =
      serverTimestamp();
    update.approvedAt = null;
    update.rejectionReason = remarks;
    update.resubmissionReason = null;
    update.suspensionReason = null;
  }

  if (
    action === "require_resubmission"
  ) {
    update.reviewedAt =
      serverTimestamp();
    update.approvedAt = null;
    update.rejectedAt = null;
    update.suspendedAt = null;
    update.rejectionReason = null;
    update.resubmissionReason = remarks;
    update.suspensionReason = null;
  }

  return update;
}

function adminUserVerificationStatus(
  status:
    | "under_review"
    | "approved"
    | "rejected"
    | "resubmission_required"
    | "suspended",
): "verified" | "pending" | "rejected" {
  switch (status) {
    case "approved":
      return "verified";

    case "rejected":
    case "resubmission_required":
    case "suspended":
      return "rejected";

    case "under_review":
      return "pending";
  }
}

function buildProviderUpdate({
  nextStatus,
  adminId,
  remarks,
  publiclyVisible,
}: {
  nextStatus:
    | "under_review"
    | "approved"
    | "rejected"
    | "resubmission_required"
    | "suspended";
  adminId: string;
  remarks: string;
  publiclyVisible: boolean;
}): Record<string, unknown> {
  return {
    verificationStatus:
      nextStatus,
    isActive:
      nextStatus === "approved",
    isSuspended:
      nextStatus === "suspended",
    publiclyVisible,
    ...(nextStatus === "suspended" ? {
      suspendedAt: serverTimestamp(),
      suspendedBy: adminId,
      suspensionReason: remarks,
    } : {}),
    ...(nextStatus === "approved" ? {
      approvedAt: serverTimestamp(),
      approvedBy: adminId,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null,
    } : {}),
    updatedAt:
      serverTimestamp(),
  };
}

function notificationTitle(
  status: string,
): string {
  switch (status) {
    case "under_review":
      return "Verification Under Review";

    case "approved":
      return "Provider Verification Approved";

    case "rejected":
      return "Provider Verification Rejected";

    case "resubmission_required":
      return "Verification Documents Required";

    case "suspended":
      return "Provider Suspended";

    default:
      return "Provider Verification Updated";
  }
}

function notificationMessage({
  status,
  businessName,
  remarks,
}: {
  status: string;
  businessName: string;
  remarks: string;
}): string {
  const remarksSuffix =
    remarks.length > 0
      ? ` Remarks: ${remarks}`
      : "";

  switch (status) {
    case "under_review":
      return `${businessName} is now under review.`;

    case "approved":
      return `${businessName} has been approved and can now operate on FEASTA.`;

    case "rejected":
      return `${businessName} was not approved.${remarksSuffix}`;

    case "resubmission_required":
      return `${businessName} requires updated verification documents.${remarksSuffix}`;

    case "suspended":
      return `${businessName} has been suspended and is no longer ` +
        `publicly available.${remarksSuffix}`;

    default:
      return `${businessName} verification was updated.`;
  }
}

function publiclyVisibleForPackage(
  packageData: Record<string, unknown>,
  providerUpdate: Record<string, unknown>,
): boolean {
  return providerUpdate.publiclyVisible === true &&
    packageData.status === "published" &&
    packageData.isActive === true &&
    packageData.isPublished === true &&
    packageData.isDeleted !== true;
}

type ApprovalDocument = {
  id: string;
  documentType: string;
  storagePath: string;
  status: string;
  reference: DocumentReference<DocumentData>;
};

async function validateApprovalStorageEvidence(
  verificationId: string,
): Promise<ReadonlyMap<string, string>> {
  const verificationReference = db
    .collection("providerVerifications")
    .doc(verificationId);
  const verificationSnapshot = await verificationReference.get();
  const providerId = verificationSnapshot.data()?.providerId;
  if (
    !verificationSnapshot.exists ||
    typeof providerId !== "string" ||
    providerId.length === 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider verification evidence could not be validated.",
    );
  }

  const [providerSnapshot, documentsSnapshot] = await Promise.all([
    db.collection("providers").doc(providerId).get(),
    verificationReference.collection("documents").get(),
  ]);
  if (!providerSnapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "The related provider profile was not found.",
    );
  }

  const requiredDocuments = selectRequiredApprovalDocuments(
    providerId,
    providerSnapshot.data() ?? {},
    documentsSnapshot.docs.map((document) =>
      approvalDocument(document.id, document.ref, document.data())
    ),
  );

  try {
    await Promise.all(requiredDocuments.map(async (document) => {
      const [metadata] = await getStorage()
        .bucket()
        .file(document.storagePath)
        .getMetadata();
      const contentType = String(metadata.contentType ?? "");
      const size = Number(metadata.size);
      if (
        !VERIFICATION_DOCUMENT_CONTENT_TYPES.includes(
          contentType as
            (typeof VERIFICATION_DOCUMENT_CONTENT_TYPES)[number],
        ) ||
        !Number.isFinite(size) ||
        size <= 0 ||
        size > MAX_VERIFICATION_DOCUMENT_SIZE_BYTES
      ) {
        throw new Error("invalid_document_metadata");
      }
    }));
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "A required verification document is missing or invalid.",
    );
  }

  return new Map(requiredDocuments.map((document) => [
    document.id,
    document.storagePath,
  ]));
}

async function validateApprovalDocumentsInTransaction({
  transaction,
  verificationReference,
  providerId,
  providerData,
  storageValidatedDocuments,
}: {
  transaction: Transaction;
  verificationReference: DocumentReference<DocumentData>;
  providerId: string;
  providerData: DocumentData;
  storageValidatedDocuments: ReadonlyMap<string, string>;
}): Promise<readonly DocumentReference<DocumentData>[]> {
  const documentsSnapshot = await transaction.get(
    verificationReference.collection("documents"),
  );
  const requiredDocuments = selectRequiredApprovalDocuments(
    providerId,
    providerData,
    documentsSnapshot.docs.map((document) =>
      approvalDocument(document.id, document.ref, document.data())
    ),
  );
  if (requiredDocuments.some((document) =>
    storageValidatedDocuments.get(document.id) !== document.storagePath
  )) {
    throw new HttpsError(
      "aborted",
      "Verification evidence changed during review. Reload and try again.",
    );
  }
  return requiredDocuments.map((document) => document.reference);
}

function approvalDocument(
  id: string,
  reference: DocumentReference<DocumentData>,
  data: DocumentData,
): ApprovalDocument {
  return {
    id,
    reference,
    documentType:
      typeof data.documentType === "string" ? data.documentType : "",
    storagePath:
      typeof data.storagePath === "string" ? data.storagePath.trim() : "",
    status: typeof data.status === "string" ? data.status : "",
  };
}

function selectRequiredApprovalDocuments(
  providerId: string,
  providerData: DocumentData,
  documents: readonly ApprovalDocument[],
): readonly ApprovalDocument[] {
  const eligibleByType = new Map(documents.flatMap((document) => {
    const expectedPrefix =
      `providers/${providerId}/verification/${document.documentType}/`;
    return (
      ["pending", "verified"].includes(document.status) &&
      document.storagePath.startsWith(expectedPrefix)
    ) ? [[document.documentType, document] as const] : [];
  }));
  const policy = providerVerificationDocumentPolicy(providerData);
  if (!verificationDocumentsSatisfyPolicy(
    new Set(eligibleByType.keys()),
    policy,
  )) {
    throw new HttpsError(
      "failed-precondition",
      "Every required verification document must be present before approval.",
    );
  }

  return [
    ...policy.requiredAll.map((type) => eligibleByType.get(type)),
    ...policy.requiredOneOf.map((group) =>
      group.map((type) => eligibleByType.get(type))
        .find((document) => document != null)
    ),
  ].filter(
    (document): document is ApprovalDocument => document != null,
  );
}
