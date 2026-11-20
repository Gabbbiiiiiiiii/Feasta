"use client";

import {Clock3, MapPin, UserRound} from "lucide-react";
import {useLayoutEffect, useRef} from "react";
import {createPortal} from "react-dom";

import {formatEventTime} from "@/lib/presentation/event-time";
import type {ProviderCalendarEvent} from "@/lib/provider/calendar/provider-calendar-types";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function eventTitle(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (char) => char.toUpperCase());
}

export function ProviderCalendarHoverPreview({
  anchor,
  date,
  events,
}: {
  anchor: HTMLButtonElement;
  date: string;
  events: ProviderCalendarEvent[];
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const reposition = () => {
      const popup = popupRef.current;
      if (!popup || !anchor.isConnected) {
        if (popup) popup.style.visibility = "hidden";
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (rect.bottom < 0 || rect.top > viewportHeight ||
          rect.right < 0 || rect.left > viewportWidth) {
        popup.style.visibility = "hidden";
        return;
      }

      const popupRect = popup.getBoundingClientRect();
      const width = popupRect.width || Math.min(320, viewportWidth - 24);
      const height = popupRect.height || 240;
      const margin = 12;
      const gap = 13;
      const center = rect.left + rect.width / 2;
      const left = clamp(center - width / 2, margin, viewportWidth - margin - width);
      const spaceAbove = rect.top - margin;
      const spaceBelow = viewportHeight - rect.bottom - margin;
      const above = spaceAbove >= height + gap ||
        (spaceBelow < height + gap && spaceAbove > spaceBelow);
      const top = above
        ? clamp(rect.top - gap - height, margin, viewportHeight - margin - height)
        : clamp(rect.bottom + gap, margin, viewportHeight - margin - height);

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.visibility = "visible";
      if (pointerRef.current) {
        const pointer = pointerRef.current;
        pointer.style.left = `${clamp(center - left, 20, width - 20) - 6}px`;
        pointer.style.top = above ? "" : "-6px";
        pointer.style.bottom = above ? "-6px" : "";
        pointer.style.borderWidth = above ? "0 1px 1px 0" : "1px 0 0 1px";
      }
    };

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchor, date, events]);

  if (events.length === 0) return null;

  return createPortal(
    <div
      id="provider-calendar-hover-preview"
      role="tooltip"
      ref={popupRef}
      className="pointer-events-none fixed z-[100] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-card text-foreground shadow-xl"
      style={{top: 0, left: 0, visibility: "hidden"}}
    >
      <span ref={pointerRef} aria-hidden="true"
        className="absolute size-3 rotate-45 border-border bg-card" />
      <div className="max-h-[min(72vh,440px)] overflow-y-auto p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-primary-strong">
        {date} · Quick event preview
      </p>
      <div className="grid gap-3">
        {events.map((event) => {
          const venue = [event.event.venueAddress, event.event.city]
            .filter(Boolean).join(", ") || "Venue not provided";
          const start = formatEventTime(event.event.eventTime) || "Start not provided";
          const end = formatEventTime(event.event.eventEndTime) || "End not provided";
          return (
            <div key={event.id} className="grid gap-2 border-t border-border/70 pt-2 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-bold">{eventTitle(event.event.eventType)}</p>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-primary-strong">
                  {event.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <UserRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="break-words">{event.customer.name}</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Clock3 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="break-words">{start} – {end}</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="break-words">{venue}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t border-border pt-2 text-center text-[11px] text-muted-foreground">
        Select the date to see full details
      </p>
      </div>
    </div>,
    document.body,
  );
}
