"use client";

import {createContext, useContext, useEffect, useRef, useState, useTransition} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {walkInInputError} from "@/lib/provider/bookings/walk-in-validation";
import {
  DROP_OFF_END_TIME_LABEL,
  DROP_OFF_TIME_HELPER,
  DROP_OFF_TIME_LABEL,
  EVENT_END_TIME_LABEL,
  EVENT_START_TIME_LABEL,
  cateringScheduleMode,
} from "@/lib/catering/catering-schedule";
import {Button} from "@/components/ui/button";
import type {WalkInOffer} from "@/lib/provider/bookings/walk-in-booking-service";
import {checkWalkInDayAction, saveWalkIn, type WalkInActionState} from "./actions";

const peso = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const pricingLabels: Record<string, string> = {
  fixed: "Fixed price", per_pax: "Per pax", per_bundle: "Per bundle",
  per_guest: "Per guest", per_hour: "Per hour", per_unit: "Per unit", custom_quote: "Custom quote",
};

function suggestedPrice(offer: WalkInOffer | undefined, option?: WalkInOffer["options"][number]): string {
  if (!offer || !["fixed", "per_bundle"].includes(offer.pricingModel) || (!option && offer.options.length)) return "";
  const cents = option?.priceCentavos ?? offer.publishedPriceCentavos;
  return cents === null ? "" : (cents / 100).toFixed(2);
}

const eventTypes = ["Birthday", "Wedding", "Corporate Event", "Catering Only"];
type Availability = {
  kind: "checking" | "available" | "full" | "blocked" | "error";
  text: string;
  counts?: {capacity: number; occupied: number; remaining: number};
};

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2";

const Validation = createContext<Record<string, string>>({});

function fieldError(input: HTMLInputElement | HTMLSelectElement): string {
  if (input instanceof HTMLSelectElement) {
    if (input.required && !input.value) {
      return input.name === "event type" ? "Select an event type." : "Choose a package, service, or custom service.";
    }
    return "";
  }
  if (input.name === "acknowledgment" && !input.checked) return "Confirm the customer agreed to the booking details.";
  if (input.required && input.type !== "checkbox" && !input.value.trim() && !input.validity.badInput) {
    return "This field is required.";
  }
  const message = walkInInputError(input.name, input.value);
  if (message) return message;
  if (input.type === "email" && input.validity.typeMismatch) return "Please enter a valid email address";
  if (!input.validity.valid) return input.validationMessage;
  const peer = (name: string) => {
    const field = input.form?.elements.namedItem(name);
    return field instanceof HTMLInputElement ? field.value : "";
  };
  if (
    input.name === "end time" &&
    peer("start time") &&
    input.value &&
    input.value <= peer("start time")
  ) {
    return "End time must be later than start time.";
  }
  if ((input.name === "agreement time" || input.name === "agreement date") &&
      Date.parse(`${peer("agreement date")}T${peer("agreement time") || "00:00"}:00+08:00`) > Date.now()) {
    return "The agreement date and time must be in the past.";
  }
  return "";
}

function FieldError({name}: {name: string}) {
  const error = useContext(Validation)[name];
  return error ? <span id={`error-${name.replaceAll(" ", "-")}`} className="text-sm text-destructive">{error}</span> : null;
}

function Field({name, label, type = "text", required = true, maxLength, inputMode, value, defaultValue, onValueChange}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  inputMode?: "numeric" | "decimal";
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const invalid = Boolean(useContext(Validation)[name]);
  return <label className="grid content-start gap-1">{label}
    <input className={inputClass} name={name} type={type} required={required}
      maxLength={maxLength} inputMode={inputMode} value={value} defaultValue={defaultValue}
      onChange={onValueChange ? (event) => onValueChange(event.target.value) : undefined}
      aria-invalid={invalid || undefined} aria-describedby={invalid ? `error-${name.replaceAll(" ", "-")}` : undefined} />
    <FieldError name={name} />
  </label>;
}

