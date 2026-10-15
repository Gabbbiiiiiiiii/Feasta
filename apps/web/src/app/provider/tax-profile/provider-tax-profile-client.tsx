"use client";

import {
  BadgeCheck,
  CircleAlert,
  FileText,
  LockKeyhole,
  RefreshCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

import type {
  TaxRegistrationStatus,
} from "@feasta/shared-types";

import {
  AuthStatus,
} from "@/components/auth/auth-status";
import {
  feastaToast,
} from "@/components/feedback/toast";
import {
  PageHeading,
} from "@/components/layout/page-heading";
import {
  Button,
} from "@/components/ui/button";
import {
  Input,
} from "@/components/ui/input";
import {
  submitProviderTaxProfile,
} from "@/lib/provider/tax-profile/provider-tax-profile-client";
import type {
  ProviderTaxProfile,
} from "@/lib/provider/tax-profile/provider-tax-profile-types";

type TaxForm = {
  birRegisteredName: string;
  tin: string;
  taxType:
    TaxRegistrationStatus | "";
};

type TaxFormErrors =
  Partial<
    Record<
      keyof TaxForm,
      string
    >
  >;

export function ProviderTaxProfileClient({
  initialProfile,
}: {
  initialProfile:
    ProviderTaxProfile;
}) {
  const router =
    useRouter();

  const operation =
    useRef(false);

  const initialForm =
    useMemo(
      () =>
        formFromProfile(
          initialProfile,
        ),
      [initialProfile],
    );

  const [
    canonicalForm,
    setCanonicalForm,
  ] =
    useState(initialForm);

  const [
    form,
    setForm,
  ] =
    useState(initialForm);

  const [
    verificationStatus,
    setVerificationStatus,
  ] =
    useState(
      initialProfile
        .verificationStatus,
    );

  const [
    errors,
    setErrors,
  ] =
    useState<TaxFormErrors>(
      {},
    );

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<
      string | null
    >(null);

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState<
      string | null
    >(null);

  const locked =
    verificationStatus ===
      "pending" ||
    verificationStatus ===
      "verified";

  const dirty =
    serializeForm(form) !==
    serializeForm(
      canonicalForm,
    );

  function updateField<
    K extends keyof TaxForm
  >(
    field: K,
    value: TaxForm[K],
  ) {
    setForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );

    setErrors(
      (current) => ({
        ...current,
        [field]: undefined,
      }),
    );

    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function discard() {
    if (saving) {
      return;
    }

    setForm(
      canonicalForm,
    );

    setErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function submit() {
    if (
      operation.current ||
      saving ||
      locked
    ) {
      return;
    }

    const validated =
      validateForm(form);

    setErrors(
      validated.errors,
    );

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validated.value) {
      setErrorMessage(
        "Review the highlighted tax information.",
      );
      return;
    }

    operation.current = true;
    setSaving(true);

    try {
      const result =
        await submitProviderTaxProfile(
          validated.value,
        );

      setCanonicalForm({
        birRegisteredName:
          validated.value
            .birRegisteredName,

        tin:
          validated.value.tin,

        taxType:
          validated.value.taxType,
      });

      setForm({
        birRegisteredName:
          validated.value
            .birRegisteredName,

        tin:
          validated.value.tin,

        taxType:
          validated.value.taxType,
      });

      setVerificationStatus(
        result.verificationStatus,
      );

      setErrors({});

      setSuccessMessage(
        result.changed
          ? "Tax profile submitted for administrator review."
          : "Your tax profile is already submitted.",
      );

      feastaToast.success(
        result.changed
          ? "Tax profile submitted."
          : "Tax profile is already submitted.",
      );

      router.refresh();
    } catch (error) {
      const message =
        safeErrorMessage(
          error,
          "The tax profile could not be submitted. Please try again.",
        );

      setErrorMessage(
        message,
      );

      feastaToast.error(
        message,
      );
    } finally {
      operation.current =
        false;

      setSaving(false);
    }
  }

  const actionLabel =
    verificationStatus ===
      "rejected"
      ? "Resubmit Tax Profile"
      : "Submit Tax Profile";

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Business"
        title="Tax Profile"
        description="Manage the tax identity FEASTA uses for provider-side financial records."
      />

      <section
        aria-labelledby="tax-status-title"
        className="grid gap-4 rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <ShieldCheck
              aria-hidden="true"
              className="size-5"
            />
          </div>

          <div className="min-w-0">
            <h2
              id="tax-status-title"
              className="text-xl font-bold"
            >
              Tax verification
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Provider tax verification is separate from business registration,
              provider approval, and FEASTA&apos;s own platform tax settings.
            </p>
          </div>
        </div>

        <StatusCard
          status={
            verificationStatus
          }
          rejectionReason={
            initialProfile
              .rejectionReason
          }
        />

        <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
          <p>
            Having a TIN does not automatically mean a provider is
            VAT-registered.
          </p>

          <p>
            Being registered as a business or operating as an individual also
            does not automatically determine VAT status.
          </p>
        </div>
      </section>

      <form
        aria-label="Provider tax profile"
        aria-busy={
          saving ||
          undefined
        }
        className="grid gap-6"
        onSubmit={(
          event,
        ) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
      >
        <section
          aria-labelledby="tax-information-title"
          className="grid gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <FileText
                aria-hidden="true"
                className="size-5"
              />
            </div>

            <div>
              <h2
                id="tax-information-title"
                className="text-xl font-bold"
              >
                Registered tax information
              </h2>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Enter the information that should be reviewed for this
                provider&apos;s tax profile.
              </p>
            </div>
          </div>

          {locked ? (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <LockKeyhole
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              />

              <p className="text-sm leading-6 text-muted-foreground">
                {verificationStatus ===
                "verified"
                  ? "This verified tax profile is locked. Contact FEASTA support if the registered tax information changes."
                  : "This tax profile is locked while an administrator reviews the submitted information."}
              </p>
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <label
                htmlFor="provider-tax-registered-name"
                className="font-semibold text-foreground"
              >
                BIR registered name
              </label>

              <Input
                id="provider-tax-registered-name"
                value={
                  form
                    .birRegisteredName
                }
                disabled={
                  saving ||
                  locked
                }
                maxLength={160}
                autoComplete="organization"
                aria-invalid={
                  errors
                    .birRegisteredName
                    ? "true"
                    : undefined
                }
                aria-describedby={
                  errors
                    .birRegisteredName
                    ? "provider-tax-registered-name-error"
                    : "provider-tax-registered-name-help"
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "birRegisteredName",
                    event
                      .currentTarget
                      .value,
                  )
                }
              />

              {errors
                .birRegisteredName ? (
                <p
                  id="provider-tax-registered-name-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {
                    errors
                      .birRegisteredName
                  }
                </p>
              ) : (
                <p
                  id="provider-tax-registered-name-help"
                  className="text-sm text-muted-foreground"
                >
                  Use the registered name shown in the provider&apos;s BIR
                  records.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="provider-tax-tin"
                className="font-semibold text-foreground"
              >
                TIN
              </label>

              <Input
                id="provider-tax-tin"
                value={form.tin}
                disabled={
                  saving ||
                  locked
                }
                inputMode="numeric"
                autoComplete="off"
                maxLength={24}
                aria-invalid={
                  errors.tin
                    ? "true"
                    : undefined
                }
                aria-describedby={
                  errors.tin
                    ? "provider-tax-tin-error"
                    : "provider-tax-tin-help"
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "tin",
                    event
                      .currentTarget
                      .value,
                  )
                }
              />

              {errors.tin ? (
                <p
                  id="provider-tax-tin-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.tin}
                </p>
              ) : (
                <p
                  id="provider-tax-tin-help"
                  className="text-sm text-muted-foreground"
                >
                  Enter 9–15 digits. Spaces and hyphens are accepted while
                  typing.
                </p>
              )}
            </div>

            <fieldset
              disabled={
                saving ||
                locked
              }
              className="grid gap-3"
              aria-describedby="provider-tax-type-help"
            >
              <legend className="font-semibold text-foreground">
                Tax classification
              </legend>

              <label className="flex cursor-pointer gap-3 rounded-lg border border-border bg-background p-4">
                <input
                  type="radio"
                  name="providerTaxType"
                  value="non_vat"
                  checked={
                    form.taxType ===
                    "non_vat"
                  }
                  onChange={() =>
                    updateField(
                      "taxType",
                      "non_vat",
                    )
                  }
                  className="mt-1 size-4 shrink-0 accent-primary"
                />

                <span className="grid gap-1">
                  <span className="font-semibold text-foreground">
                    Non-VAT
                  </span>

                  <span className="text-sm leading-5 text-muted-foreground">
                    Use only when this provider&apos;s tax registration is
                    classified as non-VAT.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer gap-3 rounded-lg border border-border bg-background p-4">
                <input
                  type="radio"
                  name="providerTaxType"
                  value="vat_registered"
                  checked={
                    form.taxType ===
                    "vat_registered"
                  }
                  onChange={() =>
                    updateField(
                      "taxType",
                      "vat_registered",
                    )
                  }
                  className="mt-1 size-4 shrink-0 accent-primary"
                />

                <span className="grid gap-1">
                  <span className="font-semibold text-foreground">
                    VAT Registered
                  </span>

                  <span className="text-sm leading-5 text-muted-foreground">
                    Use only when the provider is actually registered under a
                    VAT classification.
                  </span>
                </span>
              </label>

              {errors.taxType ? (
                <p
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.taxType}
                </p>
              ) : (
                <p
                  id="provider-tax-type-help"
                  className="text-sm text-muted-foreground"
                >
                  FEASTA does not infer this choice from TIN,
                  business-registration type, or provider-verification status.
                </p>
              )}
            </fieldset>
          </div>
        </section>

        {!locked ? (
          <section
            aria-label="Tax profile save controls"
            className="sticky bottom-3 z-10 grid gap-3 rounded-card border border-border bg-card/95 p-4 shadow-card backdrop-blur sm:flex sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-bold">
                {verificationStatus ===
                "rejected"
                  ? "Correct the rejected information before resubmitting."
                  : dirty
                    ? "You have unsaved tax-profile changes."
                    : "Complete the tax profile before submission."}
              </p>

              <p className="text-sm text-muted-foreground">
                Submitted information becomes locked while it is under review.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                disabled={
                  saving ||
                  !dirty
                }
                onClick={discard}
              >
                <RefreshCcw
                  aria-hidden="true"
                  className="size-4"
                />
                Discard changes
              </Button>

              <Button
                type="submit"
                loading={saving}
                disabled={
                  saving ||
                  (
                    verificationStatus !==
                      "rejected" &&
                    !dirty
                  )
                }
              >
                <Save
                  aria-hidden="true"
                  className="size-4"
                />
                {actionLabel}
              </Button>
            </div>
          </section>
        ) : null}

        {successMessage ? (
          <AuthStatus
            message={
              successMessage
            }
            tone="success"
          />
        ) : null}

        {errorMessage ? (
          <AuthStatus
            message={
              errorMessage
            }
            tone="error"
          />
        ) : null}
      </form>
    </div>
  );
}

function StatusCard({
  status,
  rejectionReason,
}: {
  status:
    ProviderTaxProfile[
      "verificationStatus"
    ];

  rejectionReason:
    string | null;
}) {
  if (
    status === "verified"
  ) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-subtle p-4">
        <BadgeCheck
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-success"
        />

        <div>
          <p className="font-semibold text-foreground">
            Verified
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            An administrator has verified this provider tax profile.
          </p>
        </div>
      </div>
    );
  }

  if (
    status === "pending"
  ) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-subtle p-4">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-warning"
        />

        <div>
          <p className="font-semibold text-foreground">
            Pending review
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            The submitted tax information is waiting for administrator review.
          </p>
        </div>
      </div>
    );
  }

  if (
    status === "rejected"
  ) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive-subtle p-4">
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />

        <div>
          <p className="font-semibold text-foreground">
            Correction required
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            {rejectionReason ??
              "Review and correct the tax information before resubmitting."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <FileText
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
      />

      <div>
        <p className="font-semibold text-foreground">
          Not submitted
        </p>

        <p className="mt-1 text-sm text-muted-foreground">
          Complete the provider tax information and submit it for review.
        </p>
      </div>
    </div>
  );
}

