"use client";


type DocumentCatalogItem = {
  code: string;
  name: string;
};
import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";

import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {customerAuthenticationError} from "@/lib/auth/error-messages";
import {
  removeVerificationDocument,
  submitProviderVerification,
  uploadVerificationDocument,
} from "@/lib/auth/provider-client";

type VerificationDocumentSummary = {
  id: string;
  documentType: string;
  status: string;
  displayName: string;
  isRequired: boolean;
  requirement: string;
  fileSize: number | null;
};

type PendingDocumentUpload = {
  fileName: string;
  fileSize: number;
  previewUrl: string;
  isImage: boolean;
  progress: number;
  status: "uploading" | "uploaded" | "failed";
};

export function ProviderVerificationActions({
  providerId,
  verificationId,
  canSubmit,
  editable = true,
  documents = [],
  policy = {
    requiredAll: [],
    requiredOneOf: [],
  },
  documentCatalog = [],
  consent,
  reviewMode = false,
}: {
  providerId: string;
  verificationId: string;
  canSubmit: boolean;
  editable?: boolean;
  documents?: VerificationDocumentSummary[];
  policy?: {
    requiredAll: readonly string[];
    requiredOneOf: readonly (readonly string[])[];
  };
  documentCatalog?: readonly DocumentCatalogItem[];
  consent?: {
    termsPolicyVersion: string;
    privacyPolicyVersion: string;
    termsAccepted: boolean;
    privacyAccepted: boolean;
  };
  reviewMode?: boolean;
}) {
  const router = useRouter();
  const consentReady = consent == null ||
    (consent.termsAccepted && consent.privacyAccepted);
  const busy = useRef(false);
  const activeUploads = useRef(new Set<string>());
  const previewUrls = useRef(new Set<string>());
  const refreshAfterUploads = useRef(false);
  const [uploads, setUploads] = useState<Record<string, PendingDocumentUpload>>({});

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const requiredDefinitions = documentCatalog.filter((definition) =>
    policy.requiredAll.includes(definition.code) ||
    policy.requiredOneOf.some((group) => group.includes(definition.code)),
  );

  const optionalDefinitions = documentCatalog.filter((definition) =>
    !policy.requiredAll.includes(definition.code) &&
    !policy.requiredOneOf.some((group) => group.includes(definition.code)),
  );

  const requiredRequirementCount =
    policy.requiredAll.length + policy.requiredOneOf.length;
  const registeredTypes = new Set(documents.map((document) => document.documentType));
  const requiredUploadedCount =
    policy.requiredAll.filter((type) => registeredTypes.has(type)).length +
    policy.requiredOneOf.filter((group) =>
      group.some((type) => registeredTypes.has(type)),
    ).length;

  const submitKey = useRef(globalThis.crypto.randomUUID());
  const [action, setAction] = useState<"remove" | "submit" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasActiveUploads = Object.values(uploads).some(
    (upload) => upload.status === "uploading",
  );

  async function uploadDocument(documentType: string, file: File) {
    if (
      !editable || reviewMode || busy.current ||
      activeUploads.current.has(documentType)
    ) return;

    activeUploads.current.add(documentType);
    const previewUrl = URL.createObjectURL(file);
    previewUrls.current.add(previewUrl);
    setUploads((previous) => ({
      ...previous,
      [documentType]: {
        fileName: file.name,
        fileSize: file.size,
        previewUrl,
        isImage: file.type.startsWith("image/"),
        progress: 0,
        status: "uploading",
      },
    }));
    setError(null);
    setMessage(null);

    try {
      await uploadVerificationDocument({
        providerId,
        verificationId,
        documentType,
        file,
        onProgress: (progress) => {
          setUploads((previous) => {
            const current = previous[documentType];
            if (!current || current.previewUrl !== previewUrl) return previous;
            return {
              ...previous,
              [documentType]: {...current, progress},
            };
          });
        },
      });
      refreshAfterUploads.current = true;
      setUploads((previous) => ({
        ...previous,
        [documentType]: {
          ...previous[documentType],
          progress: 100,
          status: "uploaded",
        },
      }));
      setMessage(`${file.name} uploaded successfully.`);
    } catch (caught) {
      setUploads((previous) => ({
        ...previous,
        [documentType]: {
          ...previous[documentType],
          status: "failed",
        },
      }));
      setError(`${file.name}: ${customerAuthenticationError(caught)}`);
    } finally {
      activeUploads.current.delete(documentType);
      if (activeUploads.current.size === 0 && refreshAfterUploads.current) {
        refreshAfterUploads.current = false;
        router.refresh();
      }
    }
  }

  async function remove(document: VerificationDocumentSummary) {
    if (busy.current || activeUploads.current.size > 0 || !editable) return;
    busy.current = true;
    setAction("remove");
    setError(null);
    setMessage(null);
    try {
      await removeVerificationDocument({
        verificationId,
        documentType: document.documentType,
      });
      setMessage(`${document.displayName} was removed.`);
      router.refresh();
    } catch (caught) {
      setError(customerAuthenticationError(caught));
    } finally {
      busy.current = false;
      setAction(null);
    }
  }

  async function submit() {
    if (busy.current || activeUploads.current.size > 0 || !canSubmit) return;
    busy.current = true;
    setAction("submit");
    setError(null);
    try {
      await submitProviderVerification(providerId, submitKey.current);
      router.replace("/provider/status");
      router.refresh();
    } catch (caught) {
      const details =
        typeof caught === "object" && caught !== null &&
        "details" in caught
          ? caught.details
          : null;

      const invalidFields =
        typeof details === "object" && details !== null &&
        "missingOrInvalidProfileFields" in details &&
        Array.isArray(details.missingOrInvalidProfileFields)
          ? details.missingOrInvalidProfileFields
          : [];

      if (invalidFields.includes("guestCapacity")) {
        setError(
          "Your saved guest capacity does not match your selected services. " +
          "Please review Capacity and Schedule before submitting.",
        );
      } else {
        setError(customerAuthenticationError(caught));
      }
    } finally {
      busy.current = false;
      setAction(null);
    }
  }

  return (
    <section className="grid gap-5 rounded-card border border-border bg-card p-5 shadow-card" aria-labelledby="verification-upload-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="verification-upload-title" className="text-xl font-bold">
            {reviewMode ? "Review and submit" : "Verification documents"}
          </h2>

          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {reviewMode
              ? "Review your uploaded documents carefully before submitting them to FEASTA. If something is incorrect, go back and replace it before submission."
              : "Your requirements are based on your business registration status and selected services. Upload PDF, JPEG, PNG, or WebP files up to 10 MB each. Files are private to you and FEASTA administrators."}
          </p>
        </div>

        {!reviewMode ? (
          <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
            <span className="font-bold text-foreground">
              {requiredUploadedCount} of {requiredRequirementCount}
            </span>{" "}
            <span className="text-muted-foreground">uploaded</span>
          </div>
        ) : null}
      </div>
      <div className="grid gap-6" aria-label="Verification document status">
        <DocumentSection
          verificationId={verificationId}
          title="Required documents"
          description="Complete these requirements before reviewing and submitting your provider application."
          definitions={requiredDefinitions}
          documents={documents}
          policy={policy}
          editable={editable}
          reviewMode={reviewMode}
          action={action}
          uploads={uploads}
          hasActiveUploads={hasActiveUploads}
          onUpload={uploadDocument}
          onRemove={remove}
        />

        <DocumentSection
          verificationId={verificationId}
          title="Optional supporting documents"
          description="These are not currently required. Add them only when they help FEASTA review your provider account."
          definitions={optionalDefinitions}
          documents={documents}
          policy={policy}
          editable={editable}
          reviewMode={reviewMode}
          action={action}
          uploads={uploads}
          hasActiveUploads={hasActiveUploads}
          onUpload={uploadDocument}
          onRemove={remove}
        />
      </div>
      {!editable ? (
        <AuthStatus
          tone="info"
          message="Documents are locked while submitted or under review. FEASTA must explicitly reopen the verification before changes are allowed."
        />
      ) : null}
      {!consentReady ? (
        <AuthStatus
          tone="error"
          message="Required Terms and Privacy Policy acceptance is not recorded. Return to provider setup or contact FEASTA support before submitting."
        />
      ) : null}
      {reviewMode ? (
        <AuthStatus
          tone="info"
          message="FEASTA manually reviews provider applications to help keep the platform trustworthy. Complete applications are typically reviewed within 1–3 business days. Applications requiring additional information may take longer. We will notify you when your application is approved or if additional information is required."
        />
      ) : null}
      {message ? <AuthStatus message={message} tone="success" /> : null}
      {error ? <AuthStatus message={error} tone="error" /> : null}
      <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        {reviewMode ? (
          <Button
            type="button"
            variant="secondary"
            disabled={action !== null || hasActiveUploads}
            onClick={() =>
              router.replace(
                "/provider/verification?stage=documents",
              )
            }
            className="w-full sm:w-auto"
          >
            Back to documents
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={action !== null || hasActiveUploads}
            onClick={() => {
              // The provider may have visited Step 6 before the
              // canonical provider profile existed. Load the route
              // from the server so an old registration-mode RSC
              // entry cannot be reused from the client router cache.
              window.location.assign(
                "/provider/onboarding/consent",
              );
            }}
            className="w-full sm:w-auto"
          >
            Back
          </Button>
        )}

        {!canSubmit ? (
          <p className="text-sm leading-6 text-muted-foreground sm:text-center">
            {consentReady
              ? "Complete every required document and one document from each alternative group before continuing."
              : "Record the required Terms and Privacy Policy acceptance before continuing."}
          </p>
        ) : (
          <span
            aria-hidden="true"
            className="hidden sm:block"
          />
        )}

        {reviewMode ? (
          <Button
            type="button"
            loading={action === "submit"}
            loadingLabel="Submitting"
            disabled={
              !canSubmit ||
              action !== null ||
              hasActiveUploads
            }
            onClick={() =>
              void submit()
            }
            className="w-full sm:w-auto"
          >
            Submit for admin review
          </Button>
        ) : (
          <Button
            type="button"
            disabled={
              !canSubmit ||
              action !== null ||
              hasActiveUploads
            }
            onClick={() =>
              router.replace(
                "/provider/verification?stage=review",
              )
            }
            className="w-full sm:w-auto"
          >
            Review application
          </Button>
        )}
      </div>
    </section>
  );
}

