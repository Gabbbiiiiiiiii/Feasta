"use client";

import {
  CalendarOff,
  CalendarRange,
  Clock3,
  Plus,
  Save,
  UsersRound,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {useEffect, useMemo, useRef, useState} from "react";

import {
  PROVIDER_OPERATING_DAYS,
  type ProviderOperatingDay,
} from "@feasta/shared-types";

import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {FormField} from "@/components/forms/form-field";
import {feastaToast} from "@/components/feedback/toast";
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {formatPhilippineDate} from "@/lib/dates/philippine-date";
import {
  updateProviderAvailability,
  updateProviderAvailabilitySettings,
} from "@/lib/provider/availability/provider-availability-client";
import type {
  ProviderAvailabilitySettings,
  UpdateProviderAvailabilitySettingsInput,
  UpdateProviderAvailabilitySettingsResult,
} from "@/lib/provider/availability/provider-availability-types";

type ProviderAvailabilityClientProps = {
  initialSettings: ProviderAvailabilitySettings;
};

type AvailabilityFormState = {
  operatingDays: ProviderOperatingDay[];
  bookingLeadTimeDays: string;
  maxEventsPerDay: string;
  minGuestsPerEvent: string;
  maxGuestsPerEvent: string;
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
  const savePending = useRef(false);
  const [settingsRevision, setSettingsRevision] = useState(initialSettings.availabilitySettingsRevision ?? 0);
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
  const [blockReason, setBlockReason] = useState("");
  const [unavailableDateReasons, setUnavailableDateReasons] = useState(initialSettings.unavailableDateReasons ?? {});
  const [savingSettings, setSavingSettings] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [datePending, setDatePending] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const capacityDirty = form.maxEventsPerDay !== canonicalForm.maxEventsPerDay;
  const dirty = serializeForm(form) !== serializeForm(canonicalForm);
  const fieldErrors = validationAttempted ? settingsFieldErrors(form) : {};
  const hasUnsavedChanges = dirty || Boolean(selectedDate || blockReason.trim());
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function confirmLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search &&
          destination.origin === window.location.origin) return;
      if (!window.confirm("Leave without saving your availability changes?")) event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", confirmLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", confirmLink, true);
    };
  }, [hasUnsavedChanges]);
  const today = todayInManila();
  const currentCapacity = Number(canonicalForm.maxEventsPerDay);
  const peakOccupied = Object.values(initialSettings.occupiedSlotsByDate ?? {})
    .reduce((peak, occupied) => Math.max(peak, occupied), 0);
  const proposedCapacity = Number(form.maxEventsPerDay);
  const capacityBelowReservations = Number.isInteger(proposedCapacity) && proposedCapacity >= 1 &&
    proposedCapacity < currentCapacity && proposedCapacity < peakOccupied;
  const selectedDateHasBookings = (initialSettings.occupiedSlotsByDate?.[selectedDate] ?? 0) > 0;
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
    if (savePending.current || !dirty) return;
    setFormError(null);
    setSuccessMessage(null);
    setValidationAttempted(true);

    const errors = settingsFieldErrors(form);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      const target = document.getElementById(firstInvalid);
      if (target instanceof HTMLFieldSetElement) target.querySelector("input")?.focus();
      else target?.focus();
      return;
    }

    savePending.current = true;
    setSavingSettings(true);
    try {
      const result = await updateProviderAvailabilitySettings({
        ...settingsInput(form, initialSettings),
        expectedSettingsRevision: settingsRevision,
      });
      const savedForm = formFromMutation(result.settings);
      setSettingsRevision(result.settings.availabilitySettingsRevision ?? settingsRevision + 1);
      setForm(savedForm);
      setCanonicalForm(savedForm);
      setValidationAttempted(false);
      setSuccessMessage("Availability settings saved.");
      feastaToast.success("Availability settings saved.");
      router.refresh();
    } catch (error) {
      const message = safeErrorMessage(error, "The availability settings could not be saved.");
      setFormError(message);
      feastaToast.error(message);
    } finally {
      savePending.current = false;
      setSavingSettings(false);
    }
  }

  async function addUnavailableDate() {
    if (
      datePending ||
      selectedDate === "" ||
      duplicateDate ||
      selectedDateHasBookings ||
      selectedDateIsPast
    ) return;

    setDateError(null);
    setSuccessMessage(null);
    setDatePending(selectedDate);

    try {
      const result = await updateProviderAvailability({
        date: selectedDate,
        action: "mark_unavailable",
        ...(blockReason.trim() ? {reason: blockReason.trim()} : {}),
      });
      setUnavailableDates([...result.unavailableDates].sort());
      if (result.unavailableDateReasons) setUnavailableDateReasons(result.unavailableDateReasons);
      setSelectedDate("");
      setBlockReason("");
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
      if (result.unavailableDateReasons) setUnavailableDateReasons(result.unavailableDateReasons);
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
    <div className="grid min-w-0 gap-4">
      <div className="flex">
        <Button
          type="button"
          variant="secondary"
          size="compact"
          onClick={() => {
            if (!hasUnsavedChanges || window.confirm("Leave without saving your availability changes?")) {
              router.push("/provider/calendar");
            }
          }}
        >
          ← Back to Calendar
        </Button>
      </div>
      <PageHeading
        className="pb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:sm:text-3xl"
        eyebrow="Provider operations"
        title="Availability & Scheduling"
        description="Control when your business can accept event bookings and configure your booking capacity."
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="grid min-w-0 gap-4">
          <AvailabilityCard
            icon={<CalendarRange className="size-5" />}
            title="Operating Days"
            description="Bookings can only be accepted on your selected operating days."
          >
            <fieldset id="operatingDays" disabled={savingSettings} aria-describedby={fieldErrors.operatingDays ? "operating-days-error" : undefined}>
              <legend className="sr-only">Select operating days</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROVIDER_OPERATING_DAYS.map((day) => (
                  <label
                    key={day}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 has-[:checked]:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      name="operatingDays"
                      value={day}
                      checked={form.operatingDays.includes(day)}
                      onChange={() => toggleOperatingDay(day)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="font-semibold">{DAY_LABELS[day]}</span>
                  </label>
                ))}
              </div>
              {fieldErrors.operatingDays && <p id="operating-days-error" role="alert" className="text-sm font-semibold text-destructive">{fieldErrors.operatingDays}</p>}
            </fieldset>
          </AvailabilityCard>

          <AvailabilityCard
            icon={<Clock3 className="size-5" />}
            title="Minimum booking notice (days)"
            description="How many days in advance should customers normally book? Enter 0 if you accept same-day or rush bookings."
            requiredMark
          >
            <FormField
              id="bookingLeadTimeDays"
              error={fieldErrors.bookingLeadTimeDays}
              label="Minimum booking notice (days)"
              required
              labelClassName="sr-only"
            >
              <div className="flex w-full max-w-40 items-stretch">
                <Input
                  className="min-h-9 rounded-e-none px-2.5 py-1.5 text-sm"
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
                />
                <span className="grid place-items-center rounded-e-md border border-s-0 border-border bg-muted px-2.5 text-sm text-muted-foreground" aria-hidden="true">days</span>
              </div>
            </FormField>
          </AvailabilityCard>
        </div>

        <div className="grid min-w-0 gap-4">
          <AvailabilityCard
            icon={<CalendarRange className="size-5" />}
            title="Daily Event Capacity"
            description="Online and walk-in bookings share this limit across your business."
          >
            <FormField id="maxEventsPerDay" label="Maximum events per day" required error={fieldErrors.maxEventsPerDay}>
              <Input className="min-h-9 max-w-36 px-2.5 py-1.5 text-sm" type="number" inputMode="numeric" min={1} max={100} step={1}
                value={form.maxEventsPerDay} disabled={savingSettings}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setSuccessMessage(null);
                  setFormError(null);
                  setForm((current) => ({...current, maxEventsPerDay: value}));
                }} />
            </FormField>
            <p className="mt-3 text-sm text-muted-foreground">
              {capacityDirty
                ? "Save to apply this daily limit. Day-by-day booked and remaining slots stay on Calendar."
                : "Day-by-day booked and remaining slots stay on Calendar."}
            </p>
            {capacityBelowReservations && <p role="status" className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
              At least one upcoming date already has {peakOccupied} occupied slots. Existing bookings will stay in place.
            </p>}
          </AvailabilityCard>

          <AvailabilityCard
            icon={<UsersRound className="size-5" />}
            title="Guest Capacity"
            description="Guest limits apply to services that require them."
          >
            {capabilities.requiresGuestCapacity ? (
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your current service categories do not require additional capacity settings.
              </p>
            )}
          </AvailabilityCard>
        </div>
      </div>

      <section
        className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
        aria-labelledby="unavailable-dates-heading"
      >
        <CardHeading
          icon={<CalendarOff className="size-5" />}
          id="unavailable-dates-heading"
          title="Unavailable Dates"
          description="Block dates when your business cannot accept events. Dates use Philippine calendar time."
        />

        <div className="grid min-w-0 max-w-2xl gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <FormField
            id="unavailableDate"
            label="Date to make unavailable"
          >
            <PhilippineDateInput
              className="min-h-9 py-1.5 ps-3 pe-10 text-sm [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:end-3 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:opacity-65"
              displayClassName="start-3 end-10 text-sm"
              min={today}
              value={selectedDate}
              disabled={datePending !== null}
              onChange={(event) => {
                setDateError(null);
                setSelectedDate(event.currentTarget.value);
              }}
            />
          </FormField>

          <FormField id="unavailableDateReason" label="Reason (optional)">
            <Input className="min-h-9 px-3 py-1.5 text-sm" value={blockReason} maxLength={160} disabled={datePending !== null}
              onChange={(event) => setBlockReason(event.currentTarget.value)}
              placeholder="e.g., Holiday, Maintenance, Off-site event" />
          </FormField>

          <Button
            type="button"
            size="compact"
            disabled={
              selectedDate === "" ||
              duplicateDate ||
              selectedDateHasBookings ||
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
            Block date
          </Button>
        </div>

        {duplicateDate ? (
          <p className="text-sm font-medium text-muted-foreground" role="status">
            This date is already unavailable.
          </p>
        ) : null}

        {selectedDateHasBookings && !duplicateDate && <p role="status" className="text-sm font-medium text-destructive">
          This date has confirmed or reserved bookings and cannot be blocked.
        </p>}

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

        <div className="grid gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Blocked dates ({unavailableDates.length})</h3>
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
          <ul className="grid min-w-0 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] [&>li]:max-w-md">
            {unavailableDates.map((date) => {
              const isPast = date < today;

              return (
                <li
                  key={date}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-muted/35 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <time className="block truncate font-semibold" dateTime={date}>
                      {formatPhilippineDate(date)}
                    </time>
                    <span className="mt-1 inline-flex max-w-full items-start gap-1.5 break-words rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                      <span>{isPast ? "Past date" : "Blocked"}{unavailableDateReasons[date] ? ` · ${unavailableDateReasons[date]}` : ""}</span>
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={isPast || datePending !== null}
                    loading={datePending === date}
                    loadingLabel="Removing"
                    aria-label={`Make ${formatPhilippineDate(date)} available`}
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
        </div>
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
  requiredMark = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  requiredMark?: boolean;
  children: React.ReactNode;
}) {
  const id = `availability-${title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-").replaceAll(/^-|-$/gu, "")}`;

  return (
    <section
      className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-labelledby={id}
    >
      <CardHeading
        icon={icon}
        id={id}
        title={title}
        description={description}
        requiredMark={requiredMark}
      />
      {children}
    </section>
  );
}

function CardHeading({
  icon,
  id,
  title,
  description,
  requiredMark = false,
}: {
  icon: React.ReactNode;
  id: string;
  title: string;
  description: string;
  requiredMark?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-strong [&>svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold tracking-tight">
          {title}
          {requiredMark ? (
            <span aria-hidden="true" className="ml-1 text-destructive">*</span>
          ) : null}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
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
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  minimum: number;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <Input
        type="number"
        inputMode="numeric"
        min={minimum}
        max={100_000}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </FormField>
  );
}

function formFromSettings(
  settings: ProviderAvailabilitySettings,
): AvailabilityFormState {
  return {
    operatingDays: [...settings.operatingDays],
    bookingLeadTimeDays: String(settings.bookingLeadTimeDays),
    maxEventsPerDay: String(settings.maxEventsPerDay),
    minGuestsPerEvent: String(settings.guestCapacity?.minimum ?? 0),
    maxGuestsPerEvent: String(settings.guestCapacity?.maximum ?? 0),
  };
}

function formFromMutation(
  settings: UpdateProviderAvailabilitySettingsResult["settings"],
): AvailabilityFormState {
  return {
    operatingDays: [...settings.operatingDays],
    bookingLeadTimeDays: String(settings.bookingLeadTimeDays),
    maxEventsPerDay: String(settings.maxEventsPerDay),
    minGuestsPerEvent: String(settings.minGuestsPerEvent),
    maxGuestsPerEvent: String(settings.maxGuestsPerEvent),
  };
}

function settingsInput(
  form: AvailabilityFormState,
  settings: ProviderAvailabilitySettings,
): Omit<UpdateProviderAvailabilitySettingsInput, "expectedSettingsRevision"> {
  if (form.operatingDays.length === 0) {
    throw new Error("Select at least one operating day.");
  }

  if (form.bookingLeadTimeDays.trim() === "") {
    throw new Error("Enter your minimum booking notice.");
  }

  const bookingLeadTimeDays = boundedInteger(
    form.bookingLeadTimeDays,
    "Minimum booking notice",
    0,
    365,
  );
  const maxEventsPerDay = boundedInteger(form.maxEventsPerDay, "Daily event capacity", 1, 100);
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
    acceptsMultipleEventsPerDay: maxEventsPerDay > 1,
    maxEventsPerDay,
    minGuestsPerEvent,
    maxGuestsPerEvent,
    availableStaffCount: settings.availableStaffCount ?? 0,
    availableEquipmentCount: settings.availableEquipmentCount ?? 0,
  };
}

function settingsFieldErrors(form: AvailabilityFormState): Partial<Record<"operatingDays" | "bookingLeadTimeDays" | "maxEventsPerDay", string>> {
  const errors: Partial<Record<"operatingDays" | "bookingLeadTimeDays" | "maxEventsPerDay", string>> = {};
  if (!form.operatingDays.length) errors.operatingDays = "Select at least one operating day.";
  if (!isBoundedInteger(form.bookingLeadTimeDays, 0, 365)) {
    errors.bookingLeadTimeDays = "Minimum booking notice must be a whole number from 0 to 365.";
  }
  if (!isBoundedInteger(form.maxEventsPerDay, 1, 100)) {
    errors.maxEventsPerDay = "Maximum events per day must be a whole number from 1 to 100.";
  }
  return errors;
}

function isBoundedInteger(value: string, minimum: number, maximum: number): boolean {
  const number = Number(value);
  return /^\d+$/.test(value.trim()) && Number.isSafeInteger(number) && number >= minimum && number <= maximum;
}

function boundedInteger(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const number = Number(value);

  if (!isBoundedInteger(value, minimum, maximum)) {
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

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
