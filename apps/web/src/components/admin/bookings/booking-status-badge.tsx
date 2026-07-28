import type {
  MainEventStatus,
  ProviderRequestStatus,
} from "@feasta/shared-types";

import type {
  AdminBookingOverallPaymentStatus,
} from "@/lib/admin/bookings/admin-booking-types";
import {
  Badge,
  type BadgeProps,
} from "@/components/ui/badge";

type BookingStatus =
  | MainEventStatus
  | ProviderRequestStatus
  | AdminBookingOverallPaymentStatus;

type BookingStatusBadgeProps = {
  status: BookingStatus;
  className?: string;
};

type StatusPresentation = {
  label: string;
  tone: NonNullable<BadgeProps["tone"]>;
};

const STATUS_PRESENTATIONS:
  Record<string, StatusPresentation> = {
    draft: {
      label: "Draft",
      tone: "neutral",
    },

    pending_provider_approval: {
      label: "Pending approval",
      tone: "warning",
    },

    needs_provider_replacement: {
      label: "Needs replacement",
      tone: "destructive",
    },

    waiting_for_down_payment: {
      label: "Waiting for payment",
      tone: "warning",
    },

    confirmed: {
      label: "Confirmed",
      tone: "success",
    },

    in_progress: {
      label: "In progress",
      tone: "info",
    },

    completed: {
      label: "Completed",
      tone: "success",
    },

    cancelled: {
      label: "Cancelled",
      tone: "destructive",
    },

    expired: {
      label: "Expired",
      tone: "neutral",
    },

    pending: {
      label: "Pending",
      tone: "warning",
    },

    accepted: {
      label: "Accepted",
      tone: "info",
    },

    rejected: {
      label: "Rejected",
      tone: "destructive",
    },

    payment_processing: {
      label: "Payment processing",
      tone: "info",
    },

    unpaid: {
      label: "Unpaid",
      tone: "neutral",
    },

    processing: {
      label: "Processing",
      tone: "info",
    },

    partially_paid: {
      label: "Partially paid",
      tone: "warning",
    },

    paid: {
      label: "Paid",
      tone: "success",
    },

    failed: {
      label: "Failed",
      tone: "destructive",
    },

    refunded: {
      label: "Refunded",
      tone: "info",
    },
  };

function BookingStatusBadge({
  status,
  className,
}: BookingStatusBadgeProps) {
  const presentation =
    STATUS_PRESENTATIONS[status] ?? {
      label: formatFallbackStatus(status),
      tone: "neutral" as const,
    };

  return (
    <Badge
      tone={presentation.tone}
      className={className}
    >
      {presentation.label}
    </Badge>
  );
}

function formatFallbackStatus(
  status: string,
): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((word) =>
      `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
}

export {
  BookingStatusBadge,
  type BookingStatusBadgeProps,
};