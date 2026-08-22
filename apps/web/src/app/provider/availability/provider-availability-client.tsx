"use client";

import {
  Box,
  CalendarOff,
  CalendarRange,
  Clock3,
  Plus,
  Save,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {useMemo, useState} from "react";

import {
  PROVIDER_OPERATING_DAYS,
  type ProviderOperatingDay,
} from "@feasta/shared-types";

import {CheckboxField} from "@/components/forms/selection-controls";
import {FormField} from "@/components/forms/form-field";
import {feastaToast} from "@/components/feedback/toast";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  updateProviderAvailability,
  updateProviderAvailabilitySettings,
} from "@/lib/provider/availability/provider-availability-client";
import type {
  ProviderAvailabilitySettings,
  UpdateProviderAvailabilitySettingsInput,
} from "@/lib/provider/availability/provider-availability-types";

type ProviderAvailabilityClientProps = {
  initialSettings: ProviderAvailabilitySettings;
};

type AvailabilityFormState = {
  operatingDays: ProviderOperatingDay[];
  bookingLeadTimeDays: string;
  acceptsMultipleEventsPerDay: boolean;
  maxEventsPerDay: string;
  minGuestsPerEvent: string;
  maxGuestsPerEvent: string;
  availableStaffCount: string;
  availableEquipmentCount: string;
};

