"use client";

import {FormEvent, useRef, useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarCheck2,
  Info,
  UsersRound,
} from "lucide-react";
import {normalizePhilippineMobile} from "@feasta/shared-types";

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

type ProviderRegistrationErrors = Partial<
  Record<
    | "firstName"
    | "lastName"
    | "phoneNumber"
    | "email"
    | "password"
    | "confirmation"
    | "agreements",
    string
  >
>;

const providerBenefits = [
  {
    title: "Reach more customers",
    description:
      "Showcase your catering or event services to customers planning celebrations in Ormoc City.",
    icon: UsersRound,
  },
  {
    title: "Manage your services",
    description:
      "Maintain your business profile, packages, availability, and provider information from one workspace.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Receive booking opportunities",
    description:
      "Review customer booking requests and manage upcoming confirmed events through FEASTA.",
    icon: CalendarCheck2,
  },
] as const;

const providerJourney = [
  "Create provider account",
  "Verify email",
  "Verify registered mobile number",
  "Complete business profile",
  "Submit required verification information",
  "FEASTA reviews the provider application",
  "Approved provider becomes available for appropriate platform use",
] as const;

export default function ProviderRegistrationPage() {
  const router = useRouter();
  const submitting = useRef(false);

  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    password: "",
    confirmation: "",
  });

  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] =
    useState<ProviderRegistrationErrors>({});

  const [serverError, setServerError] =
    useState<string | null>(null);

  const update = (
    key: keyof typeof values,
    value: string,
  ) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    const normalizedPhoneNumber =
      normalizePhilippineMobile(
        phoneNumberForNormalization(
          values.phoneNumber,
        ),
      );
    const validationErrors =
      validateProviderRegistration(
        values,
        accepted,
      );

    setErrors(validationErrors);
    setServerError(null);

    if (
      Object.keys(validationErrors).length >
      0 ||
      !normalizedPhoneNumber
    ) {
      setServerError(
        "Review the highlighted fields before creating your provider account.",
      );
      return;
    }

    submitting.current = true;
    setLoading(true);
    setServerError(null);

    try {
      const result =
        await registerProviderIdentity({
          firstName: values.firstName,
          lastName: values.lastName,
          phoneNumber: normalizedPhoneNumber,
          email: values.email,
          password: values.password,
          acceptedTerms: accepted,
          acceptedPrivacy: accepted,
          termsPolicyVersion:
            UNVERSIONED_POLICY_VERSION,
          privacyPolicyVersion:
            UNVERSIONED_POLICY_VERSION,
        });

      router.replace(
        `/provider-verify-email?delivery=${
          result.verificationEmailSent
            ? "sent"
            : "retry"
        }`,
      );
    } catch (caught) {
      setServerError(
        customerAuthenticationError(
          caught,
        ),
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const fieldClassName =
    "h-14 min-h-14 rounded-[10px] px-4 py-3 text-[15px]";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="relative z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between px-4 sm:px-8 lg:px-10">
          <Link
            href="/"
            aria-label="FEASTA home"
            className="inline-flex items-center gap-2 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Image
              src="/images/feasta_logo.png"
              alt=""
              width={42}
              height={42}
              priority
              className="size-10 object-contain"
            />
            <span className="text-xl font-black tracking-[-0.03em] sm:text-2xl">
              <span className="text-primary">Feasta</span>{" "}
              <span className="text-foreground">Provider</span>
            </span>
          </Link>

          <Link
            href="/provider-login"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Login
          </Link>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-foreground">
        <Image
          src="https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=2200&q=90"
          alt="Catering team preparing an elegant event venue"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black/50"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/55 to-black/35 lg:from-black/45 lg:via-black/55 lg:to-black/75"
        />

        <div className="relative z-10 mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:min-h-[820px] lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:px-10 lg:py-14 xl:gap-24">
          <section
            aria-labelledby="provider-registration-heading"
            className="order-2 w-full rounded-[14px] border border-white/20 bg-card p-5 shadow-modal sm:p-7 lg:order-1"
          >
            <div className="mb-5">
              <h2
                id="provider-registration-heading"
                className="text-2xl font-black tracking-[-0.025em] sm:text-3xl"
              >
                Ready to grow your business?
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Create your provider account to get started.
              </p>
            </div>

            <form
              className="grid gap-3.5"
              onSubmit={submit}
              noValidate
              aria-describedby={
                serverError
                  ? "provider-registration-error"
                  : undefined
              }
            >
              <div className="grid gap-3.5 sm:grid-cols-2">
                <FormField
                  id="provider-owner-first-name"
                  label="First name"
                  labelClassName="sr-only"
                  required
                  disabled={loading}
                  error={errors.firstName}
                >
                  <Input
                    autoComplete="given-name"
                    placeholder="First name *"
                    className={fieldClassName}
                    value={values.firstName}
                    onChange={(event) =>
                      update("firstName", event.target.value)
                    }
                  />
                </FormField>

                <FormField
                  id="provider-owner-last-name"
                  label="Last name"
                  labelClassName="sr-only"
                  required
                  disabled={loading}
                  error={errors.lastName}
                >
                  <Input
                    autoComplete="family-name"
                    placeholder="Last name *"
                    className={fieldClassName}
                    value={values.lastName}
                    onChange={(event) =>
                      update("lastName", event.target.value)
                    }
                  />
                </FormField>
              </div>

              <FormField
                id="provider-phone-number"
                label="Mobile number"
                labelClassName="sr-only"
                required
                disabled={loading}
                error={errors.phoneNumber}
              >
                <div className="flex min-w-0 rounded-[10px] border border-input bg-card transition-colors hover:border-foreground/70 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <span className="sr-only">
                    Philippines country code plus 63
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-14 shrink-0 items-center border-r border-input px-4 text-[15px] font-bold text-foreground"
                  >
                    +63
                  </span>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Mobile phone number *"
                    maxLength={30}
                    aria-describedby={[
                      "provider-phone-note",
                      errors.phoneNumber
                        ? "provider-phone-number-error"
                        : null,
                    ].filter(Boolean).join(" ")}
                    className="h-14 min-h-14 min-w-0 rounded-l-none rounded-r-[9px] border-0 px-4 py-3 text-[15px] hover:border-transparent focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    value={values.phoneNumber}
                    onChange={(event) =>
                      update(
                        "phoneNumber",
                        localPhoneDisplayValue(
                          event.target.value,
                        ),
                      )
                    }
                  />
                </div>

                <div
                  id="provider-phone-note"
                  className="flex items-start gap-2.5 rounded-[10px] bg-secondary px-3.5 py-3 text-sm leading-5 text-muted-foreground"
                >
                  <Info
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-primary-strong"
                  />
                  <p>
                    You&apos;ll verify this number by OTP after email
                    verification. It may also be used for important FEASTA
                    provider and account communication.
                  </p>
                </div>
              </FormField>

              <FormField
                id="provider-email"
                label="Email address"
                labelClassName="sr-only"
                required
                disabled={loading}
                error={errors.email}
              >
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Email address *"
                  className={fieldClassName}
                  value={values.email}
                  onChange={(event) =>
                    update("email", event.target.value)
                  }
                />
              </FormField>

              <FormField
                id="provider-password"
                label="Password"
                labelClassName="sr-only"
                required
                disabled={loading}
                error={errors.password}
              >
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Create password *"
                  aria-describedby={[
                    "provider-password-help",
                    errors.password
                      ? "provider-password-error"
                      : null,
                  ].filter(Boolean).join(" ")}
                  className={fieldClassName}
                  value={values.password}
                  onChange={(event) =>
                    update("password", event.target.value)
                  }
                />
                <p
                  id="provider-password-help"
                  className="text-xs leading-5 text-muted-foreground"
                >
                  Use at least 8 characters.
                </p>
              </FormField>

              <FormField
                id="provider-password-confirmation"
                label="Confirm password"
                labelClassName="sr-only"
                required
                disabled={loading}
                error={errors.confirmation}
              >
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Confirm password *"
                  className={fieldClassName}
                  value={values.confirmation}
                  onChange={(event) =>
                    update("confirmation", event.target.value)
                  }
                />
              </FormField>

              <div className="pt-0.5">
                <label
                  htmlFor="provider-policy-agreement"
                  className="flex min-h-11 items-start gap-3 rounded-[10px] px-1 py-2 focus-within:ring-2 focus-within:ring-ring"
                >
                  <input
                    id="provider-policy-agreement"
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                    checked={accepted}
                    disabled={loading}
                    aria-invalid={
                      Boolean(errors.agreements) || undefined
                    }
                    aria-describedby={
                      errors.agreements
                        ? "provider-agreements-error"
                        : undefined
                    }
                    onChange={(event) =>
                      setAccepted(event.target.checked)
                    }
                  />
                  <span className="text-sm leading-6">
                    By creating an account, I agree to the FEASTA{" "}
                    <Link
                      href="/terms"
                      className="font-bold text-primary-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="font-bold text-primary-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

                {errors.agreements ? (
                  <p
                    id="provider-agreements-error"
                    role="alert"
                    className="mt-1 text-sm font-semibold text-destructive"
                  >
                    {errors.agreements}
                  </p>
                ) : null}
              </div>

              {serverError ? (
                <AuthStatus
                  id="provider-registration-error"
                  message={serverError}
                  tone="error"
                />
              ) : null}

              <Button
                type="submit"
                fullWidth
                loading={loading}
                loadingLabel="Creating provider account"
                className="h-[52px] min-h-[52px] rounded-[10px]"
              >
                Create Provider Account
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Already have a provider account?{" "}
              <Link
                href="/provider-login"
                className="font-bold text-primary-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Log in
              </Link>
            </p>
          </section>

          <div className="order-1 max-w-2xl text-white lg:order-2">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">
              Become a FEASTA provider
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.06] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Grow your event business with FEASTA.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
              Connect with customers looking for trusted catering and event
              services in Ormoc City.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">
              Create your provider account to begin onboarding and
              verification.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-card px-4 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-strong">
              Provider benefits
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              Grow your event business with FEASTA
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {providerBenefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article
                  key={benefit.title}
                  className="rounded-[14px] border border-border bg-background p-6 shadow-card"
                >
                  <span className="flex size-12 items-center justify-center rounded-[10px] bg-secondary text-primary-strong">
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  <h3 className="mt-5 text-base font-black uppercase tracking-[0.08em]">
                    {benefit.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {benefit.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-secondary px-4 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-strong">
              Provider journey
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              From account creation to FEASTA review
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Provider approval is not automatic. Each business completes
              onboarding and submits the required information for FEASTA review.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {providerJourney.map((step, index) => (
              <li
                key={step}
                className="flex min-w-0 items-start gap-4 rounded-[14px] border border-border bg-card p-5 shadow-card"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-sm font-black text-primary-foreground">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm font-bold leading-6">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
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
  const errors: ProviderRegistrationErrors =
    {};

  if (!values.firstName.trim()) {
    errors.firstName =
      "Enter the account owner's first name.";
  }

  if (!values.lastName.trim()) {
    errors.lastName =
      "Enter the account owner's last name.";
  }

  if (!values.phoneNumber.trim()) {
    errors.phoneNumber =
      "Mobile number is required.";
  } else if (
    !normalizePhilippineMobile(
      phoneNumberForNormalization(
        values.phoneNumber,
      ),
    )
  ) {
    errors.phoneNumber =
      "Enter a valid Philippine mobile number.";
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(
      values.email.trim(),
    )
  ) {
    errors.email =
      "Enter a valid email address.";
  }

  if (values.password.length < 8) {
    errors.password =
      "Use at least 8 characters.";
  }

  if (!values.confirmation) {
    errors.confirmation =
      "Confirm your password.";
  } else if (
    values.password !==
    values.confirmation
  ) {
    errors.confirmation =
      "Passwords do not match.";
  }

  if (!accepted) {
    errors.agreements =
      "Accept the Terms and Privacy Policy to continue.";
  }

  return errors;
}

function phoneNumberForNormalization(value: string): string {
  const candidate = value.trim();
  return candidate.startsWith("9")
    ? `+63${candidate}`
    : candidate;
}

function localPhoneDisplayValue(value: string): string {
  const candidate = value.trimStart();
  if (candidate.startsWith("+63")) {
    return candidate.slice(3).trimStart();
  }
  if (candidate.startsWith("63")) {
    return candidate.slice(2).trimStart();
  }
  if (candidate.startsWith("0")) {
    return candidate.slice(1);
  }
  return value;
}
