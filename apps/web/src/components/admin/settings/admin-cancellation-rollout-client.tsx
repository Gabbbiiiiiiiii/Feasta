"use client";

import {type FormEvent, useState, useTransition} from "react";
import {updateAdminCancellationRolloutAction} from "@/app/admin/settings/actions";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import type {AdminCancellationRolloutSettings, AdminCustomerCancellationMode} from "@/lib/admin/settings/admin-settings-types";
import {validateAdminCancellationRolloutUpdate} from "@/lib/admin/settings/admin-settings-validation";

const labels = {off: "Off", review_only: "Review only", enabled: "Enabled"};
const help = {
  off: "Customers cannot submit cancellation requests through the rollout workflow.",
  review_only: "Customers can request cancellation, but automatic cancellation before payment is turned off.",
  enabled: "Customers can request cancellation. Automatic cancellation still depends on the automatic approval setting.",
};
const selectClass = "min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function AdminCancellationRolloutClient({initialSettings}: {initialSettings: AdminCancellationRolloutSettings}) {
  const [saved, setSaved] = useState(initialSettings);
  const [bookingMode, setBookingMode] = useState(initialSettings.bookingRefundPolicyCaptureMode);
  const [customerMode, setCustomerMode] = useState(initialSettings.customerCancellationMode);
  const [automaticMode, setAutomaticMode] = useState(initialSettings.automaticPolicyRefundApprovalMode);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonValid = reason.trim().length >= 10 && reason.trim().length <= 1000;

  function restore(settings: AdminCancellationRolloutSettings) {
    setBookingMode(settings.bookingRefundPolicyCaptureMode);
    setCustomerMode(settings.customerCancellationMode);
    setAutomaticMode(settings.automaticPolicyRefundApprovalMode);
    setReason("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setSuccess(null);
    setError(null);
    if (!reasonValid) {
      setError("Enter an internal administrative reason of 10 to 1000 characters.");
      return;
    }
    const input = {
      bookingRefundPolicyCaptureMode: bookingMode,
      customerCancellationMode: customerMode,
      automaticPolicyRefundApprovalMode: automaticMode,
      internalReason: reason.trim(),
    };
    try {
      validateAdminCancellationRolloutUpdate(input);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Choose a valid rollout configuration.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateAdminCancellationRolloutAction(input);
        setSaved(result.settings);
        restore(result.settings);
        setSuccess(result.changed ? "Booking and cancellation rollout was updated successfully." : "No booking or cancellation rollout changes were required.");
      } catch {
        setError("Booking and cancellation rollout could not be updated. Please try again.");
      }
    });
  }

  return (
    <section aria-labelledby="cancellation-rollout-heading" className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
      <h2 id="cancellation-rollout-heading" className="text-xl font-bold text-foreground">Booking and cancellation settings</h2>
      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6">
        <p className="font-semibold text-foreground">Current saved state</p>
        <p>Booking refund-policy capture: {saved.bookingRefundPolicyCaptureMode === "required" ? "Required" : "Off"} ({saved.bookingCaptureConfigurationStatus})</p>
        <p className="text-muted-foreground">{saved.bookingCaptureUpdatedAt ? `Booking capture last updated: ${new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"}).format(new Date(saved.bookingCaptureUpdatedAt))} (Asia/Manila)` : "No saved booking capture update timestamp available."}</p>
        <p>Customer cancellation: {labels[saved.customerCancellationMode]}</p>
        <p>Automatic policy refund approval: {labels[saved.automaticPolicyRefundApprovalMode]}</p>
        <p className="text-muted-foreground">{saved.updatedAt ? `Last updated: ${new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"}).format(new Date(saved.updatedAt))} (Asia/Manila)` : "No saved cancellation update timestamp available. Missing or invalid cancellation configuration displays Off for both cancellation modes."}</p>
      </div>
      {saved.bookingCaptureConfigurationStatus === "invalid" ? <p role="alert" className="mt-4 text-sm text-destructive">Booking policy capture configuration is invalid. Booking policy checks fail closed until the configuration is repaired; Off is the safe display default.</p> : null}
      {saved.bookingRefundPolicyCaptureMode !== "required" ? <p role="alert" className="mt-4 text-sm text-destructive">{saved.bookingCaptureConfigurationStatus === "invalid" ? "New bookings cannot safely capture policy agreements." : "New bookings are not capturing refund-policy agreements."} Automatic cancellation stays off until refund-policy capture is Required. Save Required capture, or turn both cancellation modes Off. Existing bookings without a recorded refund policy need manual review.</p> : null}
      <form onSubmit={submit} className="mt-6 grid gap-6" aria-busy={pending}>
        <div className="grid gap-2">
          <label htmlFor="booking-policy-capture-mode" className="font-semibold text-foreground">Booking refund-policy capture</label>
          <select id="booking-policy-capture-mode" className={selectClass} value={bookingMode} disabled={pending} aria-describedby="booking-policy-capture-help" onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "off" || value === "required") setBookingMode(value);
            setSuccess(null);
          }}>
            <option value="off">Off</option><option value="required">Required</option>
          </select>
          <p id="booking-policy-capture-help" className="text-sm leading-6 text-muted-foreground">Required asks customers to accept the provider&apos;s current refund policy and saves that policy with the booking. Customer cancellation and automatic approval need this setting. Existing bookings are not updated.</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="cancellation-customer-mode" className="font-semibold text-foreground">Customer cancellation</label>
          <select id="cancellation-customer-mode" className={selectClass} value={customerMode} disabled={pending} aria-describedby="cancellation-customer-help" onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "off" || value === "review_only" || value === "enabled") {
              setCustomerMode(value as AdminCustomerCancellationMode);
              setSuccess(null);
            }
          }}>
            <option value="off">Off</option><option value="review_only">Review only</option><option value="enabled">Enabled</option>
          </select>
          <p id="cancellation-customer-help" className="text-sm leading-6 text-muted-foreground">{help[customerMode]}</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="cancellation-automatic-mode" className="font-semibold text-foreground">Automatic policy refund approval</label>
          <select id="cancellation-automatic-mode" className={selectClass} value={automaticMode} disabled={pending} aria-describedby="cancellation-automatic-help" onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "off" || value === "enabled") setAutomaticMode(value);
            setSuccess(null);
          }}>
            <option value="off">Off</option><option value="enabled">Enabled</option>
          </select>
          <p id="cancellation-automatic-help" className="text-sm leading-6 text-muted-foreground">Automatic cancellation applies only when the booking has a recorded refund policy and no completed payment. Payments still being processed must finish before cancellation can continue. Customer cancellation must be Enabled.</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="cancellation-internal-reason" className="font-semibold text-foreground">Reason for changes</label>
          <Textarea id="cancellation-internal-reason" value={reason} disabled={pending} required minLength={10} maxLength={1000} aria-describedby="cancellation-reason-help" onChange={(event) => setReason(event.currentTarget.value)} />
          <p id="cancellation-reason-help" className="text-sm text-muted-foreground">Enter 10 to 1000 characters. This reason is saved with the activity log. Saving the displayed Off state can also repair a missing or invalid setup.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {success && <p role="status" className="text-sm text-success">{success}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending || !reasonValid}>{pending ? "Saving..." : "Save booking and cancellation rollout"}</Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => {restore(saved); setError(null); setSuccess(null);}}>Discard changes</Button>
        </div>
      </form>
    </section>
  );
}
