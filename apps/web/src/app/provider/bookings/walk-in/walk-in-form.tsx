"use client";

import {useActionState, useState, useTransition} from "react";
import {saveWalkIn} from "./actions";

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2";

function Field({name, label, type = "text", required = true, maxLength, min, max, step}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: string;
}) {
  return <label className="grid gap-1">{label}
    <input className={inputClass} name={name} type={type} required={required}
      maxLength={maxLength} min={min} max={max} step={step} />
  </label>;
}

export function WalkInForm({packages}: {packages: {id: string; name: string}[]}) {
  const [selection, setSelection] = useState("");
  const [state, setState] = useState<{message?: string; error?: string}>({});
  const [pending, startTransition] = useTransition();
  return (
    <form className="grid gap-5 rounded-lg border p-5" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      startTransition(async () => {
        try {
          const result = await saveWalkIn({}, fields);
          setState(result);
          if (result.message) {
            form.reset();
            setSelection("");
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
        <Field name="contact number" label="Contact number" type="tel" maxLength={40} />
        <Field name="email" label="Email (optional)" type="email" required={false} maxLength={254} />
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Event details</legend>
        <Field name="event type" label="Event type" maxLength={100} />
        <Field name="event date" label="Event date" type="date" />
        <Field name="start time" label="Start time (Manila)" type="time" />
        <Field name="end time" label="End time (Manila)" type="time" />
        <Field name="location" label="Location" maxLength={300} />
        <Field name="number of guests" label="Number of guests" type="number" min={1} max={100000} />
        <label className="grid gap-1 sm:col-span-2">Special requests (optional)
          <textarea className={inputClass} name="special requests" maxLength={2000} />
        </label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Package or service</legend>
        <label className="grid gap-1">Service selection
          <select className={inputClass} name="package" value={selection}
            onChange={(event) => setSelection(event.target.value)}>
            <option value="">Custom walk-in service</option>
            {packages.map(({id, name}) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        {!selection && <Field name="custom service" label="Service name" maxLength={160} />}
        <label className="grid gap-1 sm:col-span-2">Service details or package changes (optional)
          <textarea className={inputClass} name="service details" maxLength={2000} />
        </label>
        <Field name="agreed price" label="Agreed price in ₱ (optional, for reference)" type="number"
          required={false} min={0} max={999999999.99} step="0.01" />
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Booking agreement</legend>
        <Field name="agreement date" label="Date of agreement" type="date" />
        <label className="flex items-center gap-2">
          <input name="acknowledgment" type="checkbox" required />
          The customer acknowledged the booking agreement.
        </label>
      </fieldset>
      <div aria-live="polite">{state.error ?? state.message}</div>
      <button className="w-fit rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={pending}>
        {pending ? "Saving…" : "Confirm walk-in booking"}
      </button>
    </form>
  );
}

export function WalkInStatusForm({id}: {id: string}) {
  const [state, submit, pending] = useActionState(saveWalkIn, {});
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="reference" value={id} />
      <button className="rounded-md border px-3 py-1" name="action" value="completed" disabled={pending}>Mark completed</button>
      <button className="rounded-md border px-3 py-1" name="action" value="cancelled" disabled={pending}
        onClick={(event) => { if (!window.confirm("Cancel this walk-in booking and release the date?")) event.preventDefault(); }}>
        Cancel booking
      </button>
      <span aria-live="polite">{state.error ?? state.message}</span>
    </form>
  );
}
