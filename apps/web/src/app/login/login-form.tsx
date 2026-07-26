"use client";

import {FormEvent, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {authenticationGatePresentation} from "@feasta/shared-types";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  signInWithEmail,
  signInWithGoogle,
  type WebSessionResult,
  WebAuthenticationError,
} from "@/lib/auth/client-session";

function accessibleSignInError(caught: unknown) {
  if (caught instanceof WebAuthenticationError) {
    if (caught.reason === "blocked") {
      return authenticationGatePresentation("blocked").message;
    }
    if (caught.reason === "deactivated") {
      return authenticationGatePresentation("deactivated").message;
    }
    if (caught.reason === "disabled") {
      return authenticationGatePresentation("disabledAccount").message;
    }
    if (caught.reason === "missing_profile") {
      return authenticationGatePresentation("missingUserProfile").message;
    }
  }
  const code = typeof caught === "object" && caught !== null && "code" in caught
    ? String(caught.code)
    : "";
  const message = caught instanceof Error ? caught.message.toLowerCase() : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "The email address or password is incorrect.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many sign-in attempts. Please wait before trying again.";
  }
  if (code.includes("user-disabled")) {
    return authenticationGatePresentation("disabledAuthAccount").message;
  }
  if (code.includes("network-request-failed")) return "Check your internet connection and try again.";
  if (code.includes("popup-closed")) return "Google sign-in was closed before it finished.";
  if (message.includes("blocked")) {
    return authenticationGatePresentation("blocked").message;
  }
  if (message.includes("disabled")) {
    return authenticationGatePresentation("disabledAccount").message;
  }
  if (message.includes("profile")) {
    return authenticationGatePresentation("missingUserProfile").message;
  }
  if (message.includes("role")) {
    return authenticationGatePresentation("forbiddenRole").message;
  }
  return "We could not sign you in. Check your details and try again.";
}

export function LoginForm({
  returnTo,
  initialNotice,
}: {
  returnTo?: string;
  initialNotice?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  async function completeSignIn(action: () => Promise<WebSessionResult>) {
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await action();
      router.replace(result.destination);
      router.refresh();
    } catch (caught) {
      setError(accessibleSignInError(caught));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void completeSignIn(() => signInWithEmail(email, password, returnTo));
  }

  return (
    <AuthCard
      title="Sign in to FEASTA"
      description="Sign in to your customer account. Provider and admin accounts are safely rejected from this customer-only surface."
    >
        {initialNotice && (
          <AuthStatus className="mt-4" message={initialNotice} />
        )}

        <form className="space-y-4" onSubmit={submit} aria-describedby={error ? "sign-in-error" : undefined}>
          <FormField label="Email address" required disabled={loading}>
            <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          <FormField label="Password" required disabled={loading}>
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          <Button type="submit" fullWidth loading={loading} loadingLabel="Signing in">
            Sign in
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link className="font-semibold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/forgot-password">
              Forgot password?
            </Link>
            <Link className="font-semibold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/register">
              Create customer account
            </Link>
          </div>
        </form>

        <Button
          className="mt-4"
          type="button"
          variant="secondary"
          fullWidth
          disabled={loading}
          onClick={() => void completeSignIn(
            () => signInWithGoogle(returnTo),
          )}
        >
          Continue with Google
        </Button>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          By continuing with Google, you accept the FEASTA{" "}
          <Link className="underline" href="/terms">Terms</Link> and{" "}
          <Link className="underline" href="/privacy">Privacy Policy</Link>.
        </p>

        {error && (
          <AuthStatus
            id="sign-in-error"
            className="mt-4"
            message={error}
            tone="error"
          />
        )}
    </AuthCard>
  );
}
