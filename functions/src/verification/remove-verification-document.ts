import {getStorage} from "firebase-admin/storage";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  USER_ROLES,
  VERIFICATION_DOCUMENT_TYPES,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {logError, logInfo} from "../shared/logger.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {
  requireEnum,
  requireObject,
  requireString,
} from "../shared/validation.js";
import {writeVerificationHistoryInTransaction} from "../shared/verification-history.js";

const EDITABLE_STATUSES = new Set(["draft", "resubmission_required"]);

export const removeVerificationDocument = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "removeVerificationDocument",
      limit: 20,
      windowSeconds: 10 * 60,
    });

    const input = requireObject(request.data);
    const unknownFields = Object.keys(input).filter(
      (field) => !["verificationId", "documentType"].includes(field),
    );
    if (unknownFields.length > 0) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown document fields: ${unknownFields.join(", ")}.`,
      );
    }
    const verificationId = requireString(
      input.verificationId,
      "verificationId",
      {minLength: 1, maxLength: 128},
    );
    const documentType = requireEnum(
      input.documentType,
      "documentType",
      VERIFICATION_DOCUMENT_TYPES,
    );
    const verificationReference = db.collection("providerVerifications")
      .doc(verificationId);
    const documentReference = verificationReference.collection("documents")
      .doc(documentType);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const [verificationSnapshot, documentSnapshot] =
          await transaction.getAll(verificationReference, documentReference);
        if (!verificationSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "Provider verification was not found.",
          );
        }
        const verification = verificationSnapshot.data() ?? {};
        if (
          verification.ownerId !== actor.uid ||
          typeof verification.providerId !== "string"
        ) {
          throw new HttpsError(
            "permission-denied",
            "You do not own this provider verification.",
          );
        }
        if (!EDITABLE_STATUSES.has(String(verification.status))) {
          throw new HttpsError(
            "failed-precondition",
            "Documents cannot be removed in the current verification status.",
          );
        }
        if (!documentSnapshot.exists) {
          return {
            providerId: verification.providerId,
            storagePath: null,
            removed: false,
          };
        }
        const document = documentSnapshot.data() ?? {};
        if (
          document.ownerId !== actor.uid ||
          document.providerId !== verification.providerId ||
          document.documentType !== documentType
        ) {
          throw new HttpsError(
            "permission-denied",
            "The verification document ownership is invalid.",
          );
        }
        const storagePath = typeof document.storagePath === "string"
          ? document.storagePath
          : null;
        transaction.delete(documentReference);
        transaction.update(verificationReference, {
          updatedAt: serverTimestamp(),
        });
        const auditLogReference = writeAuditLogInTransaction(transaction, {
          actorId: actor.uid,
          actorRole: USER_ROLES.provider,
          action: "provider_verification_document_removed",
          targetCollection: "providerVerifications",
          targetId: verificationId,
          source: "cloud_function",
          before: {
            documentType,
            status: document.status ?? null,
          },
          after: null,
          metadata: {
            providerId: verification.providerId,
            documentId: documentReference.id,
          },
        });
        writeVerificationHistoryInTransaction(transaction, {
          verificationId,
          providerId: verification.providerId,
          actorId: actor.uid,
          actorRole: USER_ROLES.provider,
          eventType: "document_removed",
          documentType,
          documentStatus:
            typeof document.status === "string" ? document.status : null,
          auditLogId: auditLogReference.id,
        });
        return {
          providerId: verification.providerId,
          storagePath,
          removed: true,
        };
      });

      if (result.storagePath) {
        await getStorage().bucket().file(result.storagePath)
          .delete({ignoreNotFound: true});
      }
      logInfo("Verification document removed", {
        uid: actor.uid,
        verificationId,
        providerId: result.providerId,
        documentType,
        removed: result.removed,
      });
      return {
        success: true,
        verificationId,
        providerId: result.providerId,
        documentType,
        removed: result.removed,
      };
    } catch (error) {
      logError("Verification document removal failed", error, {
        uid: actor.uid,
        verificationId,
        documentType,
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "The verification document could not be removed.",
      );
    }
  },
);
