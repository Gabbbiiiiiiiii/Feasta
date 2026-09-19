"use client";

import {FormEvent, useEffect, useState} from "react";
import Link from "next/link";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {Button} from "@/components/ui/button";
import {
  completePasswordReset,
  inspectPasswordResetCode,
} from "@/lib/auth/client-session";
import {customerAuthenticationError} from "@/lib/auth/error-messages";

export function ResetPasswordForm({code}: {code: string | null}) {
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(Boolean(code));
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    void inspectPasswordResetCode(code)
      .then((value) => setEmail(value))
      .catch((caught) => setError(customerAuthenticationError(caught)))
      .finally(() => setLoading(false));
  }, [code]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code || loading) return;
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await completePasswordReset(code, password);
      setCompleted(true);
    } catch (caught) {
      setError(customerAuthenticationError(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" description={email ? `Update the password for ${maskResetEmail(email)}.` : "Validate your FEASTA password reset link."}>
      {completed ? (
        <div className="grid gap-5">
          <AuthStatus message="Your password has been updated." tone="success" />
          <Button asChild fullWidth><Link href="/login">Sign in</Link></Button>
        </div>
      ) : (
        <form className="grid gap-5" onSubmit={submit}>
          <FormField label="New password" description="Use at least 8 characters." required disabled={loading}>
            <PasswordInput autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </FormField>
          <FormField label="Confirm new password" required disabled={loading}>
            <PasswordInput autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </FormField>
          {error || !code ? <AuthStatus message={error ?? "This password reset link is incomplete."} tone="error" /> : null}
          <Button type="submit" fullWidth loading={loading} loadingLabel="Validating link" disabled={!code}>Update password</Button>
          {error ? <Button asChild variant="secondary" fullWidth><Link href="/forgot-password">Request a new link</Link></Button> : null}
        </form>
      )}
    </AuthCard>
  );
}

function maskResetEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your account";
  return `${local.slice(0, 2)}•••@${domain}`;
}
