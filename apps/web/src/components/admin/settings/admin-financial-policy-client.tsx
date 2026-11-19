"use client";

import {
  CheckCircle2,
  Percent,
  ShieldCheck,
} from "lucide-react";
import {
  type FormEvent,
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  DEFAULT_PLATFORM_COMMISSION_MODEL,
  DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
} from "@feasta/shared-types";

import {
  updateAdminFinancialPolicyAction,
} from "@/app/admin/settings/actions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import type {
  AdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-types";

type AdminFinancialPolicyClientProps = {
  initialSettings:
    AdminPlatformSettings;
};

function AdminFinancialPolicyClient({
  initialSettings,
}: AdminFinancialPolicyClientProps) {
  const [
    savedSettings,
    setSavedSettings,
  ] = useState(
    initialSettings,
  );

  const [
    platformTaxStatus,
    setPlatformTaxStatus,
  ] = useState(
    initialSettings.platformTaxStatus,
  );

  const [
    vatPercentage,
    setVatPercentage,
  ] = useState(
    basisPointsToInput(
      initialSettings
        .platformVatRateBps,
    ),
  );

  const [
    minimumDepositPercentage,
    setMinimumDepositPercentage,
  ] = useState(
    basisPointsToInput(
      initialSettings
        .minimumDepositRateBps,
    ),
  );

  const [
    maximumDepositPercentage,
    setMaximumDepositPercentage,
  ] = useState(
    basisPointsToInput(
      initialSettings
        .maximumDepositRateBps,
    ),
  );

  const [
    internalReason,
    setInternalReason,
  ] = useState("");

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [success, setSuccess] =
    useState<string | null>(
      null,
    );

  const [
    isPending,
    startTransition,
  ] = useTransition();

  const commissionRateBps =
    DEFAULT_PLATFORM_COMMISSION_RATE_BPS;

  const commissionModel =
    DEFAULT_PLATFORM_COMMISSION_MODEL;

  const vatRateBps =
    percentageInputToBasisPoints(
      vatPercentage,
    );

  const minimumDepositRateBps =
    depositInputToBasisPoints(
      minimumDepositPercentage,
    );

  const maximumDepositRateBps =
    depositInputToBasisPoints(
      maximumDepositPercentage,
    );

  // Retain stored legacy fields when editing unrelated financial settings.
  const minimumBalanceDueDaysBeforeEvent = savedSettings.minimumBalanceDueDaysBeforeEvent;
  const maximumBalanceDueDaysBeforeEvent = savedSettings.maximumBalanceDueDaysBeforeEvent;

  const depositBoundsValid =
    minimumDepositRateBps !== null &&
    maximumDepositRateBps !== null &&
    minimumDepositRateBps <=
      maximumDepositRateBps;

  /*
   * Raw-value comparison intentionally keeps
   * Discard enabled even while an edited field
   * is temporarily invalid.
   */
  const hasChanges = useMemo(
    () =>
      savedSettings
        .platformCommissionRateBps !==
        commissionRateBps ||
      savedSettings
        .platformCommissionModel !==
        commissionModel ||
      platformTaxStatus !==
        savedSettings
          .platformTaxStatus ||
      vatPercentage !==
        basisPointsToInput(
          savedSettings
            .platformVatRateBps,
        ) ||
      minimumDepositPercentage !==
        basisPointsToInput(
          savedSettings
            .minimumDepositRateBps,
        ) ||
      maximumDepositPercentage !==
        basisPointsToInput(
          savedSettings
            .maximumDepositRateBps,
        ),
    [
      commissionModel,
      commissionRateBps,
      maximumDepositPercentage,
      minimumDepositPercentage,
      platformTaxStatus,
      savedSettings,
      vatPercentage,
    ],
  );

  const canSubmit =
    (hasChanges || savedSettings.financialPolicyEffectiveAt === null) &&
    vatRateBps !== null &&
    depositBoundsValid &&
    (
      platformTaxStatus ===
        "non_vat" ||
      vatRateBps > 0
    ) &&
    internalReason
      .trim()
      .length >= 10;

  const submit = (
    event: FormEvent,
  ) => {
    event.preventDefault();

    setError(null);
    setSuccess(null);

    if (vatRateBps === null) {
      setError(
        "Enter a valid FEASTA VAT percentage between 0 and 100.",
      );
      return;
    }

    if (
      minimumDepositRateBps === null ||
      maximumDepositRateBps === null
    ) {
      setError(
        "Deposit limits must be greater than 0% and below 100%.",
      );
      return;
    }

    if (
      minimumDepositRateBps >
      maximumDepositRateBps
    ) {
      setError(
        "Minimum deposit rate cannot exceed the maximum deposit rate.",
      );
      return;
    }

    if (
      platformTaxStatus ===
        "vat_registered" &&
      vatRateBps === 0
    ) {
      setError(
        "VAT rate must be greater than 0 when VAT Registered is enabled.",
      );
      return;
    }

    startTransition(
      async () => {
        try {
          const result =
            await updateAdminFinancialPolicyAction(
              {
                platformCommissionRateBps:
                  commissionRateBps,

                platformCommissionModel:
                  commissionModel,

                platformTaxStatus,

                platformVatRateBps:
                  vatRateBps,

                minimumDepositRateBps,

                maximumDepositRateBps,

                minimumBalanceDueDaysBeforeEvent,

                maximumBalanceDueDaysBeforeEvent,

                internalReason,
              },
            );

          setSavedSettings(
            result.settings,
          );

          setPlatformTaxStatus(
            result.settings
              .platformTaxStatus,
          );

          setVatPercentage(
            basisPointsToInput(
              result.settings
                .platformVatRateBps,
            ),
          );

          setMinimumDepositPercentage(
            basisPointsToInput(
              result.settings
                .minimumDepositRateBps,
            ),
          );

          setMaximumDepositPercentage(
            basisPointsToInput(
              result.settings
                .maximumDepositRateBps,
            ),
          );

          setInternalReason("");

          setSuccess(
            result.changed
              ? "Financial policy was updated successfully."
              : "No financial policy changes were required.",
          );
        } catch (caughtError) {
          setError(
            caughtError instanceof
              Error &&
              caughtError.message
                .trim()
              ? caughtError.message
              : "Financial policy could not be updated.",
          );
        }
      },
    );
  };

  const reset = () => {
    setPlatformTaxStatus(
      savedSettings
        .platformTaxStatus,
    );

    setVatPercentage(
      basisPointsToInput(
        savedSettings
          .platformVatRateBps,
      ),
    );

    setMinimumDepositPercentage(
      basisPointsToInput(
        savedSettings
          .minimumDepositRateBps,
      ),
    );

    setMaximumDepositPercentage(
      basisPointsToInput(
        savedSettings
          .maximumDepositRateBps,
      ),
    );

    setInternalReason("");
    setError(null);
    setSuccess(null);
  };

  return (
    <section
      aria-labelledby="financial-policy-heading"
      className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Percent
              aria-hidden="true"
              className="size-5"
            />
          </span>

          <div>
            <p className="text-sm font-semibold text-primary">
              Finance
            </p>

            <h2
              id="financial-policy-heading"
              className="mt-1 text-xl font-bold text-foreground"
            >
              Financial Policy
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Configure FEASTA&apos;s
              commission, platform-tax settings, Provider deposit
              limits, and remaining-balance
              deadline limits. Financial
              policy changes share one
              version so future financial
              snapshots can identify the
              policy in effect.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">
            Policy version{" "}
            {
              savedSettings
                .financialPolicyVersion
            }
          </p>

          <p className="mt-1 text-muted-foreground">
            {effectiveLabel(
              savedSettings,
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-subtle p-4">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-warning"
        />

        <div className="text-sm leading-6">
          <p className="font-semibold text-foreground">
            Platform Tax Configuration
          </p>

          <p className="text-muted-foreground">
            Selecting VAT Registered
            configures FEASTA&apos;s
            platform-fee VAT configuration
            only. It does not claim that
            FEASTA is currently registered
            as a VAT taxpayer with the BIR.
            Provider tax status is managed
            separately.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6">
        <p className="font-semibold text-foreground">
          Prospective payment-term policy
        </p>

        <p className="mt-1 text-muted-foreground">
          These limits are stored as
          platform policy for future
          package-term enforcement.
          Existing booking financial
          snapshots are not recalculated.
        </p>
      </div>

      <form
        className="mt-6 grid gap-6"
        onSubmit={submit}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid content-start gap-2 rounded-lg border border-border bg-muted/30 p-4 md:col-span-2">
            <p className="font-semibold text-foreground">
              FEASTA commission policy
            </p>

            <p className="text-sm leading-5 text-muted-foreground">
              Fixed 2% base with dynamic
              caps. Existing booking
              snapshots keep their original
              commission. New bookings use
              this versioned policy.
            </p>

            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <PolicyValue
                label="Base commission rate"
                value="2%"
              />

              <PolicyValue
                label="Standard commission cap"
                value="₱500"
              />

              <PolicyValue
                label="Standard cap maintained through"
                value="₱75,000"
              />

              <PolicyValue
                label="Progressive transition"
                value="Above ₱75,000 to ₱100,000"
              />

              <PolicyValue
                label="Absolute maximum cap"
                value="₱1,000"
              />

              <PolicyValue
                label="Absolute cap applies from"
                value="₱100,000"
              />
            </dl>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="financial-policy-tax-status"
              className="font-semibold text-foreground"
            >
              FEASTA tax status
            </label>

            <select
              id="financial-policy-tax-status"
              aria-describedby="financial-policy-tax-status-help"
              className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              value={
                platformTaxStatus
              }
              disabled={isPending}
              onChange={(event) => {
                const value =
                  event.currentTarget
                    .value;

                if (
                  value === "non_vat" ||
                  value ===
                    "vat_registered"
                ) {
                  setPlatformTaxStatus(
                    value,
                  );
                }
              }}
            >
              <option value="non_vat">
                Non-VAT
              </option>

              <option value="vat_registered">
                VAT Registered
              </option>
            </select>

            <span
              id="financial-policy-tax-status-help"
              className="text-sm leading-5 text-muted-foreground"
            >
              This status applies to
              FEASTA&apos;s own platform
              service. It does not
              determine a provider&apos;s
              tax status.
            </span>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="financial-policy-vat-rate"
              className="font-semibold text-foreground"
            >
              FEASTA VAT rate (%)
            </label>

            <Input
              id="financial-policy-vat-rate"
              aria-describedby="financial-policy-vat-rate-help"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={vatPercentage}
              disabled={isPending}
              onChange={(event) => {
                setVatPercentage(
                  event.currentTarget
                    .value,
                );
              }}
            />

            <span
              id="financial-policy-vat-rate-help"
              className="text-sm leading-5 text-muted-foreground"
            >
              The configured default is 12%. It becomes
              financially active only when
              VAT Registered is
              selected.
            </span>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="financial-policy-minimum-deposit"
              className="font-semibold text-foreground"
            >
              Minimum deposit (%)
            </label>

            <Input
              id="financial-policy-minimum-deposit"
              type="number"
              min="0.01"
              max="99.99"
              step="0.01"
              inputMode="decimal"
              value={
                minimumDepositPercentage
              }
              disabled={isPending}
              onChange={(event) => {
                setMinimumDepositPercentage(
                  event.currentTarget
                    .value,
                );
              }}
            />

            <span className="text-sm leading-5 text-muted-foreground">
              Lowest deposit percentage
              allowed by the versioned
              package payment policy.
            </span>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="financial-policy-maximum-deposit"
              className="font-semibold text-foreground"
            >
              Maximum deposit (%)
            </label>

            <Input
              id="financial-policy-maximum-deposit"
              type="number"
              min="0.01"
              max="99.99"
              step="0.01"
              inputMode="decimal"
              value={
                maximumDepositPercentage
              }
              disabled={isPending}
              onChange={(event) => {
                setMaximumDepositPercentage(
                  event.currentTarget
                    .value,
                );
              }}
            />

            <span className="text-sm leading-5 text-muted-foreground">
              Full-payment packages remain
              a separate 100% payment
              policy.
            </span>
          </div>

          <div className="grid content-start gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <p className="font-semibold text-foreground">
              Current interpretation
            </p>

            <dl className="grid gap-2 text-sm">
              <PolicyValue
                label="Commission"
                value="2% tiered capped (max ₱1,000)"
              />

              <PolicyValue
                label="Tax status"
                value={
                  platformTaxStatus ===
                  "vat_registered"
                    ? "VAT Registered"
                    : "Non-VAT"
                }
              />

              <PolicyValue
                label="VAT on FEASTA fee"
                value={
                  platformTaxStatus ===
                  "vat_registered"
                    ? `${
                        vatRateBps ===
                        null
                          ? "Invalid"
                          : vatRateBps /
                            100
                      }%`
                    : "Inactive"
                }
              />

              <PolicyValue
                label="Provider deposit range"
                value={
                  depositBoundsValid
                    ? `${
                        minimumDepositRateBps /
                        100
                      }%–${
                        maximumDepositRateBps /
                        100
                      }%`
                    : "Invalid"
                }
              />

              <PolicyValue label="Remaining balance deadline" value="24 hours before scheduled event start" />
            </dl>
          </div>
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="financial-policy-reason"
            className="font-semibold text-foreground"
          >
            Reason for changes
          </label>

          <Textarea
            id="financial-policy-reason"
            value={internalReason}
            minLength={10}
            maxLength={1000}
            rows={4}
            disabled={isPending}
            placeholder="Explain why this financial policy is being changed."
            onChange={(event) => {
              setInternalReason(
                event.currentTarget
                  .value,
              );
            }}
          />

          <span className="text-right text-sm text-muted-foreground">
            {internalReason.length}
            /1000 · Minimum 10
          </span>
        </div>

        <div
          aria-live="polite"
          className="grid gap-3"
        >
          {error ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive-subtle p-4 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-subtle p-4 text-sm font-medium text-success">
              <CheckCircle2
                aria-hidden="true"
                className="size-4"
              />
              {success}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={
              isPending ||
              !hasChanges
            }
            onClick={reset}
          >
            Discard financial changes
          </Button>

          <Button
            type="submit"
            variant="primary"
            loading={isPending}
            loadingLabel="Saving financial policy"
            disabled={!canSubmit}
          >
            Save financial policy
          </Button>
        </div>
      </form>
    </section>
  );
}

function percentageInputToBasisPoints(
  value: string,
): number | null {
  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  const percentage =
    Number(normalized);

  if (
    !Number.isFinite(
      percentage,
    ) ||
    percentage < 0 ||
    percentage > 100
  ) {
    return null;
  }

  const basisPoints =
    Math.round(
      percentage * 100,
    );

  if (
    !Number.isSafeInteger(
      basisPoints,
    )
  ) {
    return null;
  }

  return basisPoints;
}

function depositInputToBasisPoints(
  value: string,
): number | null {
  const basisPoints =
    percentageInputToBasisPoints(
      value,
    );

  if (
    basisPoints === null ||
    basisPoints <= 0 ||
    basisPoints >= 10_000
  ) {
    return null;
  }

  return basisPoints;
}

function basisPointsToInput(
  basisPoints: number,
): string {
  return String(
    basisPoints / 100,
  );
}

function effectiveLabel(
  settings: AdminPlatformSettings,
): string {
  if (
    !settings
      .financialPolicyEffectiveAt
  ) {
    return "Uses default policy until the first saved financial change.";
  }

  return `Effective ${new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone:
        settings.timezone,
    },
  ).format(
    new Date(
      settings
        .financialPolicyEffectiveAt,
    ),
  )}`;
}

function PolicyValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">
        {label}
      </dt>

      <dd className="text-right font-semibold text-foreground">
        {value}
      </dd>
    </div>
  );
}

export {
  AdminFinancialPolicyClient,
  type AdminFinancialPolicyClientProps,
};