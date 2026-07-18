"use client";

import {FormEvent, useState} from "react";
import {useRouter} from "next/navigation";

import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  signInWithEmail,
  signInWithGoogle,
  type WebUserRole,
} from "@/lib/auth/client-session";

const destinations: Record<WebUserRole, string> = {
  customer: "/customer",
  provider: "/provider",
  admin: "/admin",
};

function accessibleSignInError(caught: unknown) {
  const code = typeof caught === "object" && caught !== null && "code" in caught
    ? String(caught.code)
    : "";
  const message = caught instanceof Error ? caught.message.toLowerCase() : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "The email address or password is incorrect.";
  }
  if (code.includes("network-request-failed")) return "Check your internet connection and try again.";
  if (code.includes("popup-closed")) return "Google sign-in was closed before it finished.";
  if (message.includes("blocked")) return "This account is blocked. Contact FEASTA support for help.";
  if (message.includes("disabled")) return "This account is disabled. Contact FEASTA support for help.";
  if (message.includes("profile")) return "We could not find the FEASTA profile for this account.";
  if (message.includes("role")) return "This account cannot use the selected FEASTA workspace.";
  return "We could not sign you in. Check your details and try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function completeSignIn(action: () => Promise<WebUserRole>) {
    setLoading(true);
    setError(null);
    try {
      const role = await action();
      router.replace(destinations[role]);
      router.refresh();
    } catch (caught) {
      setError(accessibleSignInError(caught));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void completeSignIn(() => signInWithEmail(email, password));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <section className="w-full rounded-card border border-border bg-card p-8 shadow-card">
        <h1 className="text-3xl font-bold text-card-foreground">Sign in to FEASTA</h1>
        <p className="mt-2 text-muted-foreground">
          Your Firebase credential is exchanged for a secure server session.
        </p>

        <form className="mt-8 space-y-4" onSubmit={submit} aria-describedby={error ? "sign-in-error" : undefined}>
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
        </form>

        <Button
          className="mt-4"
          type="button"
          variant="secondary"
          fullWidth
          disabled={loading}
          onClick={() => void completeSignIn(signInWithGoogle)}
        >
          Continue with Google
        </Button>

        {error && (
          <p id="sign-in-error" className="mt-4 rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
