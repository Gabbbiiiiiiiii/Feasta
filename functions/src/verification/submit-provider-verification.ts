import {HttpsError, onCall} from "firebase-functions/v2/https";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  REQUIRED_VERIFICATION_DOCUMENT_TYPES,
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
import {serverTimestamp} from "../shared/timestamps.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {logSecurityEvent} from "../shared/security-events.js";
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
          const providerSnapshot =
            await transaction.get(
              providerReference,
            );

          if (!providerSnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "Provider profile was not found.",
            );
          }

          const providerData =
            providerSnapshot.data();

          if (
            providerData?.ownerId !==
            authenticatedUser.uid
          ) {
            throw new HttpsError(
              "permission-denied",
              "You do not own this provider profile.",
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
            !SUBMITTABLE_STATUSES.includes(
              currentStatus,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "This verification cannot be submitted from its current status.",
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

          const uploadedDocumentTypes = new Set(
            documentsSnapshot.docs.map((document) => {
              const type = document.data().documentType;

              return typeof type === "string"
                ? type
                : "";
            }),
          );

          const missingDocumentTypes =
            REQUIRED_VERIFICATION_DOCUMENT_TYPES.filter(
              (type) => !uploadedDocumentTypes.has(type),
            );

          if (missingDocumentTypes.length > 0) {
            throw new HttpsError(
              "failed-precondition",
              "Upload all required verification documents before submitting.",
              {
                missingDocumentTypes,
              },
            );
          }

          const requiredDocuments =
            documentsSnapshot.docs.filter(
              (document) => {
                const type = document.data().documentType;

                return (
                  typeof type === "string" &&
                  REQUIRED_VERIFICATION_DOCUMENT_TYPES.includes(
                    type as
                      (typeof REQUIRED_VERIFICATION_DOCUMENT_TYPES)[number],
                  )
                );
              },
            );

          const incompleteRequiredDocuments =
            requiredDocuments.filter(
              (document) => {
                const data =
                  document.data();

                const storagePath =
                  typeof data.storagePath ===
                    "string"
                    ? data.storagePath.trim()
                    : "";

                return (
                  storagePath.length === 0 ||
                  data.status !== "pending"
                );
              },
            );

          if (incompleteRequiredDocuments.length > 0) {
            throw new HttpsError(
              "failed-precondition",
              "Complete all required verification documents before submitting.",
              {
                incompleteDocumentIds:
                  incompleteRequiredDocuments.map(
                    (document) => document.id,
                  ),
              },
            );
          }

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

          writeAuditLogInTransaction(
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
                  requiredDocuments.length,
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
          };
        },
      );

      logInfo(
        "Provider verification submitted",
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
        outcome: "succeeded",
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
