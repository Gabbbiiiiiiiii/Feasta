"use client";

import {FormEvent, useRef, useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarCheck2,
  PackageCheck,
} from "lucide-react";

import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {customerAuthenticationError} from "@/lib/auth/error-messages";
import {signInProvider} from "@/lib/auth/provider-client";

const providerBenefits = [
  {
    icon: BriefcaseBusiness,
    title: "Manage your provider profile",
    description:
      "Keep your business information organized and ready for customers.",
  },
  {
    icon: PackageCheck,
    title: "Manage services and packages",
    description:
      "Keep your event services, packages, and business offerings up to date.",
  },
  {
    icon: CalendarCheck2,
    title: "Manage booking opportunities",
    description:
      "Review booking activity and keep track of your upcoming events.",
  },
];

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
      const result = await signInProvider(
        email,
        password,
        "/provider",
      );

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
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
        {/* Left provider information panel */}
        <section
          className="
            relative hidden overflow-hidden
            bg-[#2b211d]
            px-12 py-12
            lg:flex lg:flex-col
            xl:px-20 xl:py-16
          "
        >
          {/* Subtle background treatment */}
          <div
            aria-hidden="true"
            className="
              pointer-events-none absolute inset-0
              bg-[radial-gradient(circle_at_20%_10%,rgba(255,99,51,0.18),transparent_38%)]
            "
          />

          <div className="relative z-10 flex h-full flex-col">
            {/* Brand */}
            <Link
              href="/"
              aria-label="Feasta home"
              className="
                inline-flex w-fit items-center gap-3
                rounded-[10px]
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-primary
                focus-visible:ring-offset-4
                focus-visible:ring-offset-[#2b211d]
              "
            >
              <Image
                src="/images/feasta_logo.png"
                alt=""
                width={44}
                height={44}
                className="size-11 object-contain"
                priority
              />

              <span className="text-2xl font-black tracking-[-0.03em]">
                <span className="text-primary">Feasta</span>{" "}
                <span className="text-white">Provider</span>
              </span>
            </Link>

            {/* Main left content */}
            <div className="my-auto max-w-[500px] py-14">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
                Feasta Provider
              </p>

              <p className="mt-5 text-4xl font-black leading-[1.08] tracking-[-0.04em] text-white xl:text-5xl">
                Manage your event business with Feasta.
              </p>

              <p className="mt-5 max-w-[460px] text-base leading-7 text-white/70">
                Access your provider workspace to manage your business,
                services, booking opportunities, and provider account.
              </p>

              <div className="mt-10 space-y-7">
                {providerBenefits.map((benefit) => {
                  const Icon = benefit.icon;

                  return (
                    <div
                      key={benefit.title}
                      className="flex items-start gap-4"
                    >
                      <div
                        className="
                          flex size-11 shrink-0 items-center justify-center
                          rounded-[10px]
                          border border-primary/30
                          bg-primary/10
                        "
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-5 text-primary"
                        />
                      </div>

                      <div>
                        <p className="font-bold text-white">
                          {benefit.title}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-white/65">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs leading-5 text-white/45">
              FEASTA Provider Portal
            </p>
          </div>
        </section>

        {/* Right login panel */}
        <section className="relative flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-24">
          {/* Close / return */}

          <div className="w-full max-w-[500px]">
            {/* Mobile brand */}
            <Link
              href="/"
              aria-label="Feasta home"
              className="
                mb-10 inline-flex items-center gap-2
                rounded-[10px]
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-ring
                lg:hidden
              "
            >
              <Image
                src="/images/feasta_logo.png"
                alt=""
                width={38}
                height={38}
                className="size-9 object-contain"
              />

              <span className="text-xl font-black tracking-[-0.03em]">
                <span className="text-primary">Feasta</span>{" "}
                <span className="text-foreground">Provider</span>
              </span>
            </Link>

            {/* Heading */}
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary-strong">
                Feasta Provider
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
                Welcome back
              </h1>

              <p className="mt-3 text-base text-muted-foreground">
                Sign in to your Feasta provider account.
              </p>
            </div>

            {/* Login form */}
            <form
              className="mt-10 grid gap-5"
              onSubmit={submit}
              aria-describedby={
                error ? "provider-login-error" : undefined
              }
            >
              <FormField
                id="provider-login-email"
                label="Email address"
                labelClassName="sr-only"
                required
                disabled={loading}
              >
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Email"
                  className="min-h-14 rounded-[10px]"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </FormField>

              <FormField
                id="provider-login-password"
                label="Password"
                labelClassName="sr-only"
                required
                disabled={loading}
              >
                <PasswordInput
                  autoComplete="current-password"
                  placeholder="Password"
                  className="min-h-14 rounded-[10px]"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </FormField>

              <div className="-mt-2 flex justify-end">
                <Link
                  href="/forgot-password"
                  className="
                    inline-flex min-h-11 items-center
                    rounded-[10px]
                    text-sm font-bold
                    text-primary-strong
                    underline-offset-4
                    hover:underline
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-ring
                  "
                >
                  Forgot password?
                </Link>
              </div>

              {error ? (
                <AuthStatus
                  id="provider-login-error"
                  message={error}
                  tone="error"
                />
              ) : null}

              <Button
                type="submit"
                fullWidth
                loading={loading}
                loadingLabel="Logging in"
                className="min-h-14 rounded-[10px] text-base font-bold"
              >
                Log in
              </Button>
            </form>

            {/* Registration */}
            <div className="mt-8 pt-2">
              <p className="text-sm text-muted-foreground">
                New to Feasta?{" "}
                <Link
                  href="/provider-register"
                  className="
                    rounded-[6px]
                    font-bold
                    text-primary-strong
                    underline-offset-4
                    hover:underline
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-ring
                  "
                >
                  Become a Provider
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
