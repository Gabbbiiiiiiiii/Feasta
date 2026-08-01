"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {
  currentUserEmail,
  logoutWebSession,
  refreshCurrentUserVerification,
  resendCurrentUserVerification,
} from "@/lib/auth/client-session";
import {
  customerAuthenticationError,
} from "@/lib/auth/error-messages";

const resendCooldownSeconds = 60;
const defaultCustomerDestination =
  "/customer";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <VerificationFallback />
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const returnTo =
    safeCustomerReturnTo(
      searchParams.get("next"),
    ) ?? defaultCustomerDestination;

  const [cooldown, setCooldown] =
    useState(0);

  const [status, setStatus] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [action, setAction] =
    useState<
      "resend" |
      "refresh" |
      "logout" |
      null
    >(null);

  const email = currentUserEmail();

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setInterval(
      () =>
        setCooldown((value) =>
          Math.max(0, value - 1),
        ),
      1000,
    );

    return () =>
      window.clearInterval(timer);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0 || action) return;

    setAction("resend");
    setError(null);
    setStatus(null);

    try {
      await resendCurrentUserVerification();

      setCooldown(
        resendCooldownSeconds,
      );

      setStatus(
        "A new verification email has been sent.",
      );
    } catch (caught) {
      setError(
        customerAuthenticationError(
          caught,
        ),
      );
    } finally {
      setAction(null);
    }
  }

  async function refresh() {
    if (action) return;

    setAction("refresh");
    setError(null);
    setStatus(null);

    try {
      const result =
        await refreshCurrentUserVerification(
          returnTo,
        );

      if (result.verified) {
        router.replace(
          result.destination ??
            returnTo,
        );

        router.refresh();
      } else {
        setStatus(
          "Your email is not verified yet. " +
            "Open the email link, then check again.",
        );
      }
    } catch (caught) {
      setError(
        customerAuthenticationError(
          caught,
        ),
      );
    } finally {
      setAction(null);
    }
  }

  async function changeAccount() {
    if (action) return;

    setAction("logout");

    try {
      await logoutWebSession();
    } finally {
      const loginParameters =
        new URLSearchParams({
          next: returnTo,
        });

      router.replace(
        `/login?${loginParameters.toString()}`,
      );

      router.refresh();
    }
  }

  const loginParameters =
    new URLSearchParams({
      next: returnTo,
    });

  return (
    <AuthCard
      title="Verify your email"
      description={
        `Use the verification link sent to ${maskEmail(email)}. ` +
        "Verification is required before customer account pages can open."
      }
      footer={
        <p className="text-sm text-muted-foreground">
          The link may take a few minutes to arrive.
          Check your spam folder too.
        </p>
      }
    >
      {!email ? (
        <div className="grid gap-4">
          <p className="rounded-lg bg-warning-subtle p-4 font-medium text-warning">
            This browser no longer has the Firebase sign-in
            needed to resend or check verification.
          </p>

          <Button
            asChild
            fullWidth
          >
            <Link
              href={`/login?${loginParameters.toString()}`}
            >
              Sign in again
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <Button
            fullWidth
            loading={
              action === "refresh"
            }
            loadingLabel="Checking verification"
            disabled={action !== null}
            onClick={() =>
              void refresh()
            }
          >
            I have verified my email
          </Button>

          <Button
            variant="secondary"
            fullWidth
            loading={
              action === "resend"
            }
            loadingLabel="Sending email"
            disabled={
              action !== null ||
              cooldown > 0
            }
            onClick={() =>
              void resend()
            }
          >
            {cooldown > 0
              ? `Resend available in ${cooldown}s`
              : "Resend verification email"}
          </Button>

          <Button
            variant="ghost"
            fullWidth
            loading={
              action === "logout"
            }
            loadingLabel="Changing account"
            disabled={action !== null}
            onClick={() =>
              void changeAccount()
            }
          >
            Sign out or change account
          </Button>
        </div>
      )}

      {status ? (
        <AuthStatus
          className="mt-4"
          message={status}
        />
      ) : null}

      {error ? (
        <AuthStatus
          className="mt-4"
          message={error}
          tone="error"
        />
      ) : null}
    </AuthCard>
  );
}

function VerificationFallback() {
  return (
    <AuthCard
      title="Verify your email"
      description="Preparing secure email verification."
    >
      <div
        className="grid gap-4"
        aria-label="Loading email verification"
        aria-busy="true"
      >
        <div className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      </div>
    </AuthCard>
  );
}

function safeCustomerReturnTo(
  value: string | null,
): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    return null;
  }

  try {
    const decoded =
      decodeURIComponent(value);

    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      decoded.includes("\r") ||
      decoded.includes("\n")
    ) {
      return null;
    }

    const base =
      new URL("https://feasta.invalid");

    const resolved =
      new URL(value, base);

    if (
      resolved.origin !== base.origin ||
      (
        resolved.pathname !== "/customer" &&
        !resolved.pathname.startsWith(
          "/customer/",
        )
      )
    ) {
      return null;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

function maskEmail(
  email: string | null,
): string {
  if (!email) {
    return "your account email";
  }

  const [local, domain] =
    email.split("@");

  if (!local || !domain) {
    return "your account email";
  }

  const visible = local.slice(
    0,
    Math.min(2, local.length),
  );

  const hiddenCharacterCount =
    Math.max(
      2,
      Math.min(
        6,
        local.length -
          visible.length,
      ),
    );

  return (
    `${visible}` +
    `${"•".repeat(hiddenCharacterCount)}` +
    `@${domain}`
  );
}