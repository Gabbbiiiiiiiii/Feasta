"use client";

import {
  CheckCircle2,
  Globe2,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import {
  type FormEvent,
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  updateAdminPlatformSettingsAction,
} from "@/app/admin/settings/actions";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import type {
  AdminPlatformSettings,
} from "@/lib/admin/settings/admin-settings-types";

type AdminSettingsClientProps = {
  initialSettings: AdminPlatformSettings;
};

type EditableSettings = Pick<
  AdminPlatformSettings,
  | "platformName"
  | "operatingCity"
  | "supportEmail"
  | "serviceAreaDescription"
>;

function editableSettings(
  settings: AdminPlatformSettings,
): EditableSettings {
  return {
    platformName: settings.platformName,
    operatingCity: settings.operatingCity,
    supportEmail: settings.supportEmail,
    serviceAreaDescription:
      settings.serviceAreaDescription,
  };
}

function AdminSettingsClient({
  initialSettings,
}: AdminSettingsClientProps) {
  const [savedSettings, setSavedSettings] =
    useState(initialSettings);

  const [draft, setDraft] =
    useState<EditableSettings>(
      editableSettings(initialSettings),
    );

  const [internalReason, setInternalReason] =
    useState("");

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [isPending, startTransition] =
    useTransition();

  const hasChanges = useMemo(
    () =>
      draft.platformName.trim() !==
        savedSettings.platformName ||
      draft.operatingCity.trim() !==
        savedSettings.operatingCity ||
      draft.supportEmail
        .trim()
        .toLowerCase() !==
        savedSettings.supportEmail ||
      draft.serviceAreaDescription.trim() !==
        savedSettings.serviceAreaDescription,
    [draft, savedSettings],
  );

  const canSubmit =
    hasChanges &&
    draft.platformName.trim().length >= 2 &&
    draft.operatingCity.trim().length >= 2 &&
    draft.supportEmail.trim().length >= 5 &&
    draft.serviceAreaDescription.trim().length >=
      10 &&
    internalReason.trim().length >= 10;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const result =
          await updateAdminPlatformSettingsAction({
            ...draft,
            internalReason,
          });

        setSavedSettings(result.settings);
        setDraft(
          editableSettings(result.settings),
        );
        setInternalReason("");

        setSuccess(
          result.changed
            ? "Platform settings were updated successfully."
            : "No platform setting changes were required.",
        );
      } catch (caughtError) {
        setError(
          caughtError instanceof Error &&
            caughtError.message.trim()
            ? caughtError.message
            : "Platform settings could not be updated.",
        );
      }
    });
  };

  const reset = () => {
    setDraft(
      editableSettings(savedSettings),
    );
    setInternalReason("");
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Platform Settings"
        description="Manage public FEASTA platform identity and service-area information."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          className="grid gap-6"
          onSubmit={submit}
        >
          <section className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Globe2
                  aria-hidden="true"
                  className="size-5"
                />
              </span>

              <div>
                <h2 className="font-bold text-foreground">
                  Platform profile
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  These values identify FEASTA in
                  administrator and public-facing
                  platform experiences.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="font-semibold text-foreground">
                  Platform name
                </span>

                <Input
                  value={draft.platformName}
                  minLength={2}
                  maxLength={80}
                  disabled={isPending}
                  autoComplete="organization"
                  onChange={(event) => {
                    const value =
                      event.currentTarget.value;

                    setDraft((current) => ({
                      ...current,
                      platformName: value,
                    }));
                  }}
                />
              </label>

              <label className="grid gap-2">
                <span className="font-semibold text-foreground">
                  Operating city
                </span>

                <Input
                  value={draft.operatingCity}
                  minLength={2}
                  maxLength={120}
                  disabled={isPending}
                  autoComplete="address-level2"
                  onChange={(event) => {
                    const value =
                      event.currentTarget.value;

                    setDraft((current) => ({
                      ...current,
                      operatingCity: value,
                    }));
                  }}
                />
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="font-semibold text-foreground">
                  Support email
                </span>

                <Input
                  type="email"
                  value={draft.supportEmail}
                  minLength={5}
                  maxLength={254}
                  disabled={isPending}
                  autoComplete="email"
                  placeholder="support@example.com"
                  onChange={(event) => {
                    const value =
                      event.currentTarget.value;

                    setDraft((current) => ({
                      ...current,
                      supportEmail: value,
                    }));
                  }}
                />

                <span className="text-sm text-muted-foreground">
                  Use an actively monitored support
                  address, not a personal administrator
                  account.
                </span>
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="font-semibold text-foreground">
                  Service-area description
                </span>

                <Textarea
                  value={
                    draft.serviceAreaDescription
                  }
                  minLength={10}
                  maxLength={500}
                  disabled={isPending}
                  rows={5}
                  onChange={(event) => {
                    const value =
                      event.currentTarget.value;

                    setDraft((current) => ({
                      ...current,
                      serviceAreaDescription:
                        value,
                    }));
                  }}
                />

                <span className="text-right text-sm text-muted-foreground">
                  {
                    draft.serviceAreaDescription
                      .length
                  }
                  /500
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-subtle text-warning">
                <LockKeyhole
                  aria-hidden="true"
                  className="size-5"
                />
              </span>

              <div>
                <h2 className="font-bold text-foreground">
                  Administrative justification
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  This private reason is stored only
                  in the immutable audit record.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              <label
                htmlFor="platform-settings-internal-reason"
                className="font-semibold text-foreground"
              >
                Internal reason
              </label>

              <Textarea
                id="platform-settings-internal-reason"
                value={internalReason}
                minLength={10}
                maxLength={1000}
                disabled={isPending}
                rows={4}
                placeholder="Explain why these platform settings are being changed."
                onChange={(event) => {
                  const value =
                    event.currentTarget.value;

                  setInternalReason(
                    value,
                  );
                }}
              />

              <span className="text-right text-sm text-muted-foreground">
                {internalReason.length}/1000 · Minimum 10
              </span>
            </div>
          </section>

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
              disabled={isPending || !hasChanges}
              onClick={reset}
            >
              Discard changes
            </Button>

            <Button
              type="submit"
              variant="primary"
              loading={isPending}
              loadingLabel="Saving settings"
              disabled={!canSubmit}
            >
              Save settings
            </Button>
          </div>
        </form>

        <aside className="grid content-start gap-4">
          <section className="rounded-card border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              <ShieldCheck
                aria-hidden="true"
                className="size-5 text-success"
              />

              <h2 className="font-bold text-foreground">
                Canonical configuration
              </h2>
            </div>

            <dl className="mt-4 divide-y divide-border text-sm">
              <SettingValue
                label="Timezone"
                value={savedSettings.timezone}
              />

              <SettingValue
                label="Currency"
                value={savedSettings.currencyCode}
              />

              <SettingValue
                label="Schema version"
                value={String(
                  savedSettings.schemaVersion,
                )}
              />

              <SettingValue
                label="Visibility"
                value="Public profile"
              />
            </dl>

            <p className="mt-4 text-sm text-muted-foreground">
              These values are enforced by the
              backend and cannot be changed from
              this form.
            </p>
          </section>

          <section className="rounded-card border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              <MapPin
                aria-hidden="true"
                className="size-5 text-primary"
              />

              <h2 className="font-bold text-foreground">
                Last update
              </h2>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {savedSettings.updatedAt
                ? new Intl.DateTimeFormat(
                    "en-PH",
                    {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone:
                        savedSettings.timezone,
                    },
                  ).format(
                    new Date(
                      savedSettings.updatedAt,
                    ),
                  )
                : "These settings have not yet been saved."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SettingValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
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
  AdminSettingsClient,
  type AdminSettingsClientProps,
};
