import {adminBookingStatusLabel, adminBookingPaymentLabel, adminProviderRequestLabel} from "@/lib/admin/bookings/admin-booking-labels";
import type {
  MainEventStatus,
  PaymentStatus,
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
  | PaymentStatus
  | ProviderRequestStatus
  | AdminBookingOverallPaymentStatus;

type BookingStatusBadgeProps = {
  status: BookingStatus;
  className?: string;
  kind?: "booking" | "payment" | "provider";
};

type StatusPresentation = {
  tone: NonNullable<BadgeProps["tone"]>;
};

const STATUS_PRESENTATIONS:
  Record<string, StatusPresentation> = {
    draft: {
      tone: "neutral",
    },

    pending_provider_approval: {
      tone: "warning",
    },

    needs_provider_replacement: {
      tone: "destructive",
    },

    waiting_for_down_payment: {
      tone: "warning",
    },

    confirmed: {
      tone: "success",
    },

    in_progress: {
      tone: "info",
    },

    completed: {
      tone: "success",
    },

    cancelled: {
      tone: "destructive",
    },

    expired: {
      tone: "neutral",
    },

    pending: {
      tone: "warning",
    },

    accepted: {
      tone: "info",
    },

    rejected: {
      tone: "destructive",
    },

    payment_processing: {
      tone: "info",
    },

    unpaid: {
      tone: "neutral",
    },

    processing: {
      tone: "info",
    },

    partially_paid: {
      tone: "warning",
    },

    paid: {
      tone: "success",
    },

    partially_refunded: {
      tone: "info",
    },

    failed: {
      tone: "destructive",
    },

    refunded: {
      tone: "info",
    },
  };

function BookingStatusBadge({
  status,
  className,
  kind = "booking",
}: BookingStatusBadgeProps) {
  const presentation =
    STATUS_PRESENTATIONS[status] ?? {
      tone: "neutral" as const,
    };

  return (
    <Badge
      tone={presentation.tone}
      className={className}
    >
      {kind === "payment" ? adminBookingPaymentLabel(status) : kind === "provider" ? adminProviderRequestLabel(status as ProviderRequestStatus) : adminBookingStatusLabel(status)}
    </Badge>
  );
}

export {
  BookingStatusBadge,
  type BookingStatusBadgeProps,
};
