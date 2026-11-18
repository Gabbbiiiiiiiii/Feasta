import type {MainEventStatus} from "@feasta/shared-types";

export const bookingStatusLabels: Record<MainEventStatus, string> = {
  draft: "Draft",
  pending_provider_approval: "Awaiting provider",
  needs_provider_replacement: "Provider replacement needed",
  waiting_for_down_payment: "Awaiting payment",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};
