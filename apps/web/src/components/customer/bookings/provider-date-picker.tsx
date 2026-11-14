"use client";

import {CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, X} from "lucide-react";
import {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {inputStyles} from "@/components/ui/input";
import {cn} from "@/lib/utils";
import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {formatPhilippineDate} from "@/lib/dates/philippine-date";
import {getCustomerProviderCalendarAvailability, type ProviderCalendarMonth} from "@/lib/customer/bookings/customer-provider-availability-client";

const labels = {booked: "Booked", on_hold: "On hold", unavailable: "Unavailable"};
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
}
function tomorrowKey() {
  const date = new Date(todayKey() + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function visibleMonth(value: string) {
  const current = todayKey().slice(0, 7);
  const requested = value.slice(0, 7) || current;
  return requested < current || requested > shiftMonth(current, 24) ? current : requested;
}
function shiftMonth(month: string, offset: number) {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + offset, 1)).toISOString().slice(0, 7);
}
export type ProviderCalendarCache = Map<string, {promise: Promise<ProviderCalendarMonth>; expires: number}>;
type Props = {providerId: string; value: string; onChange: (value: string) => void; planningOnly: boolean; invalid?: boolean; revision: string | number; sessionCache?: ProviderCalendarCache; onAvailability?: (date: string, blocked: boolean) => void};

