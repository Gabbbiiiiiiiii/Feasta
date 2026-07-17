"use client";

import {FormEvent, useState} from "react";
import {useRouter} from "next/navigation";

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
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
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
      <section className="w-full rounded-3xl border border-black/5 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-[#2B211D]">Sign in to FEASTA</h1>
        <p className="mt-2 text-[#8C817A]">
          Your Firebase credential is exchanged for a secure server session.
        </p>

        <form className="mt-8 space-y-4" onSubmit={submit}>
          <input
            className="w-full rounded-xl border border-[#E7DED8] px-4 py-3"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            className="w-full rounded-xl border border-[#E7DED8] px-4 py-3"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            className="w-full rounded-xl bg-[#FF6333] px-4 py-3 font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <button
          className="mt-4 w-full rounded-xl border border-[#E7DED8] px-4 py-3 font-semibold text-[#2B211D] disabled:opacity-60"
          type="button"
          disabled={loading}
          onClick={() => void completeSignIn(signInWithGoogle)}
        >
          Continue with Google
        </button>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
