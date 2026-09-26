"use client";

import {
  PROVIDER_VERIFICATION_DOCUMENT_DEFINITIONS,
  type VerificationDocumentType,
} from "@feasta/shared-types";
import {FormEvent, useRef, useState} from "react";
import {useRouter} from "next/navigation";

import {FormField} from "@/components/forms/form-field";
import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
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

export function ProviderVerificationActions({
  providerId,
  verificationId,
  canSubmit,
  editable = true,
  documents = [],
  policy = {
    requiredAll: ["business_permit", "dti_registration", "bir_registration", "valid_id"],
    requiredOneOf: [],
  },
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
  const documentFileInputRef = useRef<HTMLInputElement>(null);

  const requiredDefinitions =
    PROVIDER_VERIFICATION_DOCUMENT_DEFINITIONS.filter(
      (definition) =>
        policy.requiredAll.includes(definition.type) ||
        policy.requiredOneOf.some((group) =>
          group.includes(definition.type),
        ),
    );

  const optionalDefinitions =
    PROVIDER_VERIFICATION_DOCUMENT_DEFINITIONS.filter(
      (definition) =>
        !policy.requiredAll.includes(definition.type) &&
        !policy.requiredOneOf.some((group) =>
          group.includes(definition.type),
        ),
    );

  const initialDocumentType =
    requiredDefinitions[0]?.type ?? "valid_id";

  const requiredRequirementCount =
    policy.requiredAll.length + policy.requiredOneOf.length;

  function prepareDocumentReplacement(
    nextDocumentType: VerificationDocumentType,
  ) {
    setDocumentType(nextDocumentType);
    setFile(null);

    const input = documentFileInputRef.current;

    if (input) {
      input.value = "";

      // Replace should behave like a file action, not a navigation
      // hint. Open the system file picker immediately.
      input.click();
    }
  }
  const submitKey = useRef(globalThis.crypto.randomUUID());
  const [documentType, setDocumentType] =
    useState<VerificationDocumentType>(initialDocumentType);
  const [file, setFile] = useState<File | null>(null);
  const [action, setAction] = useState<"upload" | "remove" | "submit" | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !file || !editable) return;
    busy.current = true;
    setAction("upload");
    setError(null);
    setMessage(null);
    setUploadProgress(0);
    try {
      await uploadVerificationDocument({
        providerId,
        verificationId,
        documentType,
        file,
        onProgress: setUploadProgress,
      });
      setMessage(
        documents.some((document) => document.documentType === documentType)
          ? "The document was replaced successfully. Review it again before submitting."
          : "The document was uploaded successfully. Review your documents before submitting.",
      );
      setFile(null);
      router.refresh();
    } catch (caught) {
      setError(customerAuthenticationError(caught));
    } finally {
      busy.current = false;
      setAction(null);
    }
  }

  async function remove(document: VerificationDocumentSummary) {
    if (busy.current || !editable) return;
    busy.current = true;
    setAction("remove");
    setError(null);
    setMessage(null);
    try {
      await removeVerificationDocument({
        verificationId,
        documentType: document.documentType as VerificationDocumentType,
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
    if (busy.current || !canSubmit) return;
    busy.current = true;
    setAction("submit");
    setError(null);
    try {
      await submitProviderVerification(providerId, submitKey.current);
      router.replace("/provider/status");
      router.refresh();
    } catch (caught) {
      setError(customerAuthenticationError(caught));
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
              {requiredRequirementCount}
            </span>{" "}
            <span className="text-muted-foreground">
              {requiredRequirementCount === 1
                ? "required item"
                : "required items"}
            </span>
          </div>
        ) : null}
      </div>
      {!reviewMode ? (
        <form
          className="grid gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(18rem,1.4fr)_auto] lg:items-end"
          onSubmit={upload}
        >
          <FormField
            label="Document type"
            required
            disabled={action !== null}
          >
            <Select
              value={documentType}
              onChange={(event) =>
                setDocumentType(
                  event.target.value as VerificationDocumentType,
                )
              }
            >
              {requiredDefinitions.length > 0 ? (
                <optgroup label="Required documents">
                  {requiredDefinitions.map((definition) => (
                    <option key={definition.type} value={definition.type}>
                      {definition.label}
                      {requirementLabel(definition.type, policy)}
                    </option>
                  ))}
                </optgroup>
              ) : null}

              {optionalDefinitions.length > 0 ? (
                <optgroup label="Optional supporting documents">
                  {optionalDefinitions.map((definition) => (
                    <option key={definition.type} value={definition.type}>
                      {definition.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
          </FormField>
          <FormField label="Choose file" required disabled={action !== null}>
            <Input
              ref={documentFileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </FormField>
          <Button type="submit" loading={action === "upload"} loadingLabel="Uploading" disabled={!file || !editable || action !== null}>
            {documents.some((document) => document.documentType === documentType)
              ? "Replace"
              : "Upload"}
          </Button>
        </form>
      ) : null}
      {action === "upload" ? (
        <div className="grid gap-1" aria-live="polite">
          <label className="text-sm font-medium" htmlFor="verification-upload-progress">
            Uploading: {uploadProgress}%
          </label>
          <progress
            id="verification-upload-progress"
            className="h-2 w-full accent-primary"
            max={100}
            value={uploadProgress}
          />
        </div>
      ) : null}
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
          onPrepareReplacement={prepareDocumentReplacement}
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
          onPrepareReplacement={prepareDocumentReplacement}
          onRemove={remove}
        />
      </div>
      {!editable ? (
        <AuthStatus
          tone="info"
          message="Documents are locked while submitted or under review. FEASTA must explicitly reopen the verification before changes are allowed."
        />
      ) : null}
      {consent ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="font-semibold">Recorded consent</p>
          <p className="mt-1 text-muted-foreground">
            Terms {consent.termsPolicyVersion}: {consent.termsAccepted ? "accepted" : "not recorded"} · Privacy {consent.privacyPolicyVersion}: {consent.privacyAccepted ? "accepted" : "not recorded"}
          </p>
        </div>
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
            disabled={action !== null}
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
            disabled={action !== null}
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
              action !== null
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
              action !== null
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
  onPrepareReplacement,
  onRemove,
}: {
  verificationId: string;
  title: string;
  description: string;
  definitions: readonly {
    type: VerificationDocumentType;
    label: string;
    required: boolean;
  }[];
  documents: VerificationDocumentSummary[];
  policy: {
    requiredAll: readonly string[];
    requiredOneOf: readonly (readonly string[])[];
  };
  editable: boolean;
  reviewMode: boolean;
  action: "upload" | "remove" | "submit" | null;
  onPrepareReplacement: (type: VerificationDocumentType) => void;
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
            (candidate) => candidate.documentType === definition.type,
          );

          const previewUrl = document
            ? `/api/provider/verifications/${encodeURIComponent(
                verificationId,
              )}/documents/${encodeURIComponent(document.id)}`
            : null;

          return (
            <article
              key={definition.type}
              className="grid min-w-0 gap-3 rounded-lg border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <h4 className="font-semibold">{definition.label}</h4>

                <p className="text-sm text-muted-foreground">
                  {requirementDescription(definition.type, policy)}
                  {document?.fileSize != null
                    ? ` · ${formatFileSize(document.fileSize)}`
                    : ""}
                </p>

                {document ? (
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {document.displayName}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={document?.status ?? "missing"}
                  label={document ? undefined : "Not uploaded"}
                />

                {document && previewUrl ? (
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

                {!document && editable && !reviewMode ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={action !== null}
                    onClick={() =>
                      onPrepareReplacement(
                        definition.type,
                      )
                    }
                  >
                    Upload file
                  </Button>
                ) : null}

                {document && editable && !reviewMode ? (
                  <>
                    <Button
                      variant="secondary"
                      size="compact"
                      disabled={action !== null}
                      onClick={() => {
                        onPrepareReplacement(definition.type);
                      }}
                    >
                      Replace
                    </Button>

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
                          disabled={action !== null}
                        >
                          Remove
                        </Button>
                      )}
                    />
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function requirementLabel(
  type: string,
  policy: {
    requiredAll: readonly string[];
    requiredOneOf: readonly (readonly string[])[];
  },
): string {
  if (policy.requiredAll.includes(type)) return " (required)";
  if (policy.requiredOneOf.some((group) => group.includes(type))) {
    return " (one required)";
  }
  return "";
}

function requirementDescription(
  type: string,
  policy: {
    requiredAll: readonly string[];
    requiredOneOf: readonly (readonly string[])[];
  },
): string {
  if (policy.requiredAll.includes(type)) return "Required for your current verification profile";
  const alternative = policy.requiredOneOf.find((group) => group.includes(type));
  if (alternative) {
    return `One required: ${alternative.map(documentLabel).join(" or ")}`;
  }
  return "Optional supporting document";
}

function documentLabel(type: string): string {
  return PROVIDER_VERIFICATION_DOCUMENT_DEFINITIONS.find(
    (definition) => definition.type === type,
  )?.label ?? type.replaceAll("_", " ");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