export function ProviderDatePicker(props: Props) {
  // Remount on provider changes to isolate each booking session's cache.
  return props.planningOnly ? <PhilippineDateInput aria-label="Event date" value={props.value} min={tomorrowKey()} onChange={(event) => props.onChange(event.target.value)} /> :
    <CalendarPicker key={props.providerId} {...props} />;
}
function CalendarPicker({providerId, value, onChange, invalid, revision, onAvailability, sessionCache}: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(visibleMonth(value));
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{key: string; data?: ProviderCalendarMonth; error?: string} | null>(null);
  const cache = useRef(sessionCache ?? new Map<string, {promise: Promise<ProviderCalendarMonth>; expires: number}>());
  const warningId = useId();
  const dialogId = useId();
  const descriptionId = useId();
  const [focusedDate, setFocusedDate] = useState("");
  const pendingFocus = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const currentMonth = todayKey().slice(0, 7);
  const key = `${providerId}/${month}/${revision}/${attempt}`;
  useEffect(() => {
    if (!open) return;
    let current = true;
    const cacheKey = `${providerId}/${month}/${revision}`;
    let entry = cache.current.get(cacheKey);
    if (!entry || entry.expires <= Date.now()) {
      entry = {promise: getCustomerProviderCalendarAvailability(providerId, month), expires: Date.now() + 60_000};
      cache.current.set(cacheKey, entry);
    }
    void entry.promise.then((data) => {
      if (current) {
        setResult({key, data});
        if (data.month === value.slice(0, 7)) {
          onAvailability?.(value, data.dates.some((item) => item.date === value) || Boolean(value) && value < tomorrowKey());
        }
      }
    }).catch(() => {
      cache.current.delete(cacheKey);
      if (current) setResult({key, error: "Calendar availability could not be loaded. Try again."});
    });
    return () => { current = false; };
  }, [open, month, providerId, key, revision, attempt, value, onAvailability]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setAttempt((n) => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [open]);
  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const offset = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  // The portal avoids clipping by cards and other overflow containers.
  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const anchor = trigger.current?.getBoundingClientRect();
      const popup = panel.current;
      if (!anchor || !popup) return;
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const gutter = 12;
      const popupWidth = Math.min(352, width - gutter * 2);
      popup.style.width = popupWidth + "px";
      popup.style.maxHeight = Math.max(0, height - gutter * 2) + "px";
      const popupHeight = popup.getBoundingClientRect().height;
      const below = topEdge + height - anchor.bottom - 8;
      const above = anchor.top - topEdge - 8;
      const preferredTop = below < popupHeight && above > below
        ? anchor.top - popupHeight - 8 : anchor.bottom + 8;
      popup.style.left = Math.max(leftEdge + gutter, Math.min(anchor.left, leftEdge + width - popupWidth - gutter)) + "px";
      popup.style.top = Math.max(topEdge + gutter, Math.min(preferredTop, topEdge + height - popupHeight - gutter)) + "px";
    }
    position();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(position) : null;
    if (panel.current) observer?.observe(panel.current);
    if (trigger.current) observer?.observe(trigger.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function outside(event: Event) {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const date = pendingFocus.current ?? (value.startsWith(month) ? value : month + "-01");
    panel.current?.querySelector<HTMLButtonElement>('[data-date="' + date + '"]')?.focus();
    pendingFocus.current = null;
  }, [open, month, value]);

  const selectedState = data?.dates.find((item) => item.date === value)?.state;
  const minimumDate = tomorrowKey();
  function dateStatus(date: string) {
    if (date < todayKey()) return "Past date";
    if (date < minimumDate) return "Unavailable";
    const state = data?.dates.find((item) => item.date === date)?.state;
    return state ? labels[state] : data ? "Available" : "Availability unknown";
  }
  function close() { setOpen(false); trigger.current?.focus(); }
  const navigationClass = "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35";
  const indicatorClass = (status: string) => cn(
    "inline-block size-1.5 shrink-0 rounded-full",
    status === "Available" && "border border-primary bg-secondary",
    status === "Booked" && "bg-destructive",
    status === "On hold" && "bg-amber-500",
    status === "Unavailable" && "bg-muted-foreground",
    status === "Availability unknown" && "border border-dashed border-muted-foreground",
  );
  return <div className="relative min-w-0" data-invalid={invalid || undefined}>
    <button ref={trigger} type="button" aria-label={`Event date${value ? `: ${formatPhilippineDate(value)}` : ""}`}
      aria-expanded={open} aria-controls={open ? dialogId : undefined}
      aria-describedby={selectedState ? warningId : undefined} aria-haspopup="dialog"
      className={cn(inputStyles, "items-center justify-between gap-3 text-left font-normal", (invalid || selectedState) && "border-destructive")}
      onClick={() => {setMonth(visibleMonth(value)); setAttempt((n) => n + 1); setOpen(!open);}}>
      <span className={cn("min-w-0 truncate", !value && "text-placeholder")}>{value ? formatPhilippineDate(value) : "Select event date"}</span>
      <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-primary" />
    </button>
    {open ? createPortal(
      <div ref={panel} id={dialogId} role="dialog" aria-label="Choose event date" aria-describedby={descriptionId}
        className="fixed z-[80] overflow-y-auto overscroll-contain rounded-2xl border border-feasta-border-soft bg-card p-3 text-card-foreground shadow-xl sm:p-4"
        style={{width: "min(352px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 24px)"}}
        onKeyDown={(event) => {
          const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button[data-day]") ?? []);
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          const delta = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7}[event.key];
          let destination = index + (delta ?? 0);
          if (event.key === "Home") destination = Math.max(0, index - ((offset + index) % 7));
          else if (event.key === "End") destination = Math.min(days - 1, index + 6 - ((offset + index) % 7));
          else if (!delta) return;
          event.preventDefault();
          if (destination >= 0 && destination < days) buttons[destination]?.focus();
          else {
            const next = shiftMonth(month, destination < 0 ? -1 : 1);
            if (next < currentMonth || next > shiftMonth(currentMonth, 24)) return;
            const nextDays = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5)), 0)).getUTCDate();
            const day = destination < 0 ? nextDays + destination + 1 : destination - days + 1;
            pendingFocus.current = next + "-" + String(day).padStart(2, "0");
            setMonth(next);
          }
        }}>
        <div className="mb-2 flex items-center gap-2">
          <button type="button" className={navigationClass} aria-label="Previous month" disabled={month <= currentMonth} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-sm font-bold" aria-live="polite">
            {new Intl.DateTimeFormat("en-PH", {month: "long", year: "numeric", timeZone: "UTC"}).format(new Date(month + "-01T00:00:00Z"))}
          </span>
          <button type="button" className={navigationClass} aria-label="Next month" disabled={month >= shiftMonth(currentMonth, 24)} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
          <button type="button" aria-label="Close calendar" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={close}>
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex min-h-8 items-center text-xs">
          {!data && !error ? <p role="status" className="flex items-center gap-2 text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />Loading availability...</p> : null}
          {error ? <div role="alert" className="flex w-full items-center justify-between gap-2 text-destructive">
            <span>Couldn&apos;t load dates.</span>
            <button type="button" aria-label="Retry calendar" className="shrink-0 rounded px-2 py-1 font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => {cache.current.delete(`${providerId}/${month}/${revision}`); setAttempt((n) => n + 1);}}>Retry</button>
          </div> : null}
        </div>
        <div className="grid grid-cols-7 gap-1" aria-label="Calendar days">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="pb-1 text-center text-[11px] font-semibold text-muted-foreground">{day}</span>)}
          {Array.from({length: offset}, (_, i) => <span key={`empty-${i}`} />)}
          {Array.from({length: days}, (_, i) => {
            const date = month + "-" + String(i + 1).padStart(2, "0");
            const label = dateStatus(date);
            const disabled = label !== "Available";
            const past = date < todayKey();
            return <button key={date} data-day data-date={date} type="button" aria-disabled={disabled} aria-pressed={value === date}
              tabIndex={date === (focusedDate.startsWith(month) ? focusedDate : value.startsWith(month) ? value : month + "-01") ? 0 : -1}
              aria-label={formatPhilippineDate(date) + ", " + label}
              className={cn("flex h-10 min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:h-11",
                disabled ? "cursor-not-allowed text-muted-foreground" : "text-primary-strong hover:bg-secondary",
                past && "opacity-40", value === date && "bg-secondary ring-1 ring-primary")}
              onFocus={() => setFocusedDate(date)}
              onClick={() => {if (!disabled) {onChange(date); close();}}}>
              <span>{i + 1}</span>
              <span aria-hidden="true" className={past ? "size-1.5" : indicatorClass(label)} />
            </button>;
          })}
        </div>
        <p className="mt-2 truncate text-center text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
          {focusedDate.startsWith(month) ? formatPhilippineDate(focusedDate) + ": " + dateStatus(focusedDate) : "Choose an available date"}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-feasta-border-soft pt-3" aria-label="Date availability legend">
          {["Available", "Booked", "On hold", "Unavailable"].map((label) => <span key={label} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] text-muted-foreground">
            <span aria-hidden="true" className={indicatorClass(label)} />{label}
          </span>)}
        </div>
        <p id={descriptionId} className="sr-only">Use arrow keys to browse dates, Home or End to move within a week, and Escape to close. Only available dates can be selected. Availability is checked again before booking.</p>
      </div>, document.body,
    ) : null}
    {selectedState ? <p id={warningId} role="alert" className="mt-2 text-sm text-destructive">This date is {labels[selectedState].toLowerCase()}. Choose another available date.</p> : null}
  </div>;
}