function formFromProfile(
  profile:
    ProviderTaxProfile,
): TaxForm {
  return {
    birRegisteredName:
      profile
        .birRegisteredName,

    tin:
      profile.tin,

    taxType:
      profile.taxType ??
      "",
  };
}

function serializeForm(
  value: TaxForm,
): string {
  return JSON.stringify(
    value,
  );
}

function validateForm(
  value: TaxForm,
): {
  value: {
    birRegisteredName:
      string;

    tin: string;

    taxType:
      TaxRegistrationStatus;
  } | null;

  errors:
    TaxFormErrors;
} {
  const errors:
    TaxFormErrors = {};

  const birRegisteredName =
    value
      .birRegisteredName
      .trim();

  if (
    birRegisteredName
      .length < 2 ||
    birRegisteredName
      .length > 160
  ) {
    errors
      .birRegisteredName =
      "BIR registered name must be between 2 and 160 characters.";
  }

  const tinSource =
    value.tin.trim();

  if (
    !/^[0-9\s-]+$/u.test(
      tinSource,
    )
  ) {
    errors.tin =
      "TIN may contain only digits, spaces, and hyphens.";
  }

  const tin =
    tinSource.replace(
      /\D/gu,
      "",
    );

  if (
    tin.length < 9 ||
    tin.length > 15
  ) {
    errors.tin =
      "TIN must contain between 9 and 15 digits.";
  }

  if (
    value.taxType !==
      "non_vat" &&
    value.taxType !==
      "vat_registered"
  ) {
    errors.taxType =
      "Choose Non-VAT or VAT Registered.";
  }

  if (
    Object.keys(
      errors,
    ).length > 0 ||
    (
      value.taxType !==
        "non_vat" &&
      value.taxType !==
        "vat_registered"
    )
  ) {
    return {
      value: null,
      errors,
    };
  }

  return {
    value: {
      birRegisteredName,
      tin,
      taxType:
        value.taxType,
    },
    errors,
  };
}

function safeErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    error instanceof Error
  ) {
    const message =
      error.message.trim();

    if (
      message.length > 0 &&
      message.length <= 240
    ) {
      return message;
    }
  }

  return fallback;
}
