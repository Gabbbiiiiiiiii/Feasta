import {Clock3} from "lucide-react";

import {formatBookingDateTime} from "@/components/customer/bookings/booking-formatters";
import type {CustomerBookingTimeline as CustomerBookingTimelineModel} from "@/lib/customer/bookings/customer-booking-types";

type CustomerBookingTimelineProps = {
  timeline: CustomerBookingTimelineModel;
};

function CustomerBookingTimeline({timeline}: CustomerBookingTimelineProps) {
  return (
    <section
      aria-labelledby="customer-booking-timeline-heading"
      className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-tint text-primary">
          <Clock3 aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 id="customer-booking-timeline-heading" className="text-xl font-black">
            Booking timeline
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            A chronological record of booking, provider, and payment updates.
          </p>
        </div>
      </div>

      {timeline.truncated ? (
        <p className="mt-4 rounded-card border border-info/20 bg-info-subtle p-3 text-sm text-info" role="status">
          Showing the latest 100 timeline updates.
        </p>
      ) : null}

      {timeline.entries.length > 0 ? (
        <ol className="relative mt-6 grid gap-5 border-l border-border pl-6">
          {timeline.entries.map((entry) => (
            <li key={entry.id} className="relative min-w-0">
              <span
                aria-hidden="true"
                className="absolute -left-[1.78rem] top-1.5 size-3 rounded-full border-2 border-card bg-primary"
              />
              <h3 className="break-words font-bold">{entry.title}</h3>
              {entry.description ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                  {entry.description}
                </p>
              ) : null}
              {entry.providerName ? (
                <p className="mt-2 text-xs font-semibold text-foreground">
                  {entry.providerName}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                <time dateTime={entry.createdAt}>
                  {formatBookingDateTime(entry.createdAt)}
                </time>
                {entry.actorRole ? ` · ${actorLabel(entry.actorRole)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 rounded-card border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          No timeline activity is available yet.
        </p>
      )}
    </section>
  );
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
