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
import {
  registerProviderIdentity,
  UNVERSIONED_POLICY_VERSION,
} from "@/lib/auth/provider-client";

type ProviderRegistrationErrors = Partial<Record<
  "firstName" | "lastName" | "phoneNumber" | "email" | "password" | "confirmation" | "agreements",
  string
>>;

export default function ProviderRegistrationPage() {
  const router = useRouter();
  const submitting = useRef(false);
  const [values, setValues] = useState({
    firstName: "", lastName: "", phoneNumber: "", email: "",
    password: "", confirmation: "",
  });
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ProviderRegistrationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const validationErrors = validateProviderRegistration(values, accepted);
    setErrors(validationErrors);
    setServerError(null);
    if (Object.keys(validationErrors).length > 0) {
      setServerError("Review the highlighted fields before creating your provider account.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setServerError(null);
    try {
      const result = await registerProviderIdentity({
        firstName: values.firstName,
        lastName: values.lastName,
        phoneNumber: values.phoneNumber,
        email: values.email,
        password: values.password,
        acceptedTerms: accepted,
        acceptedPrivacy: accepted,
        termsPolicyVersion: UNVERSIONED_POLICY_VERSION,
        privacyPolicyVersion: UNVERSIONED_POLICY_VERSION,
      });
      router.replace(
        `/provider-verify-email?delivery=${result.verificationEmailSent ? "sent" : "retry"}`,
      );
    } catch (caught) {
      setServerError(customerAuthenticationError(caught));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const update = (key: keyof typeof values, value: string) => {
    setValues((current) => ({...current, [key]: value}));
  };

  return (
    <AuthCard portal="provider" title="Register a provider account" description="Create the owner identity first. Business activation remains controlled by FEASTA verification." footer={<Link className="font-bold text-primary-strong underline" href="/provider-login">Already registered? Provider sign in</Link>}>
      <form className="grid min-w-0 gap-4" onSubmit={submit} noValidate aria-describedby={serverError ? "provider-registration-error" : undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Owner first name" required disabled={loading} error={errors.firstName}><Input autoComplete="given-name" value={values.firstName} onChange={(event) => update("firstName", event.target.value)} /></FormField>
          <FormField label="Owner last name" required disabled={loading} error={errors.lastName}><Input autoComplete="family-name" value={values.lastName} onChange={(event) => update("lastName", event.target.value)} /></FormField>
        </div>
        <FormField label="Phone number" required disabled={loading} error={errors.phoneNumber}><Input type="tel" inputMode="tel" autoComplete="tel" value={values.phoneNumber} onChange={(event) => update("phoneNumber", event.target.value)} /></FormField>
        <FormField label="Email address" required disabled={loading} error={errors.email}><Input type="email" inputMode="email" autoComplete="email" value={values.email} onChange={(event) => update("email", event.target.value)} /></FormField>
        <FormField label="Password" description="Use at least 8 characters." required disabled={loading} error={errors.password}><PasswordInput autoComplete="new-password" value={values.password} onChange={(event) => update("password", event.target.value)} /></FormField>
        <FormField label="Confirm password" required disabled={loading} error={errors.confirmation}><PasswordInput autoComplete="new-password" value={values.confirmation} onChange={(event) => update("confirmation", event.target.value)} /></FormField>
        <label className="flex min-h-12 items-start gap-3 rounded-lg p-2 focus-within:ring-2 focus-within:ring-ring">
          <input className="mt-1 size-5 shrink-0 accent-primary" type="checkbox" checked={accepted} disabled={loading} aria-invalid={Boolean(errors.agreements) || undefined} aria-describedby={errors.agreements ? "provider-agreements-error" : undefined} onChange={(event) => setAccepted(event.target.checked)} />
          <span>I accept the FEASTA <Link className="font-semibold text-primary-strong underline" href="/terms">Terms</Link> and <Link className="font-semibold text-primary-strong underline" href="/privacy">Privacy Policy</Link>.</span>
        </label>
        {errors.agreements ? <p id="provider-agreements-error" className="text-sm font-semibold text-destructive" role="alert">{errors.agreements}</p> : null}
        {serverError ? <AuthStatus id="provider-registration-error" message={serverError} tone="error" /> : null}
        <Button type="submit" fullWidth loading={loading} loadingLabel="Creating provider account">Create provider account</Button>
      </form>
    </AuthCard>
  );
}

function validateProviderRegistration(
  values: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string;
    password: string;
    confirmation: string;
  },
  accepted: boolean,
): ProviderRegistrationErrors {
  const errors: ProviderRegistrationErrors = {};
  if (!values.firstName.trim()) errors.firstName = "Enter the account owner's first name.";
  if (!values.lastName.trim()) errors.lastName = "Enter the account owner's last name.";
  if (values.phoneNumber.trim().length < 7) errors.phoneNumber = "Enter a valid phone number.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (values.password.length < 8) {
    errors["password"] = "Use at least 8 characters.";
  }
  if (!values.confirmation) {
    errors.confirmation = "Confirm your password.";
  } else if (values.password !== values.confirmation) {
    errors.confirmation = "Passwords do not match.";
  }
  if (!accepted) errors.agreements = "Accept the Terms and Privacy Policy to continue.";
  return errors;
}
