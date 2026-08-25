"use client";

import {
  CheckCircle2,
  Clock3,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useRef, useState} from "react";

import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {
  currentUserEmail,
  logoutWebSession,
} from "@/lib/auth/client-session";
import {customerAuthenticationError} from "@/lib/auth/error-messages";
import {
  refreshProviderVerification,
  resendProviderVerification,
} from "@/lib/auth/provider-client";

export default function ProviderVerifyEmailPage() {
  const router = useRouter();

  const [cooldown, setCooldown] = useState(0);
  const [action, setAction] = useState<
    "check" | "resend" | "logout" | null
  >(null);
  const [message, setMessage] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const actionInProgress = useRef(false);

  const email = currentUserEmail();
  const maskedEmail = email
    ? maskEmail(email)
    : "your provider email";

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((value) =>
        Math.max(0, value - 1),
      );
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [cooldown]);

  async function checkVerification() {
    if (actionInProgress.current) {
      return;
    }

    actionInProgress.current = true;
    setAction("check");
    setMessage(null);
    setError(null);

    try {
      const result =
        await refreshProviderVerification();

      if (result.verified) {
        router.replace(
          result.destination ?? "/provider",
        );
        router.refresh();
        return;
      }

      setMessage(
        "Your email is not verified yet. Open the verification link in your email, then check again.",
      );
    } catch (caught) {
      setError(
        customerAuthenticationError(caught),
      );
    } finally {
      actionInProgress.current = false;
      setAction(null);
    }
  }

  async function resendVerification() {
    if (
      actionInProgress.current ||
      cooldown > 0
    ) {
      return;
    }

    actionInProgress.current = true;
    setAction("resend");
    setMessage(null);
    setError(null);

    try {
      await resendProviderVerification();

      setCooldown(60);

      setMessage(
        "A new verification email has been sent. Check your inbox and spam folder.",
      );
    } catch (caught) {
      setError(
        customerAuthenticationError(caught),
      );
    } finally {
      actionInProgress.current = false;
      setAction(null);
    }
  }

  async function handleUseAnotherAccount() {
    if (actionInProgress.current) {
      return;
    }

    actionInProgress.current = true;
    setAction("logout");
    setMessage(null);
    setError(null);

    try {
      await logoutWebSession();
    } finally {
      actionInProgress.current = false;
      setAction(null);
      router.replace("/provider-login");
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Provider header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            aria-label="FEASTA home"
            className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/images/feasta_logo.png"
              alt=""
              width={40}
              height={40}
              priority
              className="size-10 object-contain"
            />

            <span className="text-[22px] font-bold tracking-[-0.03em] text-primary sm:text-2xl">
              <span className="text-primary">Feasta</span>{" "}
              <span className="text-foreground">provider</span>
            </span>
          </Link>

          <Link
            href="/provider-login"
            className="inline-flex min-h-11 items-center justify-center rounded-pill border border-border bg-card px-5 text-sm font-bold text-foreground transition-colors hover:border-primary/40 hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Provider Sign In
          </Link>
        </div>
      </header>

      {/* Main verification content */}
      <section className="px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-[680px]">
         <div className="rounded-dialog border border-border bg-card px-5 py-7 shadow-floating sm:px-8 sm:py-8 lg:px-9">
            {/* Icon */}
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary text-primary-strong">
              <MailCheck
                aria-hidden="true"
                className="size-8"
              />
            </div>

            {/* Heading */}
            <div className="mx-auto mt-6 max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-strong">
                Email verification
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Verify your email address
              </h1>

              <p className="mt-4 leading-7 text-muted-foreground">
                We sent a verification link to
              </p>

              <p className="mt-1 break-all text-lg font-bold text-foreground">
                {maskedEmail}
              </p>

              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                Open the verification email and
                follow the link. Then return here
                to continue your provider
                onboarding.
              </p>
            </div>

            {/* Missing session/email */}
            {!email ? (
              <div className="mt-8">
                <AuthStatus
                  tone="warning"
                  message="We could not find your current provider email. Sign in again to continue."
                />

                <Button
                  asChild
                  fullWidth
                  className="mt-4 rounded-pill"
                >
                  <Link href="/provider-login">
                    Provider Sign In
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                {/* Primary actions */}
                <div className="mt-8 grid gap-3">
                  <Button
                    fullWidth
                    loading={action === "check"}
                    loadingLabel="Checking verification"
                    disabled={action !== null}
                    className="rounded-pill"
                    onClick={() =>
                      void checkVerification()
                    }
                  >
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-5"
                    />

                    I verified my email
                  </Button>

                  <Button
                    variant="secondary"
                    fullWidth
                    loading={action === "resend"}
                    loadingLabel="Sending verification email"
                    disabled={
                      action !== null ||
                      cooldown > 0
                    }
                    className="rounded-pill"
                    onClick={() =>
                      void resendVerification()
                    }
                  >
                    {cooldown > 0 ? (
                      <>
                        <Clock3
                          aria-hidden="true"
                          className="size-5"
                        />

                        Resend available in{" "}
                        {cooldown}s
                      </>
                    ) : (
                      <>
                        <RefreshCw
                          aria-hidden="true"
                          className="size-5"
                        />

                        Resend verification email
                      </>
                    )}
                  </Button>
                </div>

                {/* Guidance */}
                <div className="mt-6 rounded-card border border-primary/15 bg-secondary p-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-primary-strong"
                    />

                    <div>
                      <p className="font-bold text-foreground">
                        Didn&apos;t receive the
                        email?
                      </p>

                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Check your Spam or Junk
                        folder first. If it is
                        still missing, use the
                        resend option above.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status */}
                {message ? (
                  <AuthStatus
                    className="mt-5"
                    message={message}
                    tone="info"
                  />
                ) : null}

                {error ? (
                  <AuthStatus
                    className="mt-5"
                    message={error}
                    tone="error"
                  />
                ) : null}

                {/* Alternate account */}
                <div className="mt-6 border-t border-border pt-5">
                  <Button
                    variant="ghost"
                    fullWidth
                    loading={action === "logout"}
                    loadingLabel="Signing out"
                    disabled={action !== null}
                    className="rounded-pill"
                    onClick={() =>
                      void handleUseAnotherAccount()
                    }
                  >
                    <LogOut
                      aria-hidden="true"
                      className="size-5"
                    />

                    Use another account
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Progress */}
          <div className="mt-8 rounded-card border border-border bg-card px-5 py-5 shadow-card sm:px-6">
            <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-primary-strong">
              Provider onboarding progress
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-3 sm:gap-3">
              <ProgressStep
                number="01"
                title="Account created"
                state="complete"
              />

              <ProgressStep
                number="02"
                title="Verify email"
                state="current"
              />

              <ProgressStep
                number="03"
                title="Business setup"
                state="upcoming"
              />
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-xl text-center text-sm leading-6 text-muted-foreground">
            Email verification protects your
            provider account before FEASTA
            continues with business onboarding.
          </p>
        </div>
      </section>
    </main>
  );
}

function ProgressStep({
  number,
  title,
  state,
}: {
  number: string;
  title: string;
  state: "complete" | "current" | "upcoming";
}) {
  const complete = state === "complete";
  const current = state === "current";

  return (
    <div
      className={[
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        complete
          ? "border-success/20 bg-success-subtle"
          : current
            ? "border-primary/25 bg-secondary"
            : "border-border bg-background",
      ].join(" ")}
      aria-current={
        current ? "step" : undefined
      }
    >
      <span
        className={[
          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-black",
          complete
            ? "bg-success text-success-foreground"
            : current
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        {complete ? (
          <CheckCircle2
            aria-hidden="true"
            className="size-4"
          />
        ) : (
          number
        )}
      </span>

      <span
        className={[
          "text-sm font-bold",
          state === "upcoming"
            ? "text-muted-foreground"
            : "text-foreground",
        ].join(" ")}
      >
        {title}
      </span>
    </div>
  );
}

function maskEmail(email: string) {
  const [local, domain] =
    email.split("@");

  if (!local || !domain) {
    return "your provider email";
  }

  const visible =
    local.length <= 2
      ? local.charAt(0)
      : local.slice(0, 2);

  return `${visible}•••@${domain}`;
}
