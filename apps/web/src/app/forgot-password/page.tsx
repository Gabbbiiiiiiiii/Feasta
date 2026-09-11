"use client";

import {FormEvent, useState} from "react";
import Link from "next/link";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {requestPasswordReset} from "@/lib/auth/client-session";
import {customerAuthenticationError} from "@/lib/auth/error-messages";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (caught) {
      const code = typeof caught === "object" && caught !== null && "code" in caught
        ? String(caught.code)
        : "";
      if (code.includes("user-not-found") || code.includes("invalid-credential")) {
        setSent(true);
      } else {
        setError(customerAuthenticationError(caught));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Reset your password" description="Enter your account email. If it matches a FEASTA account, we will send reset instructions." footer={<Link className="font-bold text-primary-strong underline-offset-4 hover:underline" href="/customer/providers?auth=email">Return to sign in</Link>}>
      {sent ? (
        <div className="grid gap-5">
          <AuthStatus
            message="If an account matches that email, password reset instructions are on the way."
            tone="success"
          />
          <Button variant="secondary" onClick={() => setSent(false)}>Try another email</Button>
        </div>
      ) : (
        <form className="grid gap-5" onSubmit={submit} noValidate>
          <FormField label="Email address" required error={error ?? undefined} disabled={loading}>
            <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FormField>
          <Button type="submit" fullWidth loading={loading} loadingLabel="Sending instructions">Send reset instructions</Button>
        </form>
      )}
    </AuthCard>
  );
}
