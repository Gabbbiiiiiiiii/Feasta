"use client";

import {FormEvent, useRef, useState} from "react";
import {useRouter} from "next/navigation";

import {FormField} from "@/components/forms/form-field";
import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {customerAuthenticationError} from "@/lib/auth/error-messages";
import {
  submitProviderVerification,
  uploadVerificationDocument,
  type VerificationDocumentType,
} from "@/lib/auth/provider-client";

export function ProviderVerificationActions({
  providerId,
  verificationId,
  canSubmit,
  reviewMode = false,
}: {
  providerId: string;
  verificationId: string;
  canSubmit: boolean;
  reviewMode?: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const submitKey = useRef(globalThis.crypto.randomUUID());
  const [documentType, setDocumentType] = useState<VerificationDocumentType>("business_permit");
  const [file, setFile] = useState<File | null>(null);
  const [action, setAction] = useState<"upload" | "submit" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !file) return;
    busy.current = true;
    setAction("upload");
    setError(null);
    setMessage(null);
    try {
      await uploadVerificationDocument({
        providerId,
        verificationId,
        documentType,
        file,
      });
      setMessage("The document was uploaded and registered securely.");
      setFile(null);
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
              <option value="business_permit">Business permit (required)</option>
              <option value="valid_id">Valid ID (required)</option>
              <option value="dti_registration">DTI registration</option>
              <option value="bir_registration">BIR registration</option>
              <option value="sanitary_permit">Sanitary permit</option>
              <option value="mayors_permit">Mayor&apos;s permit</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Choose file" required disabled={action !== null}>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </FormField>
          <Button type="submit" loading={action === "upload"} loadingLabel="Uploading" disabled={!file || action !== null}>Upload</Button>
        </form>
      ) : null}
      {message ? <AuthStatus message={message} tone="success" /> : null}
      {error ? <AuthStatus message={error} tone="error" /> : null}
      <div className="flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:items-center">
        {!canSubmit ? <p className="text-sm text-muted-foreground">Upload or replace both required documents before continuing.</p> : null}
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
