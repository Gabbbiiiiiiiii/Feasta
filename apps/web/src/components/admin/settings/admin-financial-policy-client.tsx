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
    commissionPercentage,
    setCommissionPercentage,
  ] = useState(
    basisPointsToInput(
      initialSettings
        .platformCommissionRateBps,
    ),
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
    percentageInputToBasisPoints(
      commissionPercentage,
    );

  const vatRateBps =
    percentageInputToBasisPoints(
      vatPercentage,
    );

  const hasChanges = useMemo(
    () =>
      commissionRateBps !==
        null &&
      vatRateBps !== null &&
      (
        commissionRateBps !==
          savedSettings
            .platformCommissionRateBps ||
        platformTaxStatus !==
          savedSettings
            .platformTaxStatus ||
        vatRateBps !==
          savedSettings
            .platformVatRateBps
      ),
    [
      commissionRateBps,
      platformTaxStatus,
      savedSettings,
      vatRateBps,
    ],
  );

  const canSubmit =
    hasChanges &&
    commissionRateBps !== null &&
    vatRateBps !== null &&
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

    if (
      commissionRateBps === null ||
      vatRateBps === null
    ) {
      setError(
        "Enter valid percentage values between 0 and 100.",
      );
      return;
    }

    if (
      platformTaxStatus ===
        "vat_registered" &&
      vatRateBps === 0
    ) {
      setError(
        "VAT rate must be greater than 0 when VAT Registered simulation is enabled.",
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

                platformTaxStatus,

                platformVatRateBps:
                  vatRateBps,

                internalReason,
              },
            );

          setSavedSettings(
            result.settings,
          );

          setCommissionPercentage(
            basisPointsToInput(
              result.settings
                .platformCommissionRateBps,
            ),
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
    setCommissionPercentage(
      basisPointsToInput(
        savedSettings
          .platformCommissionRateBps,
      ),
    );

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
              platform commission and
              platform-tax simulation.
              These values are versioned
              so future bookings can
              snapshot the exact policy
              that applied when they were
              created.
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
            Capstone tax simulation
          </p>

          <p className="text-muted-foreground">
            Selecting VAT Registered
            configures FEASTA&apos;s
            platform-fee VAT simulation
            only. It does not claim that
            FEASTA is currently registered
            as a VAT taxpayer with the BIR.
            Provider tax status is managed
            separately.
          </p>
        </div>
      </div>

      <form
        className="mt-6 grid gap-6"
        onSubmit={submit}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-2">
            <label
              htmlFor="financial-policy-commission"
              className="font-semibold text-foreground"
            >
              Platform commission rate (%)
            </label>

            <Input
              id="financial-policy-commission"
              aria-describedby="financial-policy-commission-help"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={
                commissionPercentage
              }
              disabled={isPending}
              onChange={(event) => {
                setCommissionPercentage(
                  event.currentTarget
                    .value,
                );
              }}
            />

            <span
              id="financial-policy-commission-help"
              className="text-sm leading-5 text-muted-foreground"
            >
              FEASTA&apos;s initial policy
              is 10%. Commission remains
              separate from provider VAT,
              FEASTA VAT, gateway fees,
              refunds, and payouts.
            </span>
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
                VAT Registered — Capstone Simulation
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
              The stored demonstration
              default is 12%. It becomes
              financially active only when
              VAT Registered simulation is
              selected.
            </span>
          </div>

          <div className="grid content-start gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <p className="font-semibold text-foreground">
              Current interpretation
            </p>

            <dl className="grid gap-2 text-sm">
              <PolicyValue
                label="Commission"
                value={`${commissionRateBps === null
                  ? "Invalid"
                  : commissionRateBps /
                    100}%`}
              />

              <PolicyValue
                label="Tax status"
                value={
                  platformTaxStatus ===
                  "vat_registered"
                    ? "VAT Registered simulation"
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
            </dl>
          </div>
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="financial-policy-reason"
            className="font-semibold text-foreground"
          >
            Internal reason
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
