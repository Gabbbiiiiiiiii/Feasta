"use client";

import {signInValidationError} from "@/lib/auth/sign-in-validation";
import {FormEvent, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarCheck2,
  PackageCheck,
} from "lucide-react";

import {PortalSignInLayout} from "@/components/auth/portal-sign-in-layout";
import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {providerSignInError} from "@/lib/auth/error-messages";
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
    const validationError = signInValidationError(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }


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
      setError(providerSignInError(caught));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <PortalSignInLayout
      eyebrow="Feasta Provider"
      portalLabel="FEASTA Provider Portal"
      introTitle="Manage your event business with Feasta."
      introDescription="Access your provider workspace to manage your business, services, booking opportunities, and provider account."
      title="Welcome back"
      description="Sign in to your Feasta provider account."
      brandHref="/provider-register"
      benefits={providerBenefits}
    >
    {/* Login form */}
    <form
      className="mt-10 grid gap-5"
      onSubmit={submit}
        noValidate
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
          href="/forgot-password?role=provider"
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
    </PortalSignInLayout>
  );
}