const DAY_LABELS: Record<ProviderOperatingDay, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function ProviderAvailabilityClient({
  initialSettings,
}: ProviderAvailabilityClientProps) {
  const router = useRouter();
  const initialForm = useMemo(
    () => formFromSettings(initialSettings),
    [initialSettings],
  );
  const [canonicalForm, setCanonicalForm] = useState(initialForm);
  const [form, setForm] = useState(initialForm);
  const [unavailableDates, setUnavailableDates] = useState(
    [...initialSettings.unavailableDates],
  );
  const [selectedDate, setSelectedDate] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [datePending, setDatePending] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const dirty = serializeForm(form) !== serializeForm(canonicalForm);
  const today = todayInManila();
  const duplicateDate = selectedDate !== "" &&
    unavailableDates.includes(selectedDate);
  const selectedDateIsPast = selectedDate !== "" && selectedDate < today;

  function toggleOperatingDay(day: ProviderOperatingDay) {
    setSuccessMessage(null);
    setFormError(null);
    setForm((current) => {
      const selected = new Set(current.operatingDays);

      if (selected.has(day)) selected.delete(day);
      else selected.add(day);

      return {
        ...current,
        operatingDays: PROVIDER_OPERATING_DAYS.filter((item) =>
          selected.has(item),
        ),
      };
    });
  }

  async function saveSettings() {
    if (savingSettings || !dirty) return;

    setFormError(null);
    setSuccessMessage(null);

    let input: UpdateProviderAvailabilitySettingsInput;

    try {
      input = settingsInput(form, initialSettings);
    } catch (error) {
      setFormError(safeErrorMessage(error, "Check the highlighted availability values."));
      return;
    }

    setSavingSettings(true);

    try {
      const result = await updateProviderAvailabilitySettings(input);
      const savedForm = formFromMutation(result.settings);
      setForm(savedForm);
      setCanonicalForm(savedForm);
      setSuccessMessage("Availability settings saved.");
      feastaToast.success("Availability settings saved.");
      router.refresh();
    } catch (error) {
      const message = safeErrorMessage(
        error,
        "The availability settings could not be saved.",
      );
      setFormError(message);
      feastaToast.error(message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function addUnavailableDate() {
    if (
      datePending ||
      selectedDate === "" ||
      duplicateDate ||
      selectedDateIsPast
    ) return;

    setDateError(null);
    setSuccessMessage(null);
    setDatePending(selectedDate);

    try {
      const result = await updateProviderAvailability({
        date: selectedDate,
        action: "mark_unavailable",
      });
      setUnavailableDates([...result.unavailableDates].sort());
      setSelectedDate("");
      setSuccessMessage("Unavailable date added.");
      feastaToast.success("Unavailable date added.");
      router.refresh();
    } catch (error) {
      const message = safeErrorMessage(
        error,
        "The unavailable date could not be added.",
      );
      setDateError(message);
      feastaToast.error(message);
    } finally {
      setDatePending(null);
    }
  }

  async function removeUnavailableDate(date: string) {
    if (datePending || date < today) return;

    setDateError(null);
    setSuccessMessage(null);
    setDatePending(date);

    try {
      const result = await updateProviderAvailability({
        date,
        action: "mark_available",
      });
      setUnavailableDates([...result.unavailableDates].sort());
      setSuccessMessage("The date is available again.");
      feastaToast.success("The date is available again.");
      router.refresh();
    } catch (error) {
      const message = safeErrorMessage(
        error,
        "The unavailable date could not be removed.",
      );
      setDateError(message);
      feastaToast.error(message);
    } finally {
      setDatePending(null);
    }
  }

  const capabilities = initialSettings.capacityCapabilities;

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Provider operations"
        title="Availability & Scheduling"
        description="Control when your business can accept event bookings and configure your booking capacity."
      />

      <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:items-start">
        <AvailabilityCard
          icon={<CalendarRange className="size-5" />}
          title="Operating Days"
          description="Bookings can only be accepted on your selected operating days."
        >
          <fieldset disabled={savingSettings}>
            <legend className="sr-only">Select operating days</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROVIDER_OPERATING_DAYS.map((day) => (
                <label
                  key={day}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="checkbox"
                    name="operatingDays"
                    value={day}
                    checked={form.operatingDays.includes(day)}
                    onChange={() => toggleOperatingDay(day)}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <span className="font-semibold">{DAY_LABELS[day]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </AvailabilityCard>

        <AvailabilityCard
          icon={<Clock3 className="size-5" />}
          title="Booking Lead Time"
          description="Minimum number of days required before an event can be accepted."
        >
          <FormField
            id="bookingLeadTimeDays"
            label="Lead time in days"
            description="Choose between 0 and 365 days."
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              step={1}
              value={form.bookingLeadTimeDays}
              disabled={savingSettings}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSuccessMessage(null);
                setFormError(null);
                setForm((current) => ({
                  ...current,
                  bookingLeadTimeDays: value,
                }));
              }}
              className="max-w-48"
            />
          </FormField>
        </AvailabilityCard>

        <AvailabilityCard
          icon={<CalendarOff className="size-5" />}
          title="Daily Booking Capacity"
          description="Set how many active FEASTA events your business can accept on one date."
        >
          <CheckboxField
            id="acceptsMultipleEventsPerDay"
            label="Accept multiple events per day"
            description={
              form.acceptsMultipleEventsPerDay
                ? "Set the maximum number of active events you can handle each day."
                : "Only one active event can be accepted per day."
            }
            checked={form.acceptsMultipleEventsPerDay}
            disabled={savingSettings}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setSuccessMessage(null);
              setFormError(null);
              setForm((current) => ({
                ...current,
                acceptsMultipleEventsPerDay: checked,
                maxEventsPerDay: checked
                  ? current.maxEventsPerDay
                  : "1",
              }));
            }}
          />

          {form.acceptsMultipleEventsPerDay ? (
            <FormField
              id="maxEventsPerDay"
              label="Maximum events per day"
              description="Choose between 1 and 100 active events."
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                value={form.maxEventsPerDay}
                disabled={savingSettings}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setSuccessMessage(null);
                  setFormError(null);
                  setForm((current) => ({
                    ...current,
                    maxEventsPerDay: value,
                  }));
                }}
                className="max-w-48"
              />
            </FormField>
          ) : (
            <p className="rounded-lg bg-secondary px-4 py-3 text-sm font-medium">
              Daily limit: 1 active event
            </p>
          )}
        </AvailabilityCard>

        <AvailabilityCard
          icon={<UsersRound className="size-5" />}
          title="Event Capacity"
          description="Only capacity settings that apply to your verified service categories are shown."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.requiresGuestCapacity ? (
              <>
                <CapacityInput
                  id="minGuestsPerEvent"
                  label="Minimum guests"
                  value={form.minGuestsPerEvent}
                  minimum={1}
                  disabled={savingSettings}
                  onChange={(value) => setForm((current) => ({
                    ...current,
                    minGuestsPerEvent: value,
                  }))}
                />
                <CapacityInput
                  id="maxGuestsPerEvent"
                  label="Maximum guests"
                  value={form.maxGuestsPerEvent}
                  minimum={1}
                  disabled={savingSettings}
                  onChange={(value) => setForm((current) => ({
                    ...current,
                    maxGuestsPerEvent: value,
                  }))}
                />
              </>
            ) : null}

            {capabilities.usesStaffCapacity ? (
              <CapacityInput
                id="availableStaffCount"
                label="Available staff"
                value={form.availableStaffCount}
                minimum={0}
                disabled={savingSettings}
                icon={<UserRoundCheck className="size-4" />}
                onChange={(value) => setForm((current) => ({
                  ...current,
                  availableStaffCount: value,
                }))}
              />
            ) : null}

            {capabilities.usesEquipmentCapacity ? (
              <CapacityInput
                id="availableEquipmentCount"
                label="Available equipment"
                value={form.availableEquipmentCount}
                minimum={0}
                disabled={savingSettings}
                icon={<Box className="size-4" />}
                onChange={(value) => setForm((current) => ({
                  ...current,
                  availableEquipmentCount: value,
                }))}
              />
            ) : null}
          </div>

          {(capabilities.usesStaffCapacity ||
            capabilities.usesEquipmentCapacity) ? (
              <p className="text-sm text-muted-foreground">
                Staff and equipment values describe your available business capacity.
                FEASTA does not allocate those resources per booking yet.
              </p>
            ) : null}

          {!capabilities.requiresGuestCapacity &&
          !capabilities.usesStaffCapacity &&
          !capabilities.usesEquipmentCapacity ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Your current service categories do not require additional capacity settings.
            </p>
          ) : null}
        </AvailabilityCard>
      </div>

      <section
        className="grid min-w-0 gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
        aria-labelledby="unavailable-dates-heading"
      >
        <CardHeading
          icon={<CalendarOff className="size-5" />}
          id="unavailable-dates-heading"
          title="Unavailable Dates"
          description="Block dates when your business cannot accept events. Dates use Philippine calendar time."
        />

        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,18rem)_auto] sm:items-end">
          <FormField
            id="unavailableDate"
            label="Date to make unavailable"
          >
            <Input
              type="date"
              min={today}
              value={selectedDate}
              disabled={datePending !== null}
              onChange={(event) => {
                setDateError(null);
                setSelectedDate(event.currentTarget.value);
              }}
            />
          </FormField>

          <Button
            type="button"
            size="compact"
            disabled={
              selectedDate === "" ||
              duplicateDate ||
              selectedDateIsPast ||
              datePending !== null
            }
            loading={datePending === selectedDate && selectedDate !== ""}
            loadingLabel="Adding date"
            onClick={() => {
              void addUnavailableDate();
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add unavailable date
          </Button>
        </div>

        {duplicateDate ? (
          <p className="text-sm font-medium text-muted-foreground" role="status">
            This date is already unavailable.
          </p>
        ) : null}

        {selectedDateIsPast ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            Choose today or a future date.
          </p>
        ) : null}

        {dateError ? (
          <p className="text-sm font-semibold text-destructive" role="alert">
            {dateError}
          </p>
        ) : null}

        {unavailableDates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <CalendarRange
              className="mx-auto size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mt-3 font-semibold">No unavailable dates</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Future events may be accepted on any selected operating day.
            </p>
          </div>
        ) : (
          <ul className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {unavailableDates.map((date) => {
              const isPast = date < today;

              return (
                <li
                  key={date}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <time className="block truncate font-semibold" dateTime={date}>
                      {formatManilaDate(date)}
                    </time>
                    <span className="text-xs text-muted-foreground">
                      {isPast ? "Past date" : "Unavailable"}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    disabled={isPast || datePending !== null}
                    loading={datePending === date}
                    loadingLabel="Removing"
                    aria-label={`Make ${formatManilaDate(date)} available`}
                    onClick={() => {
                      void removeUnavailableDate(date);
                    }}
                  >
                    Make available
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {formError ? (
        <p className="text-sm font-semibold text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      {successMessage ? (
        <p className="text-sm font-semibold text-success" role="status" aria-live="polite">
          {successMessage}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {dirty ? "You have unsaved settings changes." : "All settings changes are saved."}
        </p>

        <Button
          type="button"
          disabled={!dirty || savingSettings}
          loading={savingSettings}
          loadingLabel="Saving settings"
          onClick={() => {
            void saveSettings();
          }}
        >
          <Save className="size-4" aria-hidden="true" />
          Save Availability Settings
        </Button>
      </div>
    </div>
  );
}

function AvailabilityCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const id = `availability-${title.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <section
      className="grid min-w-0 gap-5 rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
      aria-labelledby={id}
    >
      <CardHeading icon={icon} id={id} title={title} description={description} />
      {children}
    </section>
  );
}

function CardHeading({
  icon,
  id,
  title,
  description,
}: {
  icon: React.ReactNode;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-strong"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-bold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function CapacityInput({
  id,
  label,
  value,
  minimum,
  disabled,
  icon,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  minimum: number;
  disabled: boolean;
  icon?: React.ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <div className="relative">
        {icon ? (
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <Input
          type="number"
          inputMode="numeric"
          min={minimum}
          max={100_000}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          className={icon ? "pl-11" : undefined}
        />
      </div>
    </FormField>
  );
}

function formFromSettings(
  settings: ProviderAvailabilitySettings,
): AvailabilityFormState {
  return {
    operatingDays: [...settings.operatingDays],
    bookingLeadTimeDays: String(settings.bookingLeadTimeDays),
    acceptsMultipleEventsPerDay: settings.acceptsMultipleEventsPerDay,
    maxEventsPerDay: String(settings.maxEventsPerDay),
    minGuestsPerEvent: String(settings.guestCapacity?.minimum ?? 0),
    maxGuestsPerEvent: String(settings.guestCapacity?.maximum ?? 0),
    availableStaffCount: String(settings.availableStaffCount ?? 0),
    availableEquipmentCount: String(settings.availableEquipmentCount ?? 0),
  };
}

function formFromMutation(
  settings: UpdateProviderAvailabilitySettingsInput,
): AvailabilityFormState {
  return {
    operatingDays: [...settings.operatingDays],
    bookingLeadTimeDays: String(settings.bookingLeadTimeDays),
    acceptsMultipleEventsPerDay: settings.acceptsMultipleEventsPerDay,
    maxEventsPerDay: String(settings.maxEventsPerDay),
    minGuestsPerEvent: String(settings.minGuestsPerEvent),
    maxGuestsPerEvent: String(settings.maxGuestsPerEvent),
    availableStaffCount: String(settings.availableStaffCount),
    availableEquipmentCount: String(settings.availableEquipmentCount),
  };
}

function settingsInput(
  form: AvailabilityFormState,
  settings: ProviderAvailabilitySettings,
): UpdateProviderAvailabilitySettingsInput {
  if (form.operatingDays.length === 0) {
    throw new Error("Select at least one operating day.");
  }

  const bookingLeadTimeDays = boundedInteger(
    form.bookingLeadTimeDays,
    "Booking lead time",
    0,
    365,
  );
  const maxEventsPerDay = form.acceptsMultipleEventsPerDay
    ? boundedInteger(form.maxEventsPerDay, "Maximum events per day", 1, 100)
    : 1;
  const capabilities = settings.capacityCapabilities;
  const minGuestsPerEvent = capabilities.requiresGuestCapacity
    ? boundedInteger(form.minGuestsPerEvent, "Minimum guests", 1, 100_000)
    : 0;
  const maxGuestsPerEvent = capabilities.requiresGuestCapacity
    ? boundedInteger(form.maxGuestsPerEvent, "Maximum guests", 1, 100_000)
    : 0;

  if (maxGuestsPerEvent < minGuestsPerEvent) {
    throw new Error("Maximum guests must be at least the minimum guest capacity.");
  }

  return {
    operatingDays: form.operatingDays,
    bookingLeadTimeDays,
    acceptsMultipleEventsPerDay: form.acceptsMultipleEventsPerDay,
    maxEventsPerDay,
    minGuestsPerEvent,
    maxGuestsPerEvent,
    availableStaffCount: capabilities.usesStaffCapacity
      ? boundedInteger(form.availableStaffCount, "Available staff", 0, 100_000)
      : 0,
    availableEquipmentCount: capabilities.usesEquipmentCapacity
      ? boundedInteger(form.availableEquipmentCount, "Available equipment", 0, 100_000)
      : 0,
  };
}

function boundedInteger(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}.`);
  }

  return number;
}

function serializeForm(form: AvailabilityFormState): string {
  return JSON.stringify(form);
}

function todayInManila(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).formatToParts(new Date());

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatManilaDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeZone: "Asia/Manila",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
