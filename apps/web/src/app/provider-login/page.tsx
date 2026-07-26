"use client";

import {FormEvent, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {customerAuthenticationError} from "@/lib/auth/error-messages";
import {signInProvider} from "@/lib/auth/provider-client";

export default function ProviderLoginPage() {
  const router = useRouter();
  const submitting = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await signInProvider(email, password, "/provider");
      router.replace(result.destination);
      router.refresh();
    } catch (caught) {
      setError(customerAuthenticationError(caught));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <AuthCard portal="provider" title="Provider sign in" description="Sign in with a provider account to continue business onboarding or open your approved workspace." footer={<p className="text-sm text-muted-foreground">New to FEASTA?{" "}<Link className="font-bold text-primary-strong underline" href="/provider-register">Register as a provider</Link></p>}>
      <form className="grid gap-4" onSubmit={submit} aria-describedby={error ? "provider-login-error" : undefined}>
        <FormField label="Business account email" required disabled={loading}>
          <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <FormField label="Password" required disabled={loading}>
          <PasswordInput autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </FormField>
        <Button type="submit" fullWidth loading={loading} loadingLabel="Signing in">Sign in as provider</Button>
        {error ? <AuthStatus id="provider-login-error" message={error} tone="error" /> : null}
      </form>
    </AuthCard>
  );
}
