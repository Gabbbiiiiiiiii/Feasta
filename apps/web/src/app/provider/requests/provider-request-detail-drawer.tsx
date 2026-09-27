"use client";

import {
  CalendarDays,
  Clock3,
  MapPin,
  PackageOpen,
  Phone,
  Mail,
  Users,
} from "lucide-react";

import {
  DetailDrawer,
} from "@/components/data";
import {
  Button,
} from "@/components/ui/button";
import {
  PriceDisplay,
} from "@/components/shared/price-display";
import {
  StatusBadge,
} from "@/components/shared/status-badge";

import type {
  ProviderRequestListItem,
} from "@/lib/provider/requests/provider-request-types";

type ProviderRequestDetailDrawerProps = {
  request:
    ProviderRequestListItem | null;

  open: boolean;

  onOpenChange:
    (open: boolean) => void;

  onAccept?: () => void;

  onReject?: () => void;

  actionPending?: boolean;
};

export function ProviderRequestDetailDrawer({
  request,
  open,
  onOpenChange,
  onAccept,
  onReject,
  actionPending = false,
}: ProviderRequestDetailDrawerProps) {
  if (!request) {
    return null;
  }

  return (
    <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Request details"
        description={
            "Review the customer's event requirements before responding."
        }
        footer={
            request.status === "pending" ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                type="button"
                variant="secondary"
                disabled={actionPending}
                onClick={onReject}
                >
                Reject request
                </Button>

                <Button
                type="button"
                disabled={actionPending}
                onClick={onAccept}
                >
                Accept request
                </Button>
            </div>
            ) : null
        }
        >
      <div className="grid gap-6">
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Booking
              </p>

              <p className="font-semibold">
                {formatBookingCode(
                  request.mainEventId,
                )}
              </p>

              <p className="mt-1 break-all text-xs text-muted-foreground">
                Request ID: {request.id}
              </p>
            </div>

            <StatusBadge
              status={request.status}
            />
          </div>
        </section>

        <Section
          title="Customer"
        >
          <DetailRow
            icon={
              <Users className="size-4" />
            }
            label="Customer"
            value={request.customer.name}
          />

          <DetailRow
            icon={
              <Mail className="size-4" />
            }
            label="Email"
            value={
              request.customer.email ??
              "Not provided"
            }
          />

          <DetailRow
            icon={
              <Phone className="size-4" />
            }
            label="Mobile number"
            value={
              request.customer.phoneNumber ??
              "Not provided"
            }
          />
        </Section>

        <Section
          title="Event details"
        >
          <DetailRow
            icon={
              <CalendarDays className="size-4" />
            }
            label="Event"
            value={
              formatLabel(
                request.event.eventType,
              )
            }
          />

          <DetailRow
            icon={
              <CalendarDays className="size-4" />
            }
            label="Event date"
            value={
              formatDate(
                request.event.eventDate,
              )
            }
          />

          <DetailRow
            icon={
              <Clock3 className="size-4" />
            }
            label="Event time"
            value={
              formatEventTimeRange(
                request.event.eventTime,
                request.event.eventEndTime,
              )
            }
          />

          <DetailRow
            icon={
              <Users className="size-4" />
            }
            label="Guests"
            value={
              request.event.guestCount !==
              null
                ? request.event.guestCount
                    .toLocaleString("en-PH")
                : "Not provided"
            }
          />

          <DetailRow
            icon={
              <MapPin className="size-4" />
            }
            label="Venue"
            value={
              formatVenue(request)
            }
          />
        </Section>

        <Section
          title={
            request.type === "catering"
              ? "Package"
              : "Event services"
          }
        >
          {request.package ? (
            <DetailRow
              icon={
                <PackageOpen className="size-4" />
              }
              label="Package"
              value={
                request.package.name ??
                "Selected package"
              }
            />
          ) : null}

          {request.services.length >
          0 ? (
            <div className="grid gap-2">
              {request.services.map(
                (service) => (
                  <div
                    key={service.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {service.name}
                        </p>

                        <p className="text-sm text-muted-foreground">
                          {service.quantity}
                          {" × "}
                          <PriceDisplay
                            amount={
                              service.unitPrice
                            }
                          />
                        </p>
                      </div>

                      <PriceDisplay
                        amount={
                          service.totalPrice
                        }
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : request.package ? null : (
            <p className="text-sm text-muted-foreground">
              No individual service
              selections were recorded.
            </p>
          )}
        </Section>

        <Section
          title="Payment terms"
        >
          <div className="grid gap-3 rounded-lg border border-border p-4">
            <AmountRow
              label="Request total"
              amount={request.amount}
            />

            <AmountRow
              label="Required payment"
              amount={
                request.downPaymentAmount
              }
            />

            {request.downPaymentPercentage !==
            null ? (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">
                  Payment rate
                </span>

                <span className="font-medium">
                  {
                    request.downPaymentPercentage
                  }
                  %
                </span>
              </div>
            ) : null}
          </div>
        </Section>

        {request.event.notes ? (
          <Section
            title="Customer notes"
          >
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6">
              {request.event.notes}
            </p>
          </Section>
        ) : null}

        {request.rejectionReason ? (
          <Section
            title="Rejection reason"
          >
            <p className="whitespace-pre-wrap rounded-lg border border-border p-4 text-sm leading-6">
              {request.rejectionReason}
            </p>
          </Section>
        ) : null}

        <Section
          title="Request history"
        >
          <DetailRow
            label="Submitted"
            value={
              formatDateTime(
                request.createdAt,
              )
            }
          />

          <DetailRow
            label="Last updated"
            value={
              formatDateTime(
                request.updatedAt,
              )
            }
          />

          {request.respondedAt ? (
            <DetailRow
              label="Provider response"
              value={
                formatDateTime(
                  request.respondedAt,
                )
              }
            />
          ) : null}
        </Section>
      </div>
    </DetailDrawer>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>

      {children}
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      {icon ? (
        <span className="mt-0.5 text-muted-foreground">
          {icon}
        </span>
      ) : null}

      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>

        <p className="mt-1 break-words text-sm font-medium">
          {value}
        </p>
      </div>
    </div>
  );
}

function AmountRow({
  label,
  amount,
}: {
  label: string;
  amount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">
        {label}
      </span>

      <span className="font-semibold">
        <PriceDisplay
          amount={amount}
        />
      </span>
    </div>
  );
}

function formatVenue(
  request: ProviderRequestListItem,
): string {
  const parts = [
    request.event.venueAddress,
    request.event.city,
  ]
    .flatMap((value) =>
      value
        ? value
            .split(",")
            .map((part) =>
              part.trim(),
            )
            .filter(Boolean)
        : [],
    );

  const uniqueParts: string[] = [];
  const seen =
    new Set<string>();

  for (const part of parts) {
    const normalized =
      part.toLowerCase();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    uniqueParts.push(part);
  }

  return (
    uniqueParts.join(", ") ||
    "Not provided"
  );
}

function formatBookingCode(
  mainEventId: string,
): string {
  const normalized =
    mainEventId.trim();

  if (
    /^[A-Za-z0-9_-]{10,160}$/u.test(
      normalized,
    )
  ) {
    return `BK-${normalized
      .slice(0, 10)
      .toUpperCase()}`;
  }

  return "Booking";
}


function formatEventTimeRange(
  start: string | null,
  end: string | null,
): string {
  const startLabel =
    formatClockTime(start);

  const endLabel =
    formatClockTime(end);

  if (
    startLabel &&
    endLabel
  ) {
    return `${startLabel} – ${endLabel}`;
  }

  return (
    startLabel ??
    endLabel ??
    "Not provided"
  );
}


function formatClockTime(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    value.trim();

  const match =
    /^([01]?\d|2[0-3]):([0-5]\d)$/u.exec(
      normalized,
    );

  if (!match) {
    return normalized || null;
  }

  const hour =
    Number(match[1]);

  const minute =
    match[2];

  const suffix =
    hour >= 12
      ? "PM"
      : "AM";

  const hour12 =
    hour % 12 || 12;

  return `${hour12}:${minute} ${suffix}`;
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Not provided";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Not provided";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "long",
      timeZone: "Asia/Manila",
    },
  ).format(date);
}

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return "Not available";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    },
  ).format(date);
}