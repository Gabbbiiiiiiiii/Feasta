import type {
  MainEventStatus,
} from "@feasta/shared-types";

export const CUSTOMER_BOOKING_STATUS_FILTERS = [
  "all",
  "draft",
  "awaiting_provider",
  "awaiting_payment",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled_or_expired",
] as const;

export type CustomerBookingStatusFilter =
  (typeof CUSTOMER_BOOKING_STATUS_FILTERS)[number];

export const CUSTOMER_BOOKING_STATUS_OPTIONS:
ReadonlyArray<{
  value: CustomerBookingStatusFilter;
  label: string;
}> = [
  {value: "all", label: "All bookings"},
  {value: "draft", label: "Drafts"},
  {
    value: "awaiting_provider",
    label: "Awaiting provider",
  },
  {
    value: "awaiting_payment",
    label: "Awaiting payment",
  },
  {value: "confirmed", label: "Confirmed"},
  {value: "in_progress", label: "In progress"},
  {value: "completed", label: "Completed"},
  {
    value: "cancelled_or_expired",
    label: "Cancelled or expired",
  },
];

const STATUS_GROUPS: Record<
  Exclude<CustomerBookingStatusFilter, "all">,
  readonly MainEventStatus[]
> = {
  draft: ["draft"],
  awaiting_provider: [
    "pending_provider_approval",
    "needs_provider_replacement",
  ],
  awaiting_payment: [
    "waiting_for_down_payment",
  ],
  confirmed: ["confirmed"],
  in_progress: ["in_progress"],
  completed: ["completed"],
  cancelled_or_expired: [
    "cancelled",
    "expired",
  ],
};

export function customerBookingStatusesForFilter(
  filter: CustomerBookingStatusFilter,
): readonly MainEventStatus[] | null {
  return filter === "all" ?
    null :
    STATUS_GROUPS[filter];
}

export function isCustomerBookingStatusFilter(
  value: unknown,
): value is CustomerBookingStatusFilter {
  return typeof value === "string" &&
    (
      CUSTOMER_BOOKING_STATUS_FILTERS as
        readonly string[]
    ).includes(value);
}

export function customerBookingStatusFilterLabel(
  filter: CustomerBookingStatusFilter,
): string {
  return CUSTOMER_BOOKING_STATUS_OPTIONS
    .find((option) => option.value === filter)
    ?.label ?? "All bookings";
}
