import {
  CheckCircle2,
  Clock3,
  CreditCard,
  Sparkles,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";
import type {ReactNode} from "react";

import {formatBookingDateTime} from "@/components/customer/bookings/booking-formatters";
import type {
  CustomerBookingTimeline as CustomerBookingTimelineModel,
  CustomerBookingTimelineEntry,
} from "@/lib/customer/bookings/customer-booking-types";

type CustomerBookingTimelineProps = {
  timeline: CustomerBookingTimelineModel;
};

function CustomerBookingTimeline({timeline}: CustomerBookingTimelineProps) {
  return (
    <section
      aria-labelledby="customer-booking-timeline-heading"
      className="rounded-card border border-border bg-card p-4 shadow-none sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary">
          <Clock3 aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id="customer-booking-timeline-heading" className="text-lg font-black tracking-tight sm:text-xl">
            Booking timeline
          </h2>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
            A chronological record of booking, provider, and payment updates.
          </p>
        </div>
      </div>

      {timeline.truncated ? (
        <p className="mt-4 rounded-xl border border-info/20 bg-info-subtle p-3 text-sm text-info" role="status">
          Showing the latest 100 timeline updates.
        </p>
      ) : null}

      {timeline.entries.length > 0 ? (
        <ol className="mt-5 grid" aria-label="Booking activity">
          {timeline.entries.map((entry) => (
            <li
              key={entry.id}
              className="group relative grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0"
            >
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-[0.9375rem] top-8 w-px bg-border group-last:hidden"
              />
              <span
                aria-hidden="true"
                className={`relative z-10 grid size-8 place-items-center rounded-full border [&_svg]:size-3.5 ${timelineIconClassName(entry)}`}
              >
                {timelineIcon(entry)}
              </span>
              <div className="min-w-0 pt-0.5">
                <h3 className="break-words text-sm font-bold leading-5">{entry.title}</h3>
                {entry.description ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {entry.description}
                  </p>
                ) : null}
                {entry.providerName ? (
                  <p className="mt-1.5 break-words text-xs font-semibold text-foreground">
                    Provider: {entry.providerName}
                  </p>
                ) : null}
                <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1 text-xs leading-5 text-muted-foreground">
                  <time className="break-words" dateTime={entry.createdAt}>
                    {formatBookingDateTime(entry.createdAt)}
                  </time>
                  {entry.actorRole ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{actorLabel(entry.actorRole)}</span>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          No timeline activity is available yet.
        </p>
      )}
    </section>
  );
}

function timelineIcon(entry: CustomerBookingTimelineEntry): ReactNode {
  if (entry.type === "provider_accepted") return <CheckCircle2 />;
  if (entry.type === "provider_rejected") return <XCircle />;
  if (entry.type?.startsWith("payment_")) return <CreditCard />;

  switch (entry.actorRole) {
    case "customer":
      return <UserRound />;
    case "provider":
      return <UsersRound />;
    case "system":
      return <Sparkles />;
    default:
      return <Clock3 />;
  }
}

function timelineIconClassName(entry: CustomerBookingTimelineEntry): string {
  if (entry.type === "provider_accepted") {
    return "border-success/20 bg-success-subtle text-success";
  }
  if (entry.type === "provider_rejected") {
    return "border-destructive/20 bg-destructive-subtle text-destructive";
  }
  if (entry.type?.startsWith("payment_")) {
    return "border-info/20 bg-info-subtle text-info";
  }

  switch (entry.actorRole) {
    case "provider":
      return "border-warning/25 bg-warning-subtle text-warning";
    case "system":
      return "border-info/20 bg-info-subtle text-info";
    case "customer":
    default:
      return "border-primary/15 bg-primary-tint text-primary";
  }
}

function actorLabel(role: "customer" | "provider" | "system"): string {
  switch (role) {
    case "customer":
      return "Customer update";
    case "provider":
      return "Provider update";
    case "system":
      return "FEASTA update";
  }
}

export {CustomerBookingTimeline, type CustomerBookingTimelineProps};
