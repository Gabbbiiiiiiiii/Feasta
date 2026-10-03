"use client";

import {useEffect, useState} from "react";
import Link from "next/link";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {applyEmailActionCode} from "@/lib/auth/client-session";
import {customerAuthenticationError} from "@/lib/auth/error-messages";

export function ActionProcessor({
  mode,
  code,
}: {
  mode: "verifyEmail" | "recoverEmail";
  code: string;
}) {
  const [message, setMessage] = useState("Validating your secure link…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // continueUrl is intentionally ignored. Account actions cannot redirect to
    // caller-controlled destinations.
    void applyEmailActionCode(code)
      .then(() => setMessage(mode === "verifyEmail"
        ? "Your email has been verified. Sign in to continue."
        : "Your account email has been recovered. Sign in to continue."))
      .catch((caught) => setError(customerAuthenticationError(caught)));
  }, [code, mode]);

  return (
    <AuthCard title="FEASTA account action" description="Securely complete the action requested for your account.">
      {error ? (
        <div className="grid gap-4">
          <AuthStatus message={error} tone="error" />
          <Button asChild variant="secondary"><Link href="/login">Return to sign in</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <AuthStatus message={message} />
          {!message.startsWith("Validating") ? <Button asChild><Link href="/login">Sign in</Link></Button> : null}
        </div>
      )}
    </AuthCard>
  );
}
