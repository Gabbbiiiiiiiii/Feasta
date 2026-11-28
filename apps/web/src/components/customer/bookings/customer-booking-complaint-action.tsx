"use client";

import {useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {FormField} from "@/components/forms/form-field";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {COMPLAINT_CATEGORIES, submitCustomerBookingComplaint} from "@/lib/customer/bookings/customer-complaint-client";

export function CustomerBookingComplaintAction({providerRequestId, providerName}: {providerRequestId: string; providerName: string}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const busy = useRef(false);
  const triggerId = `report-issue-${providerRequestId}`;

  async function submit() {
    if (busy.current || submitted) return;
    if (!category || description.trim().length < 10 || description.trim().length > 4000) {
      setError("Choose a category and describe the issue in 10 to 4,000 characters.");
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await submitCustomerBookingComplaint({providerRequestId, category, description});
      setSubmitted(true);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your report could not be submitted. Please try again.");
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return <div className="grid gap-2 border-t border-border pt-4">
    {submitted ? <p role="status" className="text-sm font-semibold text-success">Issue reported. FEASTA Admin will review your report.</p> :
      <Button id={triggerId} variant="secondary" fullWidth onClick={() => setOpen(true)} aria-label={`Report an Issue for ${providerName}`}>Report an Issue</Button>}
    {open ? <ConfirmationDialog open title={`Report an Issue: ${providerName}`} description="Tell FEASTA Admin about an issue with this booked service."
      confirmLabel="Submit report" loadingLabel="Submitting report" loading={submitting} onConfirm={submit}
      restoreFocusId={triggerId} onOpenChange={value => {if (!busy.current) setOpen(value);}}>
      <div className="grid gap-4">
        <FormField id="booking-complaint-category" label="Category (required)">
          <select id="booking-complaint-category" required value={category} disabled={submitting} onChange={event => setCategory(event.target.value)} className="min-h-12 rounded-lg border border-input bg-card px-3">
            <option value="">Choose a category</option>
            {COMPLAINT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FormField>
        <FormField id="booking-complaint-description" label="Description (required)" description="10 to 4,000 characters">
          <Textarea value={description} disabled={submitting} maxLength={4000} onChange={event => setDescription(event.target.value)} />
        </FormField>
        {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      </div>
    </ConfirmationDialog> : null}
  </div>;
}
