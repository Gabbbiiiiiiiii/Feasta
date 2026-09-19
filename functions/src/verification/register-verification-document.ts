import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {getStorage} from "firebase-admin/storage";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  MAX_VERIFICATION_DOCUMENT_SIZE_BYTES,
  providerVerificationDocumentPolicy,
  USER_ROLES,
  VERIFICATION_DOCUMENT_CONTENT_TYPES,
  VERIFICATION_DOCUMENT_TYPES,
  verificationDocumentRequirement,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {
  logError,
  logInfo,
} from "../shared/logger.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {
  requireEnum,
  requireObject,
  requireString,
} from "../shared/validation.js";
import {writeVerificationHistoryInTransaction} from "../shared/verification-history.js";

const EDITABLE_VERIFICATION_STATUSES =
  new Set([
    "draft",
    "resubmission_required",
  ]);

export const registerVerificationDocument =
  onCall(
    appCheckCallableOptions,
    async (request) => {
      const authenticatedUser =
        requireAuth(request);

      await enforceCallableRateLimit(request, {
        scope: "registerVerificationDocument",
        limit: 30,
        windowSeconds: 10 * 60,
      });

      try {
        // requireRole also verifies that the provider account is active.
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

      const input =
        requireObject(request.data);

      rejectUnknownFields(input, [
        "verificationId",
        "documentType",
        "displayName",
        "storagePath",
        "originalFileName",
      ]);

      const verificationId =
        requireString(
          input.verificationId,
          "verificationId",
          {
            minLength: 1,
            maxLength: 128,
          },
        );

      const documentType =
        requireEnum(
          input.documentType,
          "documentType",
          VERIFICATION_DOCUMENT_TYPES,
        );

      requireString(
          input.displayName,
          "displayName",
          {
            minLength: 2,
            maxLength: 120,
          },
        );
      const displayName = documentLabel(documentType);

      const storagePath =
        requireString(
          input.storagePath,
          "storagePath",
          {
            minLength: 5,
            maxLength: 500,
          },
        );

      const originalFileName =
        requireString(
          input.originalFileName,
          "originalFileName",
          {
            minLength: 1,
            maxLength: 255,
          },
        );

      const verificationReference =
        db
          .collection(
            "providerVerifications",
          )
          .doc(verificationId);

      try {
        /*
         * Load ownership data before validating the
         * provider-specific Storage path.
         */
        const verificationSnapshot =
          await verificationReference.get();

        if (
          !verificationSnapshot.exists
        ) {
          throw new HttpsError(
            "not-found",
            "Provider verification was not found.",
          );
        }

        const verificationData =
          verificationSnapshot.data();

        const providerId =
          typeof verificationData
            ?.providerId === "string"
            ? verificationData
                .providerId
                .trim()
            : "";

        if (providerId.length === 0) {
          throw new HttpsError(
            "failed-precondition",
            "The verification has no valid provider reference.",
          );
        }

        const providerReference =
          db
            .collection("providers")
            .doc(providerId);

        const providerSnapshot =
          await providerReference.get();

        if (
          !providerSnapshot.exists
        ) {
          throw new HttpsError(
            "not-found",
            "Provider profile was not found.",
          );
        }

        if (
          providerSnapshot.data()
            ?.ownerId !==
          authenticatedUser.uid
        ) {
          throw new HttpsError(
            "permission-denied",
            "You do not own this provider verification.",
          );
        }

        const expectedPathPrefix =
          `providers/${providerId}/verification/`;

        if (
          !storagePath.startsWith(
            expectedPathPrefix,
          )
        ) {
          throw new HttpsError(
            "invalid-argument",
            "The verification file is stored in an invalid location.",
          );
        }

        /*
         * Require the document type in the path so
         * a provider cannot register an unrelated file.
         *
         * Expected example:
         * providers/{providerId}/verification/
         * business_permit/{unique-file-name}.pdf
         */
        const expectedTypePrefix =
          `${expectedPathPrefix}${documentType}/`;

        if (
          !storagePath.startsWith(
            expectedTypePrefix,
          )
        ) {
          throw new HttpsError(
            "invalid-argument",
            "The verification file path does not match its document type.",
          );
        }

        const uniqueFileName = storagePath.slice(expectedTypePrefix.length);
        if (
          uniqueFileName.length === 0 ||
          uniqueFileName.includes("/") ||
          uniqueFileName === "." ||
          uniqueFileName === ".."
        ) {
          throw new HttpsError(
            "invalid-argument",
            "The verification file path must contain one unique file name.",
          );
        }
        const providerData = providerSnapshot.data() ?? {};
        const policy = providerVerificationDocumentPolicy(providerData);
        const requirement = verificationDocumentRequirement(
          documentType,
          policy,
        );

        /*
         * Confirm that the file exists in Storage and
         * its actual metadata matches the callable input.
         */
        const file = getStorage()
          .bucket()
          .file(storagePath);

        const [fileExists] =
          await file.exists();

        if (!fileExists) {
          throw new HttpsError(
            "failed-precondition",
            "The uploaded verification file was not found in Storage.",
          );
        }

        const [metadata] =
          await file.getMetadata();

        const actualContentType =
          metadata.contentType ?? "";

        const actualFileSize =
          Number(metadata.size ?? 0);

        if (!(VERIFICATION_DOCUMENT_CONTENT_TYPES as readonly string[])
          .includes(actualContentType)) {
          throw new HttpsError(
            "failed-precondition",
            "The uploaded file type is not allowed.",
          );
        }

        if (
          !Number.isFinite(
            actualFileSize,
          ) ||
          actualFileSize <= 0 ||
          actualFileSize >
            MAX_VERIFICATION_DOCUMENT_SIZE_BYTES
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The uploaded file size is invalid or exceeds 10 MB.",
          );
        }
        if (!fileNameMatchesContentType(uniqueFileName, actualContentType)) {
          throw new HttpsError(
            "failed-precondition",
            "The uploaded file extension does not match its content type.",
          );
        }

        const result =
          await db.runTransaction(
            async (transaction) => {
              const currentVerificationSnapshot =
                await transaction.get(
                  verificationReference,
                );

              if (
                !currentVerificationSnapshot
                  .exists
              ) {
                throw new HttpsError(
                  "not-found",
                  "Provider verification was not found.",
                );
              }

              const currentVerificationData =
                currentVerificationSnapshot
                  .data();

              if (
                currentVerificationData
                  ?.providerId !==
                providerId
              ) {
                throw new HttpsError(
                  "failed-precondition",
                  "The verification provider reference changed.",
                );
              }

              const currentStatus =
                typeof currentVerificationData
                  ?.status === "string"
                  ? currentVerificationData
                      .status
                  : "";

              if (
                !EDITABLE_VERIFICATION_STATUSES
                  .has(currentStatus)
              ) {
                throw new HttpsError(
                  "failed-precondition",
                  "Documents cannot be changed in the current verification status.",
                );
              }

              const currentProviderSnapshot =
                await transaction.get(
                  providerReference,
                );

              if (
                !currentProviderSnapshot
                  .exists ||
                currentProviderSnapshot
                  .data()?.ownerId !==
                  authenticatedUser.uid
              ) {
                throw new HttpsError(
                  "permission-denied",
                  "You do not own this provider verification.",
                );
              }

              const documentReference =
                verificationReference
                  .collection(
                    "documents",
                  )
                  .doc(documentType);

              const existingDocument =
                await transaction.get(
                  documentReference,
                );

              const previousData =
                existingDocument.exists
                  ? existingDocument.data()
                  : null;

              const isRequired = requirement !== "optional";

              if (
                existingDocument.exists &&
                previousData?.storagePath === storagePath &&
                previousData?.displayName === displayName &&
                previousData?.originalFileName === originalFileName &&
                previousData?.contentType === actualContentType &&
                previousData?.fileSize === actualFileSize &&
                previousData?.status === "pending"
              ) {
                return {
                  verificationId,
                  providerId,
                  documentId: documentReference.id,
                  documentType,
                  storagePath,
                  isRequired,
                  requirement,
                  replaced: false,
                  idempotentReplay: true,
                  previousStoragePath: null,
                };
              }

              transaction.set(
                documentReference,
                {
                  verificationId,
                  providerId,
                  ownerId:
                    authenticatedUser.uid,

                  documentType,
                  displayName,
                  isRequired,

                  storagePath,
                  originalFileName,
                  contentType:
                    actualContentType,
                  fileSize:
                    actualFileSize,

                  status: "pending",
                  rejectionReason: null,
                  verifiedAt: null,
                  verifiedBy: null,

                  createdAt:
                    previousData
                      ?.createdAt ??
                    serverTimestamp(),
                  updatedAt:
                    serverTimestamp(),
                },
                {
                  merge: true,
                },
              );

              transaction.update(
                verificationReference,
                {
                  updatedAt:
                    serverTimestamp(),
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
                    existingDocument
                      .exists
                      ? "provider_verification_document_replaced"
                      : "provider_verification_document_registered",
                  targetCollection:
                    "providerVerifications",
                  targetId:
                    verificationId,
                  source:
                    "cloud_function",
                  before:
                    previousData
                      ? {
                          documentType:
                            previousData
                              .documentType,
                          status:
                            previousData
                              .status,
                        }
                      : null,
                  after: {
                    documentType,
                    status:
                      "pending",
                    isRequired,
                  },
                  metadata: {
                    providerId,
                    documentId:
                      documentReference.id,
                    contentType:
                      actualContentType,
                    fileSize:
                      actualFileSize,
                  },
                },
              );

              writeVerificationHistoryInTransaction(transaction, {
                verificationId,
                providerId,
                actorId: authenticatedUser.uid,
                actorRole: USER_ROLES.provider,
                eventType: existingDocument.exists ?
                  "document_replaced" :
                  "document_uploaded",
                documentType,
                documentStatus: "pending",
                auditLogId: auditLogReference.id,
                metadata: {
                  replaced: existingDocument.exists,
                  previousStatus:
                    typeof previousData?.status === "string" ?
                      previousData.status :
                      null,
                },
              });

              return {
                verificationId,
                providerId,
                documentId:
                  documentReference.id,
                documentType,
                storagePath,
                isRequired,
                requirement,
                replaced:
                  existingDocument
                    .exists,
                idempotentReplay: false,
                previousStoragePath:
                  typeof previousData?.storagePath === "string"
                    ? previousData.storagePath
                    : null,
                };
            },
          );

        if (
          typeof result.previousStoragePath === "string" &&
          result.previousStoragePath !== storagePath
        ) {
          await getStorage().bucket().file(result.previousStoragePath)
            .delete({ignoreNotFound: true})
            .catch((error) => {
              logError(
                "Obsolete verification object cleanup failed",
                error,
                {
                  uid: authenticatedUser.uid,
                  verificationId,
                  documentType,
                },
              );
            });
        }

        logInfo(
          "Verification document registered",
          {
            uid:
              authenticatedUser.uid,
            verificationId,
            providerId:
              result.providerId,
            documentId:
              result.documentId,
            documentType,
            replaced:
              result.replaced,
          },
        );

        return {
          success: true,
          verificationId: result.verificationId,
          providerId: result.providerId,
          documentId: result.documentId,
          documentType: result.documentType,
          storagePath: result.storagePath,
          isRequired: result.isRequired,
          requirement: result.requirement,
          replaced: result.replaced,
          idempotentReplay: result.idempotentReplay,
        };
      } catch (error) {
        logError(
          "Verification document registration failed",
          error,
          {
            uid:
              authenticatedUser.uid,
            verificationId,
            documentType,
          },
        );

        if (
          error instanceof
          HttpsError
        ) {
          throw error;
        }

        throw new HttpsError(
          "internal",
          "The verification document could not be registered.",
        );
      }
    },
  );

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const unknownFields = Object.keys(input)
    .filter((field) => !allowedFields.includes(field));

  if (unknownFields.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unknown document fields: ${unknownFields.join(", ")}.`,
    );
  }
}

function documentLabel(
  type: (typeof VERIFICATION_DOCUMENT_TYPES)[number],
): string {
  const labels: Record<(typeof VERIFICATION_DOCUMENT_TYPES)[number], string> = {
    business_permit: "Business permit",
    dti_registration: "DTI or SEC registration",
    bir_registration: "BIR documentation",
    valid_id: "Valid government ID",
    sanitary_permit: "Sanitary permit",
    mayors_permit: "Mayor's permit",
    other: "Other supporting document",
  };
  return labels[type];
}

function fileNameMatchesContentType(
  fileName: string,
  contentType: string,
): boolean {
  const patterns: Readonly<Record<string, RegExp>> = {
    "application/pdf": /\.pdf$/iu,
    "image/jpeg": /\.jpe?g$/iu,
    "image/png": /\.png$/iu,
    "image/webp": /\.webp$/iu,
  };
  return patterns[contentType]?.test(fileName) === true;
}
