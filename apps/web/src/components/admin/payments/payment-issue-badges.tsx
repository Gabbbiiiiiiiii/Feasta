import {Badge} from "@/components/ui/badge";
import type {
  AdminPaymentIssue,
} from "@/lib/admin/payments/admin-payment-types";

type PaymentIssueBadgesProps = {
  issues: readonly AdminPaymentIssue[];
  showHealthyState?: boolean;
};

const issueConfiguration: Record<
  AdminPaymentIssue,
  {
    label: string;
    description: string;
    tone: "warning" | "destructive";
  }
> = {
  stale_processing: {
    label: "Payment taking longer than expected",
    description:
      "This payment has remained in processing longer than expected.",
    tone: "warning",
  },

  missing_booking: {
    label: "Booking not found",
    description:
      "The booking linked to this payment could not be found.",
    tone: "destructive",
  },

  missing_provider_request: {
    label: "Provider booking record not found",
    description:
      "The linked provider booking record could not be found.",
    tone: "destructive",
  },

  missing_provider: {
    label: "Provider not found",
    description:
      "The linked provider record could not be found.",
    tone: "destructive",
  },

  missing_gateway_reference: {
    label: "Payment reference missing",
    description:
      "The payment is missing its payment service reference.",
    tone: "destructive",
  },

  invalid_amount: {
    label: "Invalid amount",
    description:
      "The payment amount is missing or invalid.",
    tone: "destructive",
  },

  booking_status_mismatch: {
    label: "Payment does not match booking",
    description:
      "The payment and booking payment statuses are inconsistent.",
    tone: "destructive",
  },

  refund_awaiting_webhook: {
    label: "Refund pending",
    description:
      "The refund has been requested and is awaiting confirmation.",
    tone: "warning",
  },
};

function PaymentIssueBadges({
  issues,
  showHealthyState = false,
}: PaymentIssueBadgesProps) {
  if (issues.length === 0) {
    return showHealthyState ? (
      <Badge tone="success">
        No issues
      </Badge>
    ) : null;
  }

  return (
    <div
      className="flex min-w-0 flex-wrap gap-2"
      aria-label="Detected payment issues"
    >
      {issues.map((issue) => {
        const configuration =
          issueConfiguration[issue];

        return (
          <Badge
            key={issue}
            tone={configuration.tone}
            title={configuration.description}
          >
            {configuration.label}
          </Badge>
        );
      })}
    </div>
  );
}

export {
  PaymentIssueBadges,
  issueConfiguration,
  type PaymentIssueBadgesProps,
};