import {Badge} from "@/components/ui/badge";
import type {
  AdminPaymentStatus,
} from "@/lib/admin/payments/admin-payment-types";
import {cn} from "@/lib/utils";

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
  const configuration = statusConfiguration[status];

  return (
    <Badge
      tone={configuration.tone}
      shape="rounded"
      size="compact"
      className={cn(
        "whitespace-nowrap",
        configuration.tone === "neutral" && "border-border",
        configuration.tone === "success" && "border-success/25",
        configuration.tone === "warning" && "border-warning/25",
        configuration.tone === "destructive" && "border-destructive/25",
        configuration.tone === "info" && "border-info/25",
      )}
    >
      {configuration.label}
    </Badge>
  );
}

export {
  PaymentStatusBadge,
  type PaymentStatusBadgeProps,
};
