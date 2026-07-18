import {Badge, type BadgeProps} from "@/components/ui/badge";

type StatusTone = NonNullable<BadgeProps["tone"]>;

const statusMap: Record<string, {label: string; tone: StatusTone}> = {
  draft: {label: "Draft", tone: "neutral"},
  pending: {label: "Pending", tone: "warning"},
  submitted: {label: "Submitted", tone: "info"},
  under_review: {label: "Under review", tone: "info"},
  resubmission_required: {label: "Resubmission required", tone: "warning"},
  approved: {label: "Approved", tone: "success"},
  accepted: {label: "Accepted", tone: "success"},
  confirmed: {label: "Confirmed", tone: "success"},
  completed: {label: "Completed", tone: "success"},
  paid: {label: "Paid", tone: "success"},
  processing: {label: "Processing", tone: "info"},
  payment_processing: {label: "Payment processing", tone: "info"},
  waiting_payment: {label: "Waiting for payment", tone: "warning"},
  partially_paid: {label: "Partially paid", tone: "warning"},
  rejected: {label: "Rejected", tone: "destructive"},
  failed: {label: "Failed", tone: "destructive"},
  suspended: {label: "Suspended", tone: "destructive"},
  cancelled: {label: "Cancelled", tone: "destructive"},
  expired: {label: "Expired", tone: "neutral"},
  refunded: {label: "Refunded", tone: "info"},
  resolved: {label: "Resolved", tone: "success"},
  escalated: {label: "Escalated", tone: "destructive"},
  closed: {label: "Closed", tone: "success"},
};

function humanize(status: string) {
  const normalized = status.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return "Unknown";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function StatusBadge({status, label}: {status: string; label?: string}) {
  const normalized = status.trim().toLowerCase().replaceAll("-", "_");
  const presentation = statusMap[normalized] ?? {
    label: humanize(normalized),
    tone: "neutral" as const,
  };
  const visibleLabel = label ?? presentation.label;
  return (
    <Badge tone={presentation.tone} aria-label={`Status: ${visibleLabel}`}>
      {visibleLabel}
    </Badge>
  );
}

export {StatusBadge, humanize};
