"use client";

import {
  ArrowLeft,
  Mail,
} from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  useRef,
  useState,
} from "react";
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

type LoginMode = "gateway" | "email";

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

  const code =
    typeof caught === "object" &&
    caught !== null &&
    "code" in caught
      ? String(caught.code)
      : "";

  const message =
    caught instanceof Error
      ? caught.message.toLowerCase()
      : "";

  if (
    code.includes("invalid-credential") ||
    code.includes("wrong-password") ||
    code.includes("user-not-found")
  ) {
    return "The email address or password is incorrect.";
  }

  if (code.includes("too-many-requests")) {
    return "Too many sign-in attempts. Please wait before trying again.";
  }

  if (code.includes("user-disabled")) {
    return authenticationGatePresentation("disabledAuthAccount").message;
  }

  if (code.includes("network-request-failed")) {
    return "Check your internet connection and try again.";
  }

  if (code.includes("popup-closed")) {
    return "Google sign-in was closed before it finished.";
  }

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

  const [mode, setMode] =
    useState<LoginMode>("gateway");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const submitting = useRef(false);

  async function completeSignIn(
    action: () => Promise<WebSessionResult>,
  ) {
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

  function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    void completeSignIn(() =>
      signInWithEmail(
        email,
        password,
        returnTo,
      ),
    );
  }

  function showEmailLogin() {
    setError(null);
    setMode("email");
  }

  function showGateway() {
    if (loading) return;

    setError(null);
    setMode("gateway");
  }

  return (
    <AuthCard
      title={
        mode === "gateway"
          ? "Welcome!"
          : "Log in with email"
      }
      description={
        mode === "gateway"
          ? "Sign in or create an account to continue planning your event."
          : "Enter the email address and password connected to your customer account."
      }
    >
      {initialNotice ? (
        <AuthStatus
          className="mb-5"
          message={initialNotice}
        />
      ) : null}

      {mode === "gateway" ? (
        <AuthenticationGateway
          loading={loading}
          error={error}
          returnTo={returnTo}
          onGoogle={() =>
            void completeSignIn(() =>
              signInWithGoogle(returnTo),
            )
          }
          onEmail={showEmailLogin}
        />
      ) : (
        <EmailLoginForm
          email={email}
          password={password}
          error={error}
          loading={loading}
          returnTo={returnTo}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onBack={showGateway}
          onSubmit={submit}
        />
      )}
    </AuthCard>
  );
}

function AuthenticationGateway({
  loading,
  error,
  returnTo,
  onGoogle,
  onEmail,
}: {
  loading: boolean;
  error: string | null;
  returnTo?: string;
  onGoogle: () => void;
  onEmail: () => void;
}) {
  const registrationHref = returnTo
    ? `/register?next=${encodeURIComponent(returnTo)}`
    : "/register";

  return (
    <div className="grid gap-4">
      <Button
        type="button"
        variant="secondary"
        fullWidth
        loading={loading}
        loadingLabel="Connecting to Google"
        onClick={onGoogle}
      >
        <GoogleMark />
        Continue with Google
      </Button>

      <div className="flex items-center gap-4 py-1">
        <span className="h-px flex-1 bg-border" />

        <span className="text-sm font-medium text-muted-foreground">
          or
        </span>

        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        fullWidth
        disabled={loading}
        onClick={onEmail}
      >
        <Mail aria-hidden="true" className="size-5" />
        Log in with email
      </Button>

      <Button
        asChild
        type="button"
        variant="secondary"
        fullWidth
        disabled={loading}
      >
        <Link href={registrationHref}>
          Create an account
        </Link>
      </Button>

      <AuthenticationAgreement />

      {error ? (
        <AuthStatus
          id="sign-in-error"
          message={error}
          tone="error"
        />
      ) : null}

      <PortalLinks />
    </div>
  );
}

function EmailLoginForm({
  email,
  password,
  error,
  loading,
  returnTo,
  onEmailChange,
  onPasswordChange,
  onBack,
  onSubmit,
}: {
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
  returnTo?: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const registrationHref = returnTo
    ? `/register?next=${encodeURIComponent(returnTo)}`
    : "/register";

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={onBack}
        className="mb-5 inline-flex min-h-12 items-center gap-2 rounded-lg px-2 text-sm font-bold text-primary-strong hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ArrowLeft
          aria-hidden="true"
          className="size-4"
        />
        Back to sign-in options
      </button>

      <form
        className="space-y-4"
        onSubmit={onSubmit}
        aria-describedby={
          error
            ? "sign-in-error"
            : undefined
        }
      >
        <FormField
          label="Email address"
          required
          disabled={loading}
        >
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) =>
              onEmailChange(event.target.value)
            }
          />
        </FormField>

        <FormField
          label="Password"
          required
          disabled={loading}
        >
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(event) =>
              onPasswordChange(event.target.value)
            }
          />
        </FormField>

        <div className="flex justify-end">
          <Link
            className="rounded-sm text-sm font-semibold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
        </div>

        {error ? (
          <AuthStatus
            id="sign-in-error"
            message={error}
            tone="error"
          />
        ) : null}

        <Button
          type="submit"
          fullWidth
          loading={loading}
          loadingLabel="Signing in"
        >
          Log in
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          New to FEASTA?{" "}
          <Link
            className="font-bold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={registrationHref}
          >
            Create an account
          </Link>
        </p>
      </form>
      <div className="mt-5">
        <AuthenticationAgreement />
      </div>
    </div>
  );
}

function AuthenticationAgreement() {
  return (
    <p className="text-center text-xs leading-5 text-muted-foreground">
      By continuing, you agree to the FEASTA{" "}
      <Link
        className="font-semibold text-primary-strong underline underline-offset-2"
        href="/terms"
      >
        Terms
      </Link>{" "}
      and{" "}
      <Link
        className="font-semibold text-primary-strong underline underline-offset-2"
        href="/privacy"
      >
        Privacy Policy
      </Link>
      .
    </p>
  );
}

function PortalLinks() {
  return (
    <div className="mt-2 border-t border-border pt-5 text-center text-sm text-muted-foreground">
      <p>
        Offering event services?{" "}
        <Link
          className="font-bold text-primary-strong underline-offset-4 hover:underline"
          href="/provider-login"
        >
          Provider portal
        </Link>
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.93A6 6 0 0 1 6.07 12c0-.67.12-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.78.5 3.82 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
      />
    </svg>
  );
}