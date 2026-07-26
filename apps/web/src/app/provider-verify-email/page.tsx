"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {currentUserEmail, logoutWebSession} from "@/lib/auth/client-session";
import {customerAuthenticationError} from "@/lib/auth/error-messages";
import {
  refreshProviderVerification,
  resendProviderVerification,
} from "@/lib/auth/provider-client";

export default function ProviderVerifyEmailPage() {
  const router = useRouter();
  const [cooldown, setCooldown] = useState(0);
  const [action, setAction] = useState<"check" | "resend" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionInProgress = useRef(false);
  const email = currentUserEmail();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function check() {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setAction("check");
    setError(null);
    try {
      const result = await refreshProviderVerification();
      if (result.verified) {
        router.replace(result.destination ?? "/provider");
        router.refresh();
      } else {
        setMessage("Your email is not verified yet.");
      }
    } catch (caught) {
      setError(customerAuthenticationError(caught));
    } finally {
      actionInProgress.current = false;
      setAction(null);
    }
  }

  return (
    <AuthCard portal="provider" title="Verify your provider email" description={`Open the verification link sent to ${email ? mask(email) : "your provider email"}, then check again.`}>
      {!email ? (
        <Button asChild fullWidth><Link href="/provider-login">Sign in again</Link></Button>
      ) : (
        <div className="grid gap-4">
          <Button fullWidth loading={action === "check"} loadingLabel="Checking verification" disabled={action !== null} onClick={() => void check()}>I verified my email</Button>
          <Button variant="secondary" fullWidth loading={action === "resend"} loadingLabel="Sending email" disabled={action !== null || cooldown > 0} onClick={() => {
            if (actionInProgress.current) return;
            actionInProgress.current = true;
            setAction("resend");
            void resendProviderVerification().then(() => {
              setCooldown(60);
              setMessage("A new verification email has been sent.");
            }).catch((caught) => setError(customerAuthenticationError(caught))).finally(() => {
              actionInProgress.current = false;
              setAction(null);
            });
          }}>
            {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification email"}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => void logoutWebSession().finally(() => router.replace("/provider-login"))}>Use another account</Button>
        </div>
      )}
      {message ? <AuthStatus className="mt-4" message={message} /> : null}
      {error ? <AuthStatus className="mt-4" message={error} tone="error" /> : null}
    </AuthCard>
  );
}

function mask(email: string) {
  const [local, domain] = email.split("@");
  return local && domain ? `${local.slice(0, 2)}•••@${domain}` : "your provider email";
}
