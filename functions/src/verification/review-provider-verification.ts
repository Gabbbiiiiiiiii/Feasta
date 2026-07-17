import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  isProviderVerificationTransitionAllowed,
  type ProviderVerificationStatus,
  USER_ROLES,
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
  {
    region: "asia-southeast1",
  },
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
      remarks.length < 3
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A reason is required for this review action.",
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
            });

          transaction.update(
            verificationReference,
            verificationUpdate,
          );

          transaction.update(
            providerReference,
            providerUpdate,
          );

          writeAuditLogInTransaction(
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
              },
              metadata: {
                providerId,
                reviewAction: action,
              },
            },
          );

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

function buildProviderUpdate({
  nextStatus,
  adminId,
}: {
  nextStatus:
    | "under_review"
    | "approved"
    | "rejected"
    | "resubmission_required"
    | "suspended";
  adminId: string;
}): Record<string, unknown> {
  return {
    verificationStatus:
      nextStatus,
    isActive:
      nextStatus === "approved",
    isSuspended:
      nextStatus === "suspended",
    ...(nextStatus === "suspended" ? {
      suspendedAt: serverTimestamp(),
      suspendedBy: adminId,
    } : {}),
    ...(nextStatus === "approved" ? {
      suspendedAt: null,
      suspendedBy: null,
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
