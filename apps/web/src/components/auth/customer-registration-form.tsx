"use client";

import {useRef, useState, type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
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

export function CustomerRegistrationForm({returnTo: requestedReturnTo = null, onLogin, onComplete, layout = "page"}: {
  returnTo?: string | null;
  onLogin?: () => void;
  onComplete?: () => void;
  layout?: "page" | "dialog";
}) {
  const router = useRouter();
  const returnTo = safeCustomerReturnTo(requestedReturnTo);
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
      const status = result.verificationEmailSent
        ? "sent"
        : "retry";

      const verificationParameters =
        new URLSearchParams({
          registration: "complete",
          delivery: status,
        });

      if (returnTo) {
        verificationParameters.set(
          "next",
          returnTo,
        );
      }

      router.replace(
        `/verify-email?${verificationParameters.toString()}`,
      );
      onComplete?.();
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
    <>
      <form
        className={layout === "dialog" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "grid gap-4"}
        onSubmit={submit}
        noValidate
        aria-describedby={serverError ? "registration-error" : undefined}
      >
        <div
          role={layout === "dialog" ? "region" : undefined}
          aria-label={layout === "dialog" ? "Registration details" : undefined}
          tabIndex={layout === "dialog" ? 0 : undefined}
          className={layout === "dialog"
            ? "mx-3 grid min-h-0 gap-4 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:mx-4 sm:px-4"
            : "grid gap-4"}
        >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="First name"
            required
            error={errors.firstName}
            disabled={loading}
          >
            <Input
              autoComplete="given-name"
              value={values.firstName}
              onChange={(event) =>
                update("firstName", event.target.value)
              }
              className="min-h-12 rounded-[10px]"
            />
          </FormField>

          <FormField
            label="Last name"
            required
            error={errors.lastName}
            disabled={loading}
          >
            <Input
              autoComplete="family-name"
              value={values.lastName}
              onChange={(event) =>
                update("lastName", event.target.value)
              }
              className="min-h-12 rounded-[10px]"
            />
          </FormField>
        </div>

        <FormField
          label="Email address"
          required
          error={errors.email}
          disabled={loading}
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) =>
              update("email", event.target.value)
            }
            className="min-h-12 rounded-[10px]"
          />
        </FormField>

        <FormField
          label="Password"
          description="Use at least 8 characters."
          required
          error={errors.password}
          disabled={loading}
        >
          <PasswordInput
            autoComplete="new-password"
            value={values.password}
            onChange={(event) =>
              update("password", event.target.value)
            }
            className="min-h-12 rounded-[10px]"
          />
        </FormField>

        <FormField
          label="Confirm password"
          required
          error={errors.confirmPassword}
          disabled={loading}
        >
          <PasswordInput
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(event) =>
              update("confirmPassword", event.target.value)
            }
            className="min-h-12 rounded-[10px]"
          />
        </FormField>

        <fieldset
          className="grid gap-2"
          aria-describedby={
            errors.terms ? "consent-error" : undefined
          }
        >
          <legend className="text-sm font-bold">
            Agreements
          </legend>

          <label className="flex min-h-11 items-start gap-3 rounded-lg px-1 py-2 hover:bg-secondary">
            <input
              className="mt-1 size-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="checkbox"
              checked={acceptedTerms}
              disabled={loading}
              onChange={(event) =>
                setAcceptedTerms(event.target.checked)
              }
            />

            <span className="text-sm">
              I accept the{" "}
              <Link
                className="font-semibold text-primary-strong underline underline-offset-2"
                href="/terms"
              >
                Terms
              </Link>
              .
            </span>
          </label>

          <label className="flex min-h-11 items-start gap-3 rounded-lg px-1 py-2 hover:bg-secondary">
            <input
              className="mt-1 size-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="checkbox"
              checked={acceptedPrivacy}
              disabled={loading}
              onChange={(event) =>
                setAcceptedPrivacy(event.target.checked)
              }
            />

            <span className="text-sm">
              I accept the{" "}
              <Link
                className="font-semibold text-primary-strong underline underline-offset-2"
                href="/privacy"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          {errors.terms ? (
            <p
              id="consent-error"
              className="text-sm font-semibold text-destructive"
              role="alert"
            >
              {errors.terms}
            </p>
          ) : null}
        </fieldset>

        {serverError ? (
          <AuthStatus
            id="registration-error"
            message={serverError}
            tone="error"
          />
        ) : null}

        </div>
        <div className={layout === "dialog" ? "shrink-0 border-t border-border bg-card px-6 py-3 sm:px-8" : undefined}>
        <Button
          type="submit"
          fullWidth
          loading={loading}
          loadingLabel="Creating account"
          className={layout === "dialog" ? "min-h-12 rounded-[10px] text-base font-bold" : "mt-2 min-h-12 rounded-[10px] text-base font-bold"}
        >
          Create account
        </Button>
      <div className={layout === "dialog" ? "mt-1 text-center text-sm text-muted-foreground" : "mt-5 border-t border-border pt-4 text-sm text-muted-foreground"}>
        Already have an account?{" "}
        {onLogin ? (
          <button type="button" disabled={loading} onClick={onLogin} className="min-h-12 rounded-lg px-1 font-bold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">Log in</button>
        ) : (
          <Link className="inline-flex min-h-12 items-center rounded-lg font-bold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={returnTo ? '/login?next=' + encodeURIComponent(returnTo) : '/login'}>Log in</Link>
        )}
      </div>
      </div>
      </form>
    </>
  );
}

function safeCustomerReturnTo(
    value: string | null,
  ): string | null {
    if (
      !value ||
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value.includes("\\") ||
      value.includes("\r") ||
      value.includes("\n")
    ) {
      return null;
    }

    try {
      const decoded = decodeURIComponent(value);

      if (
        decoded.startsWith("//") ||
        decoded.includes("\\") ||
        decoded.includes("\r") ||
        decoded.includes("\n")
      ) {
        return null;
      }

      const base =
        new URL("https://feasta.invalid");

      const resolved =
        new URL(value, base);

      if (
        resolved.origin !== base.origin ||
        (
          resolved.pathname !== "/customer" &&
          !resolved.pathname.startsWith(
            "/customer/",
          )
        )
      ) {
        return null;
      }

      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
      return null;
    }
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
