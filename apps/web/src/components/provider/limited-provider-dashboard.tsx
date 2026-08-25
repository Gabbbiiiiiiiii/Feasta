"use client";

import {
  CheckCircle2,
  Clock3,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {useCallback, useEffect, useRef, useState} from "react";

import {AuthStatus} from "@/components/auth/auth-status";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {customerAuthenticationError} from "@/lib/auth/error-messages";
import {
  refreshProviderVerification,
  resendProviderVerification,
} from "@/lib/auth/provider-client";
import type {
  LimitedProviderDashboardData,
} from "@/lib/provider/dashboard/limited-provider-dashboard-types";

const VERIFICATION_POLL_INTERVAL_MS = 20_000;

type VerificationCheckTrigger = "automatic" | "manual";

export function LimitedProviderDashboard({
  dashboard,
}: {
  dashboard: LimitedProviderDashboardData;
}) {
  const router = useRouter();
  const [cooldown, setCooldown] = useState(0);
  const [action, setAction] = useState<"check" | "resend" | null>(null);
  const [automaticChecking, setAutomaticChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationInProgress = useRef(false);
  const verificationSucceeded = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function resendVerification() {
    if (operationInProgress.current || cooldown > 0) return;
    operationInProgress.current = true;
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
      setError(customerAuthenticationError(caught));
    } finally {
      operationInProgress.current = false;
      if (mounted.current) setAction(null);
    }
  }

  const checkVerification = useCallback(async (
    trigger: VerificationCheckTrigger,
  ) => {
    if (operationInProgress.current || verificationSucceeded.current) return;
    operationInProgress.current = true;
    if (trigger === "manual") {
      setAction("check");
      setMessage(null);
      setError(null);
    } else {
      setAutomaticChecking(true);
    }
    try {
      const result = await refreshProviderVerification();
      if (result.verified) {
        verificationSucceeded.current = true;
        router.replace(result.destination ?? "/provider");
        router.refresh();
        return;
      }
      if (trigger === "manual" && mounted.current) {
        setMessage(
          "Your email is still pending verification. Open the verification link, then check again.",
        );
      }
    } catch (caught) {
      if (trigger === "manual" && mounted.current) {
        setError(customerAuthenticationError(caught));
      }
    } finally {
      operationInProgress.current = false;
      if (mounted.current) {
        if (trigger === "manual") setAction(null);
        else setAutomaticChecking(false);
      }
    }
  }, [router]);

  useEffect(() => {
    const checkWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void checkVerification("automatic");
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkWhenVisible();
    };

    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const pollingTimer = window.setInterval(
      checkWhenVisible,
      VERIFICATION_POLL_INTERVAL_MS,
    );

    return () => {
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(pollingTimer);
    };
  }, [checkVerification]);

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Provider account"
        title={`Welcome, ${dashboard.displayName}`}
        description="Your FEASTA provider account has been created. Complete email verification before setting up your business."
      />

      <section
        aria-labelledby="provider-email-verification-title"
        className="rounded-card border border-primary/25 bg-card p-6 shadow-card sm:p-8"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-primary-strong">
            <MailCheck aria-hidden="true" className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-strong">
              Next step
            </p>
            <h1
              id="provider-email-verification-title"
              className="mt-2 text-2xl font-black tracking-tight sm:text-3xl"
            >
              Verify your email to continue
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
              We sent a verification link to{" "}
              <strong className="break-all text-foreground">
                {dashboard.email || "your provider email"}
              </strong>
              . Verify your email to continue provider onboarding and unlock
              your provider workspace.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                variant="secondary"
                loading={action === "resend"}
                loadingLabel="Sending verification email"
                disabled={action !== null || automaticChecking || cooldown > 0}
                onClick={() => void resendVerification()}
              >
                {cooldown > 0 ? (
                  <>
                    <Clock3 aria-hidden="true" className="size-5" />
                    Resend available in {cooldown}s
                  </>
                ) : (
                  <>
                    <RefreshCw aria-hidden="true" className="size-5" />
                    Resend verification email
                  </>
                )}
              </Button>
              <Button
                loading={action === "check"}
                loadingLabel="Checking verification"
                disabled={action !== null || automaticChecking}
                onClick={() => void checkVerification("manual")}
              >
                <CheckCircle2 aria-hidden="true" className="size-5" />
                I&apos;ve verified my email
              </Button>
            </div>

            <p
              aria-live="polite"
              className="mt-4 text-sm text-muted-foreground"
            >
              {automaticChecking
                ? "Checking verification status..."
                : "We'll automatically check your verification status when you return to this tab."}
            </p>

            {message ? (
              <AuthStatus className="mt-5" message={message} tone="info" />
            ) : null}
            {error ? (
              <AuthStatus className="mt-5" message={error} tone="error" />
            ) : null}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="provider-account-status-title"
        className="rounded-card border border-border bg-card p-6 shadow-card"
      >
        <h2 id="provider-account-status-title" className="text-xl font-bold">
          Account status
        </h2>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusItem
            icon={ShieldCheck}
            label="Mobile number"
            value="Verified"
            tone="verified"
          />
          <StatusItem
            icon={MailCheck}
            label="Email"
            value="Pending verification"
            tone="pending"
          />
          <StatusItem
            icon={UserRoundCheck}
            label="Account"
            value="Created"
            tone="verified"
          />
          <StatusItem
            icon={MailCheck}
            label="Next step"
            value="Verify email"
            tone="pending"
          />
        </dl>
      </section>
    </div>
  );
}

function StatusItem({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  tone: "verified" | "pending";
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <dt className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </dt>
      <dd
        className={[
          "mt-2 text-sm font-bold",
          tone === "verified" ? "text-success" : "text-primary-strong",
        ].join(" ")}
      >
        {tone === "verified" ? "✓ " : ""}{value}
      </dd>
    </div>
  );
}
