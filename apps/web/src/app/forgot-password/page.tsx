"use client";

import {FormEvent, Suspense, useState} from "react";
import Link from "next/link";
import {useSearchParams} from "next/navigation";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {requestPasswordReset} from "@/lib/auth/client-session";
import {customerAuthenticationError} from "@/lib/auth/error-messages";

type ResetState = "form" | "sent" | "ineligible";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<ForgotPasswordFallback />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}

function ForgotPasswordFallback() {
  return (
    <AuthCard
      portal="customer"
      title="Reset your password"
      description="Loading password reset..."
    >
      <div
        className="min-h-32"
        aria-hidden="true"
      />
    </AuthCard>
  );
}

function ForgotPasswordContent() {
  const searchParams = useSearchParams();

  const expectedRole: "customer" | "provider" =
    searchParams.get("role") === "provider"
      ? "provider"
      : "customer";

  const isProvider = expectedRole === "provider";

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetState, setResetState] = useState<ResetState>("form");
  const [loading, setLoading] = useState(false);

  const returnToSignIn = isProvider
    ? "/provider-login"
    : "/customer/providers?auth=email";

  const accountLabel = isProvider
    ? "Provider"
    : "Customer";

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
      const eligible = await requestPasswordReset(
        email,
        expectedRole,
      );

      setResetState(
        eligible
          ? "sent"
          : "ineligible",
      );
    } catch (caught) {
      const code =
        typeof caught === "object" &&
        caught !== null &&
        "code" in caught
          ? String(caught.code)
          : "";

      if (
        code.includes("user-not-found") ||
        code.includes("invalid-credential")
      ) {
        // Do not reveal whether an account exists for the submitted email.
        setResetState("sent");
      } else {
        setError(customerAuthenticationError(caught));
      }
    } finally {
      setLoading(false);
    }
  }

  function tryAnotherEmail() {
    setResetState("form");
    setError(null);
  }

  return (
    <AuthCard
      portal={expectedRole}
      title="Reset your password"
      description={`Enter the email associated with your ${accountLabel} account to receive password reset instructions.`}
      footer={
        <Link
          className="font-bold text-primary-strong underline-offset-4 hover:underline"
          href={returnToSignIn}
        >
          Return to sign in
        </Link>
      }
    >
      {resetState === "sent" ? (
        <div className="grid gap-5">
          <AuthStatus
            message="If an account matches that email, password reset instructions will be sent. Check your email and follow the link if it arrives."
            tone="success"
          />

          <Button
            variant="secondary"
            onClick={tryAnotherEmail}
          >
            Try another email
          </Button>
        </div>
      ) : resetState === "ineligible" ? (
        <div className="grid gap-5">
          <AuthStatus
            message={`We couldn't send password reset instructions for this account from the ${accountLabel} sign-in page. Please check that you entered the email associated with your ${accountLabel} account.`}
            tone="warning"
            focusOnChange
          />

          <Button
            variant="secondary"
            onClick={tryAnotherEmail}
          >
            Try another email
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-5"
          onSubmit={submit}
          noValidate
        >
          <FormField
            label="Email address"
            required
            error={error ?? undefined}
            disabled={loading}
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
            />
          </FormField>

          <Button
            type="submit"
            fullWidth
            loading={loading}
            loadingLabel="Sending instructions"
          >
            Send reset instructions
          </Button>
        </form>
      )}
    </AuthCard>
  );
}