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
import {registerCustomer} from "@/lib/auth/client-session";

type RegistrationErrors = Partial<Record<
  "firstName" | "lastName" | "email" | "password" | "confirmPassword" | "terms",
  string
>>;

export default function CustomerRegistrationPage() {
  const router = useRouter();
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors = validateRegistration(values, acceptedTerms, acceptedPrivacy);
    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    submitting.current = true;
    setLoading(true);
    try {
      const result = await registerCustomer({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        acceptedTerms: true,
        acceptedPrivacy: true,
      });
      const status = result.verificationEmailSent ? "sent" : "retry";
      router.replace(`/verify-email?registration=complete&delivery=${status}`);
    } catch (error) {
      setServerError(customerAuthenticationError(error));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const update = (key: keyof typeof values, value: string) => {
    setValues((current) => ({...current, [key]: value}));
  };

  return (
    <AuthCard
      title="Create your customer account"
      description="Register to manage bookings and save your favorite providers."
      footer={<p className="text-sm text-muted-foreground">Already registered?{" "}<Link className="font-bold text-primary-strong underline-offset-4 hover:underline" href="/login">Sign in</Link></p>}
    >
      <form className="grid gap-4" onSubmit={submit} noValidate aria-describedby={serverError ? "registration-error" : undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First name" required error={errors.firstName} disabled={loading}>
            <Input autoComplete="given-name" value={values.firstName} onChange={(event) => update("firstName", event.target.value)} />
          </FormField>
          <FormField label="Last name" required error={errors.lastName} disabled={loading}>
            <Input autoComplete="family-name" value={values.lastName} onChange={(event) => update("lastName", event.target.value)} />
          </FormField>
        </div>
        <FormField label="Email address" required error={errors.email} disabled={loading}>
          <Input type="email" inputMode="email" autoComplete="email" value={values.email} onChange={(event) => update("email", event.target.value)} />
        </FormField>
        <FormField label="Password" description="Use at least 8 characters." required error={errors.password} disabled={loading}>
          <PasswordInput autoComplete="new-password" value={values.password} onChange={(event) => update("password", event.target.value)} />
        </FormField>
        <FormField label="Confirm password" required error={errors.confirmPassword} disabled={loading}>
          <PasswordInput autoComplete="new-password" value={values.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} />
        </FormField>
        <fieldset className="grid gap-2" aria-describedby={errors.terms ? "consent-error" : undefined}>
          <legend className="text-sm font-bold">Agreements</legend>
          <label className="flex min-h-12 items-start gap-3 rounded-lg p-2 hover:bg-secondary">
            <input className="mt-1 size-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="checkbox" checked={acceptedTerms} disabled={loading} onChange={(event) => setAcceptedTerms(event.target.checked)} />
            <span>I accept the <Link className="font-semibold text-primary-strong underline" href="/terms">Terms</Link>.</span>
          </label>
          <label className="flex min-h-12 items-start gap-3 rounded-lg p-2 hover:bg-secondary">
            <input className="mt-1 size-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="checkbox" checked={acceptedPrivacy} disabled={loading} onChange={(event) => setAcceptedPrivacy(event.target.checked)} />
            <span>I accept the <Link className="font-semibold text-primary-strong underline" href="/privacy">Privacy Policy</Link>.</span>
          </label>
          {errors.terms ? <p id="consent-error" className="text-sm font-semibold text-destructive" role="alert">{errors.terms}</p> : null}
        </fieldset>
        {serverError ? <AuthStatus id="registration-error" message={serverError} tone="error" /> : null}
        <Button type="submit" fullWidth loading={loading} loadingLabel="Creating account">Create account</Button>
      </form>
    </AuthCard>
  );
}

function validateRegistration(
  values: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  },
  terms: boolean,
  privacy: boolean,
): RegistrationErrors {
  const errors: RegistrationErrors = {};
  if (!values.firstName.trim()) errors.firstName = "Enter your first name.";
  if (!values.lastName.trim()) errors.lastName = "Enter your last name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (values.password.length < 8) {
    errors["password"] = "Use at least 8 characters.";
  }
  if (values.password !== values.confirmPassword) {
    errors["confirmPassword"] = "Passwords do not match.";
  }
  if (!terms || !privacy) {
    errors.terms = "Accept both agreements to create an account.";
  }
  return errors;
}