function DocumentSection({
  verificationId,
  title,
  description,
  definitions,
  documents,
  policy,
  editable,
  reviewMode,
  action,
  uploads,
  hasActiveUploads,
  onUpload,
  onRemove,
}: {
  verificationId: string;
  title: string;
  description: string;
  definitions: readonly DocumentCatalogItem[];
  documents: VerificationDocumentSummary[];
  policy: {
    requiredAll: readonly string[];
    requiredOneOf: readonly (readonly string[])[];
  };
  editable: boolean;
  reviewMode: boolean;
  action: "remove" | "submit" | null;
  uploads: Record<string, PendingDocumentUpload>;
  hasActiveUploads: boolean;
  onUpload: (type: string, file: File) => Promise<void>;
  onRemove: (document: VerificationDocumentSummary) => Promise<void>;
}) {
  if (definitions.length === 0) return null;

  return (
    <section className="grid gap-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="grid gap-3">
        {definitions.map((definition) => {
          const document = documents.find(
            (candidate) => candidate.documentType === definition.code,
          );

          const upload = uploads[definition.code];
          const pickerId = `verification-file-${verificationId}-${definition.code}`;
          const previewUrl = document
            ? `/api/provider/verifications/${encodeURIComponent(
                verificationId,
              )}/documents/${encodeURIComponent(document.id)}`
            : null;

          return (
            <article
              key={definition.code}
              className="grid min-w-0 gap-3 rounded-lg border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <h4 className="font-semibold">{definition.name}</h4>

                <p className="text-sm text-muted-foreground">
                  {requirementDescription(definition.code, policy, definitions)}
                  {document?.fileSize != null
                    ? ` · ${formatFileSize(document.fileSize)}`
                    : ""}
                </p>

                {upload ? (
                  <div className="mt-2 flex min-w-0 items-center gap-3 rounded-md bg-muted/40 p-2">
                    {upload.isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={upload.previewUrl}
                        alt={`Selected ${definition.name}`}
                        className="h-12 w-12 shrink-0 rounded border border-border object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border text-xs font-semibold"
                      >
                        PDF
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium" title={upload.fileName}>
                        {upload.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(upload.fileSize)} · {upload.status === "uploading"
                          ? `Uploading ${upload.progress}%`
                          : upload.status === "failed" ? "Upload failed" : "Uploaded"}
                      </p>
                    </div>
                    <a
                      href={upload.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Preview
                    </a>
                  </div>
                ) : document ? (
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-muted/40 text-[10px] font-semibold"
                    >
                      FILE
                    </span>
                    <p className="min-w-0 break-all text-xs text-muted-foreground">
                      {document.displayName}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {upload?.status === "uploading" ? (
                  <span role="status" className="text-sm font-medium text-primary">
                    Uploading {upload.progress}%
                  </span>
                ) : upload?.status === "failed" ? (
                  <span role="status" className="text-sm font-medium text-destructive">
                    Upload failed
                  </span>
                ) : upload?.status === "uploaded" ? (
                  <span role="status" className="text-sm font-medium text-primary">
                    Uploaded
                  </span>
                ) : (
                  <StatusBadge
                    status={document?.status ?? "missing"}
                    label={document ? undefined : "Not uploaded"}
                  />
                )}

                {document && previewUrl && !upload ? (
                  <Button
                    variant="secondary"
                    size="compact"
                    asChild
                  >
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview
                    </a>
                  </Button>
                ) : null}

                {editable && !reviewMode ? (
                  <>
                    <input
                      id={pickerId}
                      type="file"
                      className="sr-only"
                      aria-label={`Select ${definition.name} file`}
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      disabled={action !== null || upload?.status === "uploading"}
                      onChange={(event) => {
                        const chosen = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (chosen) void onUpload(definition.code, chosen);
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      disabled={action !== null || upload?.status === "uploading"}
                      onClick={() => globalThis.document.getElementById(pickerId)?.click()}
                    >
                      {upload?.status === "failed" ? "Try again" :
                        document || upload?.status === "uploaded" ? "Replace" : "Upload file"}
                    </Button>
                  </>
                ) : null}

                {document && editable && !reviewMode ? (
                  <>
                    <ConfirmationDialog
                      title={`Remove ${document.displayName}?`}
                      description="The private file and its registration will be removed. You must upload it again if the policy requires it."
                      destructive
                      confirmLabel="Remove document"
                      loading={action === "remove"}
                      onConfirm={() => onRemove(document)}
                      trigger={(
                        <Button
                          variant="destructive"
                          size="compact"
                          disabled={action !== null || hasActiveUploads}
                        >
                          Remove
                        </Button>
                      )}
                    />
                  </>
                ) : null}
              </div>
              {upload?.status === "uploading" ? (
                <progress
                  className="h-2 w-full accent-primary sm:col-span-2"
                  aria-label={`${definition.name} upload progress`}
                  max={100}
                  value={upload.progress}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function requirementDescription(
  type: string,
  policy: {
    requiredAll: readonly string[];
    requiredOneOf: readonly (readonly string[])[];
  },
  catalog: readonly DocumentCatalogItem[],
): string {
  if (policy.requiredAll.includes(type)) return "Required for your current verification profile";
  const alternative = policy.requiredOneOf.find((group) => group.includes(type));
  if (alternative) {
    return `One required: ${alternative.map((code) =>
      catalog.find((item) => item.code === code)?.name ?? code
    ).join(" or ")}`;
  }
  return "Optional supporting document";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
