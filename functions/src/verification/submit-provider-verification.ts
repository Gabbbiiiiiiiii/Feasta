import {HttpsError, onCall} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getStorage} from "firebase-admin/storage";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  providerVerificationDocumentPolicy,
  providerSubmissionProfileIssues,
  USER_ROLES,
  VERIFICATION_DOCUMENT_CONTENT_TYPES,
  MAX_VERIFICATION_DOCUMENT_SIZE_BYTES,
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
import {appCheckCallableOptions} from "../shared/function-options.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {writeVerificationHistoryInTransaction} from "../shared/verification-history.js";
import {
  requireObject,
  requireString,
} from "../shared/validation.js";

const SUBMITTABLE_STATUSES = [
  "draft",
  "resubmission_required",
] as const;

export const submitProviderVerification = onCall(
  appCheckCallableOptions,
  async (request) => {
    const authenticatedUser = requireAuth(request);

    await enforceCallableRateLimit(request, {
      scope: "submitProviderVerification",
      limit: 5,
      windowSeconds: 10 * 60,
    });

    try {
      await requireRole(
        authenticatedUser.uid,
        [USER_ROLES.provider],
      );
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "The provider account could not be verified.",
      );
    }

    let emailVerified: boolean;
    try {
      emailVerified = (await getAuth().getUser(authenticatedUser.uid))
        .emailVerified;
    } catch (error) {
      logError(
        "Provider Auth state lookup failed",
        error,
        {uid: authenticatedUser.uid},
      );
      throw new HttpsError(
        "internal",
        "The provider account could not be verified.",
      );
    }
    if (!emailVerified) {
      throw new HttpsError(
        "failed-precondition",
        "Verify your email address before submitting provider verification.",
      );
    }

    const input = requireObject(request.data);

    const providerId = requireString(
      input.providerId,
      "providerId",
      {
        minLength: 1,
        maxLength: 128,
      },
    );

    const providerReference = db
      .collection("providers")
      .doc(providerId);
    const userReference = db
      .collection("users")
      .doc(authenticatedUser.uid);

    const idempotencyKey = createIdempotencyKey({
      operation: "submitProviderVerification",
      actorId: authenticatedUser.uid,
      clientKey: input.idempotencyKey,
      payload: input,
    });
    const idempotency = await beginIdempotentOperation({
      key: idempotencyKey,
      operation: "submitProviderVerification",
      actorId: authenticatedUser.uid,
    });
    if (idempotency.state === "completed") {
      return {...idempotency.result, idempotentReplay: true};
    }

    try {
      const result = await db.runTransaction(
        async (transaction) => {
          const [providerSnapshot, userSnapshot] =
            await transaction.getAll(
              providerReference,
              userReference,
            );

          if (!providerSnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "Provider profile was not found.",
            );
          }

          const providerData =
            providerSnapshot.data();
          const userData = userSnapshot.data();

          if (
            providerData?.ownerId !==
            authenticatedUser.uid
          ) {
            throw new HttpsError(
              "permission-denied",
              "You do not own this provider profile.",
            );
          }

          if (providerData?.isDeleted === true) {
            throw new HttpsError(
              "permission-denied",
              "This provider profile is unavailable.",
            );
          }

          if (
            !userSnapshot.exists ||
            userData?.role !== USER_ROLES.provider ||
            userData?.accountStatus !== "active" ||
            userData?.isActive !== true ||
            userData?.isBlocked !== false ||
            userData?.providerId !== providerId
          ) {
            throw new HttpsError(
              "permission-denied",
              "The provider account is not active or correctly linked.",
            );
          }

          const verificationQuery = db
            .collection(
              "providerVerifications",
            )
            .where(
              "providerId",
              "==",
              providerId,
            )
            .limit(1);

          const verificationSnapshot =
            await transaction.get(
              verificationQuery,
            );

          if (verificationSnapshot.empty) {
            throw new HttpsError(
              "not-found",
              "Provider verification record was not found.",
            );
          }

          const verificationDocument =
            verificationSnapshot.docs[0];

          const verificationData =
            verificationDocument.data();

          const currentStatus =
            verificationData.status;

          if (
            providerData?.verificationStatus !== currentStatus
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The provider and verification statuses are inconsistent.",
            );
          }

          if (currentStatus === "submitted") {
            return {
              providerId,
              verificationId:
                verificationDocument.id,
              previousStatus:
                currentStatus,
              status: "submitted",
              alreadySubmitted: true,
            };
          }

          if (
            !SUBMITTABLE_STATUSES.includes(
              currentStatus,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "This verification cannot be submitted from its current status.",
            );
          }

          const profileIssues = providerSubmissionProfileIssues(
            providerData ?? {},
          );
          if (profileIssues.length > 0) {
            throw new HttpsError(
              "failed-precondition",
              "Complete every required provider profile section before submitting.",
              {missingOrInvalidProfileFields: profileIssues},
            );
          }

          if (
            verificationData.termsAcceptedAt == null ||
            verificationData.privacyAcceptedAt == null ||
            typeof verificationData.termsPolicyVersion !== "string" ||
            verificationData.termsPolicyVersion.trim() === "" ||
            typeof verificationData.privacyPolicyVersion !== "string" ||
            verificationData.privacyPolicyVersion.trim() === ""
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Accept the required Terms and Privacy Policy before submitting.",
            );
          }

          const documentsSnapshot =
            await transaction.get(
              verificationDocument.ref.collection(
                "documents",
              ),
            );

          if (documentsSnapshot.empty) {
            throw new HttpsError(
              "failed-precondition",
              "Upload the required verification documents before submitting.",
            );
          }

          const policy = providerVerificationDocumentPolicy(
            providerData ?? {},
          );
          const readyDocumentTypes = new Set(
            documentsSnapshot.docs.flatMap((document) => {
              const data = document.data();
              const type = typeof data.documentType === "string"
                ? data.documentType
                : "";
              const storagePath = typeof data.storagePath === "string"
                ? data.storagePath.trim()
                : "";
              return type &&
                storagePath &&
                ["pending", "verified"].includes(data.status)
                ? [type]
                : [];
            }),
          );
          if (!verificationDocumentsSatisfyPolicy(
            readyDocumentTypes,
            policy,
          )) {
            const missingDocumentTypes = policy.requiredAll.filter(
              (type) => !readyDocumentTypes.has(type),
            );
            const missingAlternativeGroups = policy.requiredOneOf.filter(
              (group) => !group.some((type) => readyDocumentTypes.has(type)),
            );
            throw new HttpsError(
              "failed-precondition",
              "Complete all required verification documents before submitting.",
              {
                missingDocumentTypes,
                missingAlternativeGroups,
              },
            );
          }

          const readyDocumentsByType = new Map(
            documentsSnapshot.docs.flatMap((document) => {
              const data = document.data();
              return readyDocumentTypes.has(String(data.documentType))
                ? [[String(data.documentType), data] as const]
                : [];
            }),
          );
          const requiredDocumentRecords = [
            ...policy.requiredAll.map(
              (type) => readyDocumentsByType.get(type),
            ),
            ...policy.requiredOneOf.map(
              (group) => group.map(
                (type) => readyDocumentsByType.get(type),
              ).find((document) => document != null),
            ),
          ].filter(
            (document): document is Record<string, unknown> =>
              document != null,
          );
          await assertRequiredStorageObjectsPresent(
            providerId,
            requiredDocumentRecords,
          );

          transaction.update(
            verificationDocument.ref,
            {
              status: "submitted",
              submittedAt:
                serverTimestamp(),
              reviewedAt: null,
              reviewedBy: null,
              approvedAt: null,
              rejectedAt: null,
              suspendedAt: null,
              rejectionReason: null,
              resubmissionReason: null,
              suspensionReason: null,
              remarks: null,
              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.update(
            providerReference,
            {
              verificationStatus:
                "submitted",
              isActive: false,
              isSuspended: false,
              updatedAt:
                serverTimestamp(),
            },
          );

          transaction.update(
            db
              .collection("users")
              .doc(authenticatedUser.uid),
            {
              verificationStatus: "pending",
              updatedAt: serverTimestamp(),
            },
          );

          const auditLogReference = writeAuditLogInTransaction(
            transaction,
            {
              actorId:
                authenticatedUser.uid,
              actorRole:
                USER_ROLES.provider,
              action:
                "provider_verification_submitted",
              targetCollection:
                "providerVerifications",
              targetId:
                verificationDocument.id,
              source:
                "cloud_function",
              before: {
                status: currentStatus,
              },
              after: {
                status: "submitted",
              },
              metadata: {
                providerId,
                requiredDocumentCount:
                  policy.requiredAll.length +
                  policy.requiredOneOf.length,
              },
            },
          );
          writeVerificationHistoryInTransaction(transaction, {
            verificationId: verificationDocument.id,
            providerId,
            actorId: authenticatedUser.uid,
            actorRole: USER_ROLES.provider,
            eventType: "verification_submitted",
            fromStatus: currentStatus,
            toStatus: "submitted",
            auditLogId: auditLogReference.id,
          });

          createNotificationInTransaction(
            transaction,
            {
              userId: authenticatedUser.uid,
              title: "Provider verification submitted",
              message:
                "Your provider verification was submitted to FEASTA for review.",
              type: "verification",
              relatedId: verificationDocument.id,
              relatedCollection: "providerVerifications",
              metadata: {
                providerId,
                status: "submitted",
              },
            },
          );

          return {
            providerId,
            verificationId:
              verificationDocument.id,
            previousStatus:
              currentStatus,
            status: "submitted",
            alreadySubmitted: false,
          };
        },
      );

      logInfo(
        result.alreadySubmitted
          ? "Provider verification submission replayed"
          : "Provider verification submitted",
        {
          uid: authenticatedUser.uid,
          providerId:
            result.providerId,
          verificationId:
            result.verificationId,
        },
      );
      logSecurityEvent({
        action: "provider_verification_submission",
        outcome: result.alreadySubmitted ? "replayed" : "succeeded",
        actorUid: authenticatedUser.uid,
        targetId: result.verificationId,
        correlationId: authenticatedUser.correlationId,
        metadata: {providerId: result.providerId},
      });

      const response = {
        success: true,
        ...result,
      };
      await completeIdempotentOperation({
        key: idempotencyKey,
        operation: "submitProviderVerification",
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
        "Provider verification submission failed",
        error,
        {
          uid: authenticatedUser.uid,
          providerId,
        },
      );

      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "The provider verification could not be submitted.",
      );
    }
  },
);

async function assertRequiredStorageObjectsPresent(
  providerId: string,
  documents: readonly Record<string, unknown>[],
): Promise<void> {
  try {
    await Promise.all(documents.map(async (document) => {
      const documentType = document.documentType;
      const storagePath = document.storagePath;
      if (
        typeof documentType !== "string" ||
        typeof storagePath !== "string" ||
        !storagePath.startsWith(
          `providers/${providerId}/verification/${documentType}/`,
        )
      ) {
        throw new Error("invalid_document_path");
      }
      const [metadata] = await getStorage()
        .bucket()
        .file(storagePath)
        .getMetadata();
      const size = Number(metadata.size);
      if (
        !VERIFICATION_DOCUMENT_CONTENT_TYPES.includes(
          String(metadata.contentType) as
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
      "A required verification document is missing or invalid. Upload it again before submitting.",
    );
  }
}
