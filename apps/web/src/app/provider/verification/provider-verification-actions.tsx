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
  const submitKey = useRef(globalThis.crypto.randomUUID());
  const [documentType, setDocumentType] = useState<VerificationDocumentType>("business_permit");
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
          ? "The document was replaced securely."
          : "The document was uploaded and registered securely.",
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
      <div>
        <h2 id="verification-upload-title" className="text-xl font-bold">
          {reviewMode ? "Review and submit" : "Verification documents"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {reviewMode
            ? "Your required documents are registered. Submission sends the application to FEASTA administrators for review."
            : "PDF, JPEG, PNG, or WebP. Maximum 10 MB. Files are private to you and FEASTA administrators."}
        </p>
      </div>
      {!reviewMode ? (
        <form className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end" onSubmit={upload}>
          <FormField label="Document type" required disabled={action !== null}>
            <Select value={documentType} onChange={(event) => setDocumentType(event.target.value as VerificationDocumentType)}>
              {PROVIDER_VERIFICATION_DOCUMENT_DEFINITIONS.map((definition) => (
                <option key={definition.type} value={definition.type}>
                  {definition.label}{requirementLabel(definition.type, policy)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Choose file" required disabled={action !== null}>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
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
      <div className="grid gap-3" aria-label="Verification document status">
        {PROVIDER_VERIFICATION_DOCUMENT_DEFINITIONS.map((definition) => {
          const document = documents.find(
            (candidate) => candidate.documentType === definition.type,
          );
          return (
            <article
              key={definition.type}
              className="grid min-w-0 gap-3 rounded-lg border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <h3 className="font-semibold">{definition.label}</h3>
                <p className="text-sm text-muted-foreground">
                  {requirementDescription(definition.type, policy)}
                  {document?.fileSize != null
                    ? ` · ${formatFileSize(document.fileSize)}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={document?.status ?? "missing"}
                  label={document ? undefined : "Not uploaded"}
                />
                {document && editable && !reviewMode ? (
                  <ConfirmationDialog
                    title={`Remove ${document.displayName}?`}
                    description="The private file and its registration will be removed. You must upload it again if the policy requires it."
                    destructive
                    confirmLabel="Remove document"
                    loading={action === "remove"}
                    onConfirm={() => remove(document)}
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
                ) : null}
              </div>
            </article>
          );
        })}
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
      {message ? <AuthStatus message={message} tone="success" /> : null}
      {error ? <AuthStatus message={error} tone="error" /> : null}
      <div className="flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:items-center">
        {!canSubmit ? (
          <p className="text-sm text-muted-foreground">
            {consentReady
              ? "Complete every required document and one document from each alternative group before continuing."
              : "Record the required Terms and Privacy Policy acceptance before continuing."}
          </p>
        ) : null}
        {reviewMode ? (
          <>
            <Button variant="secondary" disabled={action !== null} onClick={() => router.replace("/provider/verification?stage=documents")}>Back to documents</Button>
            <Button loading={action === "submit"} loadingLabel="Submitting" disabled={!canSubmit || action !== null} onClick={() => void submit()}>Submit for admin review</Button>
          </>
        ) : (
          <Button disabled={!canSubmit || action !== null} onClick={() => router.replace("/provider/verification?stage=review")}>Review application</Button>
        )}
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
  if (policy.requiredAll.includes(type)) return "Required for this business";
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