export function WalkInForm({packages, catalogUnavailable = false, agreementDefaults, initialEventDate = ""}: {
  packages: WalkInOffer[];
  catalogUnavailable?: boolean;
  initialEventDate?: string;
  agreementDefaults?: {date: string; time: string};
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = useRef(false);
  const router = useRouter();
  const [selection, setSelection] = useState(packages.length ? "" : "custom");
  const [eventType, setEventType] = useState("");
  const [pricingOption, setPricingOption] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const submissionKey = useRef<string | undefined>(undefined);
  const [date, setDate] = useState(initialEventDate);
  const [availabilityResult, setAvailabilityResult] = useState<{date: string; result: Availability}>();
  const [state, setState] = useState<WalkInActionState>({});
  const selected = packages.find((offer) => `${offer.kind}/${offer.id}` === selection);
  const chosenOption = selected?.options.find((option) => option.id === pricingOption);
  const dropOffSchedule = cateringScheduleMode(pricingOption) === "drop_off_time";
  const [pending, startTransition] = useTransition();
  const dateError = date ? walkInInputError("event date", date) : "";
  const availability: Availability | undefined = !date || dateError ? undefined :
    availabilityResult?.date === date ? availabilityResult.result :
      {kind: "checking", text: "Checking availability…"};

  useEffect(() => {
    if (!date || dateError) return;
    let active = true;
    async function checkDate() {
      let result: Availability;
      try {
        const check = await checkWalkInDayAction(date);
        if ("error" in check) result = {kind: "error", text: check.error ?? "Availability could not be checked."};
        else {
          const counts = {capacity: check.capacity, occupied: check.occupied, remaining: check.remaining};
          if (check.blocked) result = {kind: "blocked", text: "This date is unavailable. Choose another date.", counts};
          else if (check.remaining === 0) result = {kind: "full", text: "Date Fully Booked", counts};
          else result = {kind: "available", text: `Available (${check.remaining} ${check.remaining === 1 ? "slot" : "slots"} free)`, counts};
        }
      } catch {
        result = {kind: "error", text: "Availability could not be checked. The date will be checked when you confirm."};
      }
      if (active) setAvailabilityResult({date, result});
    }
    void checkDate();
    return () => { active = false; };
  }, [date, dateError]);

  const unavailable = availability?.kind === "full" || availability?.kind === "blocked";
  const checking = availability?.kind === "checking";

  return (
    <Validation.Provider value={errors}>
      <form className="grid gap-5 rounded-lg border p-5" noValidate
        onChange={(event) => {
          dirty.current = true;
          const input = event.target;
          if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
          const affected = [input.name];
          if (input.name === "start time") affected.push("end time");
          if (input.name === "agreement date") affected.push("agreement time");
          if (input.name === "agreement time") affected.push("agreement date");
          const updated = Object.fromEntries(affected.flatMap((name) => {
            const field = input.form?.elements.namedItem(name);
            return (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) && Object.hasOwn(errors, name)
              ? [[name, fieldError(field)]] : [];
          }));
          setErrors((current) => ({...current, ...updated}));
        }}
        onBlur={(event) => {
          const input = event.target;
          if (input instanceof HTMLInputElement && input.name && input.type !== "hidden") {
            const error = fieldError(input);
            setErrors((current) => ({...current, [input.name]: error}));
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (unavailable || checking || pending) return;
          const form = event.currentTarget;
          const invalid = Array.from(form.elements).flatMap((input) => {
            if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement) || input.type === "hidden") return [];
            const error = fieldError(input);
            return error ? [{input, error}] : [];
          });
          setErrors(Object.fromEntries(invalid.map(({input, error}) => [input.name, error])));
          if (invalid.length) {
            invalid[0].input.focus();
            setState({error: "Review the highlighted fields before confirming."});
            return;
          }
          const fields = new FormData(form);
          submissionKey.current ??= crypto.randomUUID();
          fields.set("submission key", submissionKey.current);
          startTransition(async () => {
            try {
              const result = await saveWalkIn({}, fields);
              setState(result);
              if (result.reference) {
                form.reset();
                dirty.current = false;
                setErrors({});
                setSelection(packages.length ? "" : "custom");
                setEventType("");
                setPricingOption("");
                setAgreedPrice("");
                submissionKey.current = undefined;
                setDate("");
                setAvailabilityResult(undefined);
                router.push(`/provider/bookings/walk-in?saved=${encodeURIComponent(result.reference)}`);
              }
            } catch {
              setState({error: "The walk-in booking could not be saved. Try again."});
            }
          });
        }}>
        <input type="hidden" name="action" value="create" />
        <h2 className="text-lg font-semibold">Record a walk-in booking</h2>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-medium">Customer details</legend>
          <Field name="full name" label="Full name" maxLength={160} />
          <Field name="contact number" label="Contact number" type="tel" inputMode="numeric" maxLength={40} />
          <Field name="email" label="Email (optional)" type="email" required={false} maxLength={254} />
          <Field name="additional contact" label="Additional contact information (optional)" required={false} maxLength={300} />
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-medium">Event details</legend>
          <label className="grid content-start gap-1">Event type
            <select className={inputClass} name="event type" required value={eventType}
              aria-invalid={Boolean(errors["event type"]) || undefined}
              aria-describedby={errors["event type"] ? "error-event-type" : undefined}
              onChange={(event) => setEventType(event.target.value)}>
              <option value="" disabled>Select an event type</option>
              {eventTypes.map((type) => <option key={type}>{type}</option>)}
              <option value="other">Other…</option>
            </select>
            <FieldError name="event type" />
          </label>
          <div className="grid content-start gap-1">
            <label>Event date
              <input className={inputClass} name="event date" type="date" required value={date}
                aria-invalid={Boolean(errors["event date"] || dateError) || undefined}
                aria-describedby={errors["event date"] || dateError ? "error-event-date" : "walk-in-availability"}
                onChange={(event) => {
                  const nextDate = event.currentTarget.value;
                  if (nextDate !== date) setAvailabilityResult(undefined);
                  setDate(nextDate);
                }} />
            </label>
            {!errors["event date"] && dateError
              ? <span id="error-event-date" className="text-sm text-destructive">{dateError}</span>
              : <FieldError name="event date" />}

          </div>
          {eventType === "other" && <Field name="custom event type" label="Specify event type" maxLength={100} />}
          <div className="grid content-start gap-1">
            <Field
              name="start time"
              label={dropOffSchedule ? DROP_OFF_TIME_LABEL : EVENT_START_TIME_LABEL}
              type="time"
            />
            {dropOffSchedule ? (
              <p className="text-xs text-muted-foreground">{DROP_OFF_TIME_HELPER}</p>
            ) : null}
          </div>
          <Field
            name="end time"
            label={dropOffSchedule ? DROP_OFF_END_TIME_LABEL : EVENT_END_TIME_LABEL}
            type="time"
          />
          <Field name="venue name" label="Venue name" maxLength={160} />
          <Field name="venue address" label="Complete venue address" maxLength={300} />
          <Field name="number of guests" label="Expected guests (where applicable)" inputMode="numeric" required={false} maxLength={6} />
          <label className="grid gap-1 sm:col-span-2">Special requests (optional)
            <textarea className={inputClass} name="special requests" maxLength={2000} />
          </label>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-medium">Package or service</legend>
          <label className="grid content-start gap-1">Service selection
            <select className={inputClass} name="package" value={selection} required
              aria-invalid={Boolean(errors.package) || undefined}
              aria-describedby={errors.package ? "error-package" : undefined}
              onChange={(event) => {
                const value = event.target.value;
                const offer = packages.find((item) => `${item.kind}/${item.id}` === value);
                const option = offer?.options[0];
                setSelection(value);
                setPricingOption(option?.id ?? "");
                setAgreedPrice(suggestedPrice(offer, option));
                setErrors((current) => ({...current, package: "", "agreed price": ""}));
              }}>
              {packages.length > 0 && <option value="" disabled>Select a published package or service</option>}
              {packages.map(({id, kind, name}) => {
                const value = `${kind}/${id}`;
                return <option key={value} value={value}>{name}</option>;
              })}
              <option value="custom">+ Custom Walk-In Service</option>
            </select>
            <FieldError name="package" />
          </label>
          {catalogUnavailable && <p role="status" className="text-sm text-destructive">
            The catalog could not be loaded. Reload the page to retry or select a custom walk-in service.
          </p>}
          {selection === "custom" && <Field name="custom service" label="Service name" maxLength={160} />}
          {selected && <div className="space-y-2 rounded-md border p-3 sm:col-span-2">
            <p className="font-medium">{selected.name}</p>
            {selected.category && <p className="capitalize">{selected.category.replaceAll("_", " ")}</p>}
            <p>{pricingLabels[selected.pricingModel]}{selected.publishedPriceCentavos !== null &&
              ` · ${selected.options.length > 1 ? "From " : ""}${peso.format(selected.publishedPriceCentavos / 100)}`}</p>
            {(selected.minimumGuests !== null || selected.maximumGuests !== null) && <p>
              {selected.minimumGuests !== null && `Minimum guests: ${selected.minimumGuests}`}
              {selected.minimumGuests !== null && selected.maximumGuests !== null && " · "}
              {selected.maximumGuests !== null && `Maximum guests: ${selected.maximumGuests}`}
            </p>}
            {selected.freelanceDetails?.coverageMinutes && <p>Coverage: {selected.freelanceDetails.coverageMinutes} minutes</p>}
            {!!selected.freelanceDetails?.deliverables.length && <div>
              <p className="font-medium">Deliverables</p>
              <ul className="list-disc pl-5">
                {selected.freelanceDetails.deliverables.map((item) => <li key={item.id}>
                  {item.name} · {item.min === item.max ? item.min : `${item.min}–${item.max}`} {item.unit} · {item.method.replaceAll("_", " ")}
                </li>)}
              </ul>
            </div>}
            {!!selected.freelanceDetails?.addOns.length && <div>
              <p className="font-medium">Available extras</p>
              <ul className="list-disc pl-5">
                {selected.freelanceDetails.addOns.map((item) => <li key={item.id}>
                  {item.name} · {peso.format(item.priceCentavos / 100)} per {item.unit}
                </li>)}
              </ul>
            </div>}
            {(selected.inclusions.length > 0 || !!selected.freelanceDetails?.inclusions?.length) &&
              <ul className="list-disc pl-5">
                {[...new Set([...selected.inclusions, ...(selected.freelanceDetails?.inclusions ?? []).map((item) => item.label)])]
                  .map((item) => <li key={item}>{item}</li>)}
              </ul>}
            {selected.options.length > 0 && <label className="grid gap-1 sm:max-w-sm">Pricing option
              <select className={inputClass} name="pricing option" value={pricingOption} required
                onChange={(event) => {
                  const option = selected.options.find((item) => item.id === event.target.value);
                  setPricingOption(event.target.value);
                  setAgreedPrice(suggestedPrice(selected, option));
                  setErrors((current) => ({...current, "agreed price": ""}));
                }}>
                {selected.options.map((option) => <option key={option.id} value={option.id}>
                  {option.label} · {peso.format(option.priceCentavos / 100)}
                </option>)}
              </select>
            </label>}
            {!!chosenOption?.inclusions.length && <ul className="list-disc pl-5">
              {chosenOption.inclusions.map((item) => <li key={item}>{item}</li>)}
            </ul>}
          </div>}
          {selection && <label className="grid gap-1 sm:col-span-2">
            {selection === "custom" ? "Service description (optional)" : "Agreed package or service changes (optional)"}
            <textarea className={inputClass} name="service details" maxLength={2000} />
          </label>}
        </fieldset>
        {selection && <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-medium">Agreed price</legend>
          <Field name="agreed price" label="Agreed price in ₱ (optional, for reference)"
            inputMode="decimal" required={false}
            maxLength={12} value={agreedPrice} onValueChange={setAgreedPrice} />
          <Field name="pricing notes" label="Pricing notes (optional)" required={false} maxLength={1000} />
        </fieldset>}
        <section id="walk-in-availability" aria-labelledby="walk-in-availability-heading" className="grid gap-3 rounded-lg border border-border p-4">
          <h3 id="walk-in-availability-heading" className="font-medium">Availability check</h3>
          <p className="text-sm text-muted-foreground">{date ? `Selected event date: ${date}` : "Select an event date to check availability."}</p>
          <div role="status">
              {availability && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${availability.kind === "available"
                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                : availability.kind === "checking" ? "bg-muted text-muted-foreground"
                  : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
                {availability.kind !== "checking" && <span aria-hidden="true">{availability.kind === "available" ? "✓" : "⚠"}</span>}
                {availability.text}
              </span>}
            </div>
          {availability?.counts && <dl className="grid grid-cols-3 gap-2 text-sm">
            <div><dt>Daily capacity</dt><dd className="font-semibold">{availability.counts.capacity}</dd></div>
            <div><dt>Occupied slots</dt><dd className="font-semibold">{availability.counts.occupied}</dd></div>
            <div><dt>Remaining slots</dt><dd className="font-semibold">{availability.counts.remaining}</dd></div>
          </dl>}
          {availability?.kind === "full" && <p className="text-sm text-muted-foreground">Choose another date to confirm this booking.</p>}
        </section>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-medium">Booking agreement</legend>
          <Field name="agreement date" label="Date of agreement" type="date" defaultValue={agreementDefaults?.date} />
          <Field name="agreement time" label="Time of agreement" type="time" defaultValue={agreementDefaults?.time} />
          <div className="grid gap-1 sm:col-span-2">
            <label className="flex items-start gap-2">
              <input name="acknowledgment" type="checkbox" required className="mt-1"
                aria-invalid={Boolean(errors.acknowledgment) || undefined}
                aria-describedby={errors.acknowledgment ? "error-acknowledgment" : undefined} />
              <span>The customer has reviewed and agreed to these booking details</span>
            </label>
            <div className="ps-5"><FieldError name="acknowledgment" /></div>
          </div>
          <Field name="agreement notes" label="How the agreement was obtained (optional)" required={false} maxLength={1000} />
        </fieldset>
        <div aria-live="polite">
          {state.error ?? state.message}
          {state.reference && <div className="mt-1 flex flex-wrap gap-2">
            <span>Reference {state.reference}</span>
            <Link className="underline" href={`/provider/bookings/walk-in?reference=${state.reference}#booking-${state.reference}`}>View booking</Link>
            {typeof state.remaining === "number" && <span>{state.remaining} daily slots remaining</span>}
          </div>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {pending ? (
            <Button variant="secondary" size="compact" disabled>Cancel</Button>
          ) : (
            <Button asChild variant="secondary" size="compact">
              <Link href="/provider/bookings/walk-in" onClick={(event) => {
                if (dirty.current && !window.confirm("Discard this unsaved walk-in booking?")) event.preventDefault();
              }}>Cancel</Link>
            </Button>
          )}
          <Button type="submit" size="compact" disabled={unavailable || checking} loading={pending} loadingLabel="Saving…">
            Save &amp; Confirm Booking
          </Button>
        </div>
      </form>
    </Validation.Provider>
  );
}
