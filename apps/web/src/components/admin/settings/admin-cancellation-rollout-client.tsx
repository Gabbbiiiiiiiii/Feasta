"use client";

import {type FormEvent, useState, useTransition} from "react";
import {updateAdminCancellationRolloutAction} from "@/app/admin/settings/actions";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import type {AdminCancellationRolloutSettings, AdminCustomerCancellationMode} from "@/lib/admin/settings/admin-settings-types";

const labels = {off: "Off", review_only: "Review only", enabled: "Enabled"};
const help = {
  off: "Customers cannot submit cancellation requests through the rollout workflow.",
  review_only: "Customers may submit cancellation requests, but automatic policy-backed no-payment cancellation is disabled.",
  enabled: "Customer cancellation workflow is available. Automatic handling still depends on the second setting.",
};
const selectClass = "min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function AdminCancellationRolloutClient({initialSettings}: {initialSettings: AdminCancellationRolloutSettings}) {
  const [saved, setSaved] = useState(initialSettings);
  const [customerMode, setCustomerMode] = useState(initialSettings.customerCancellationMode);
  const [automaticMode, setAutomaticMode] = useState(initialSettings.automaticPolicyRefundApprovalMode);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonValid = reason.trim().length >= 10 && reason.trim().length <= 1000;

  function restore(settings: AdminCancellationRolloutSettings) {
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
    startTransition(async () => {
      try {
        const result = await updateAdminCancellationRolloutAction({
          customerCancellationMode: customerMode,
          automaticPolicyRefundApprovalMode: automaticMode,
          internalReason: reason.trim(),
        });
        setSaved(result.settings);
        restore(result.settings);
        setSuccess(result.changed ? "Cancellation rollout was updated successfully." : "No cancellation rollout changes were required.");
      } catch {
        setError("Cancellation rollout could not be updated. Please try again.");
      }
    });
  }

  return (
    <section aria-labelledby="cancellation-rollout-heading" className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
      <h2 id="cancellation-rollout-heading" className="text-xl font-bold text-foreground">Customer Cancellation Rollout</h2>
      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6">
        <p className="font-semibold text-foreground">Current saved state</p>
        <p>Customer cancellation: {labels[saved.customerCancellationMode]}</p>
        <p>Automatic unpaid cancellation: {labels[saved.automaticPolicyRefundApprovalMode]}</p>
        <p className="text-muted-foreground">{saved.updatedAt ? `Last updated: ${new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"}).format(new Date(saved.updatedAt))} (Asia/Manila)` : "No saved update timestamp available. Missing or invalid configuration displays Off for both modes."}</p>
      </div>
      <form onSubmit={submit} className="mt-6 grid gap-6" aria-busy={pending}>
        <div className="grid gap-2">
          <label htmlFor="cancellation-customer-mode" className="font-semibold text-foreground">Customer cancellation</label>
          <select id="cancellation-customer-mode" className={selectClass} value={customerMode} disabled={pending} aria-describedby="cancellation-customer-help" onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "off" || value === "review_only" || value === "enabled") {
              setCustomerMode(value as AdminCustomerCancellationMode);
              if (value !== "enabled") setAutomaticMode("off");
              setSuccess(null);
            }
          }}>
            <option value="off">Off</option><option value="review_only">Review only</option><option value="enabled">Enabled</option>
          </select>
          <p id="cancellation-customer-help" className="text-sm leading-6 text-muted-foreground">{help[customerMode]}</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="cancellation-automatic-mode" className="font-semibold text-foreground">Automatic cancellation for definitely-unpaid bookings</label>
          <select id="cancellation-automatic-mode" className={selectClass} value={automaticMode} disabled={pending || customerMode !== "enabled"} aria-describedby="cancellation-automatic-help" onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "off" || value === "enabled") setAutomaticMode(value);
            setSuccess(null);
          }}>
            <option value="off">Off</option><option value="enabled">Enabled</option>
          </select>
          <p id="cancellation-automatic-help" className="text-sm leading-6 text-muted-foreground">Requires customer cancellation to be Enabled. Applies only to trusted policy-backed bookings still waiting for payment with no settled or unresolved payment. Paid bookings continue through the normal policy workflow; processing or unresolved payments await payment resolution.</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="cancellation-internal-reason" className="font-semibold text-foreground">Internal administrative reason</label>
          <Textarea id="cancellation-internal-reason" value={reason} disabled={pending} required minLength={10} maxLength={1000} aria-describedby="cancellation-reason-help" onChange={(event) => setReason(event.currentTarget.value)} />
          <p id="cancellation-reason-help" className="text-sm text-muted-foreground">Required: 10 to 1000 characters. Stored privately in the administrative audit log. Saving the displayed Off state can also repair missing or invalid configuration.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {success && <p role="status" className="text-sm text-success">{success}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending || !reasonValid}>{pending ? "Saving..." : "Save cancellation rollout"}</Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => {restore(saved); setError(null); setSuccess(null);}}>Discard changes</Button>
        </div>
      </form>
    </section>
  );
}
