import {Badge} from "@/components/ui/badge";
import type {
  AdminPaymentStatus,
} from "@/lib/admin/payments/admin-payment-types";

type PaymentStatusBadgeProps = {
  status: AdminPaymentStatus;
};

const statusConfiguration: Record<
  AdminPaymentStatus,
  {
    label: string;
    tone:
      | "neutral"
      | "success"
      | "warning"
      | "destructive"
      | "info";
  }
> = {
  pending: {
    label: "Pending",
    tone: "warning",
  },
  processing: {
    label: "Processing",
    tone: "info",
  },
  paid: {
    label: "Paid",
    tone: "success",
  },
  partially_refunded: {
    label: "Partially refunded",
    tone: "info",
  },
  failed: {
    label: "Failed",
    tone: "destructive",
  },
  expired: {
    label: "Expired",
    tone: "neutral",
  },
  refunded: {
    label: "Refunded",
    tone: "info",
  },
};

function PaymentStatusBadge({
  status,
}: PaymentStatusBadgeProps) {
  const configuration =
    statusConfiguration[status];

  return (
    <Badge tone={configuration.tone}>
      {configuration.label}
    </Badge>
  );
}

export {
  PaymentStatusBadge,
  type PaymentStatusBadgeProps,
};
