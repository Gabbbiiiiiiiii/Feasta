import {Badge} from "@/components/ui/badge";
import type {
  AdminPaymentIssue,
} from "@/lib/admin/payments/admin-payment-types";
import {cn} from "@/lib/utils";

type PaymentIssueBadgesProps = {
  issues: readonly AdminPaymentIssue[];
  showHealthyState?: boolean;
  compact?: boolean;
  showDescriptions?: boolean;
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
    label: "Processing delayed",
    description:
      "This payment has remained in processing longer than expected.",
    tone: "warning",
  },

  missing_booking: {
    label: "Missing booking",
    description:
      "The booking linked to this payment could not be found.",
    tone: "destructive",
  },

  missing_provider_request: {
    label: "Missing request",
    description:
      "The linked provider booking record could not be found.",
    tone: "destructive",
  },

  missing_provider: {
    label: "Missing provider",
    description:
      "The linked provider record could not be found.",
    tone: "destructive",
  },

  missing_gateway_reference: {
    label: "Missing reference",
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
    label: "Status mismatch",
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

const issueBadgeClassName = (tone: "warning" | "destructive" | "success") =>
  cn(
    "whitespace-nowrap",
    tone === "warning" && "border-warning/25",
    tone === "destructive" && "border-destructive/25",
    tone === "success" && "border-success/25",
  );

function PaymentIssueBadges({
  issues,
  showHealthyState = false,
  compact = false,
  showDescriptions = false,
}: PaymentIssueBadgesProps) {
  if (issues.length === 0) {
    return showHealthyState ? (
      <Badge
        tone="success"
        shape="rounded"
        size="compact"
        className={issueBadgeClassName("success")}
      >
        No issues
      </Badge>
    ) : null;
  }

  if (showDescriptions) {
    return (
      <ul
        className="grid min-w-0 gap-2"
        aria-label="Detected payment issues"
      >
        {issues.map((issue) => {
          const configuration = issueConfiguration[issue];

          return (
            <li
              key={issue}
              className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-xs"
            >
              <Badge
                tone={configuration.tone}
                shape="rounded"
                size="compact"
                className={issueBadgeClassName(configuration.tone)}
              >
                {configuration.label}
              </Badge>
              <span className="text-muted-foreground">
                {configuration.description}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  const visibleIssues = compact ? issues.slice(0, 1) : issues;
  const hiddenIssues = compact ? issues.slice(1) : [];

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      aria-label="Detected payment issues"
    >
      {visibleIssues.map((issue) => {
        const configuration = issueConfiguration[issue];

        return (
          <Badge
            key={issue}
            tone={configuration.tone}
            shape="rounded"
            size="compact"
            title={configuration.description}
            className={issueBadgeClassName(configuration.tone)}
          >
            {configuration.label}
          </Badge>
        );
      })}
      {hiddenIssues.length > 0 ? (
        <span
          className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-muted-foreground"
          title={hiddenIssues
            .map((issue) => issueConfiguration[issue].label)
            .join(", ")}
        >
          +{hiddenIssues.length} more
        </span>
      ) : null}
    </div>
  );
}

export {
  PaymentIssueBadges,
  issueConfiguration,
  type PaymentIssueBadgesProps,
};
