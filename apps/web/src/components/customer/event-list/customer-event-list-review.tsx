"use client";

import {ArrowLeft, Trash2} from "lucide-react";
import Link from "next/link";
import {useState, type Dispatch, type FormEvent, type SetStateAction} from "react";

import {PriceDisplay} from "@/components/shared/price-display";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
  customerEventListItemKey,
  readCustomerEventListSchedule,
  removeCustomerEventListItem,
  useCustomerEventList,
  useCustomerEventListSchedule,
  writeCustomerEventListSchedule,
  type CustomerEventListItem,
  type CustomerEventListSchedule,
} from "@/lib/customer/event-list/customer-event-list";
import {menuServingGuestLabel} from "@/lib/provider/provider-menu";

const EVENT_TYPES = [
  "birthday",
  "wedding",
  "debut",
  "corporate",
  "anniversary",
  "other",
] as const;

export function CustomerEventListReview() {
  const {items} = useCustomerEventList();
  const schedule = useCustomerEventListSchedule();
  const scheduleKey = JSON.stringify(schedule);
  const [draft, setDraft] = useState<ScheduleDraft>(emptySchedule);
  const [loadedScheduleKey, setLoadedScheduleKey] = useState(scheduleKey);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  if (loadedScheduleKey !== scheduleKey) {
    setLoadedScheduleKey(scheduleKey);
    setDraft(schedule ? scheduleToDraft(schedule) : emptySchedule);
  }

  function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draftToSchedule(draft);
    if (!next) {
      setScheduleSaved(false);
      setScheduleError("Enter a valid event date and start time before saving this planning context.");
      return;
    }
    writeCustomerEventListSchedule(next);
    if (!readCustomerEventListSchedule()) {
      setScheduleSaved(false);
      setScheduleError("Enter a valid event date and start time before saving this planning context.");
      return;
    }
    setScheduleError(null);
    setScheduleSaved(true);
  }

  return (
    <article className="grid min-w-0 gap-5">
      <Link
        href="/customer/packages"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-1 text-sm font-bold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to packages
      </Link>

      <header className="rounded-[24px] border border-feasta-border-soft bg-white p-5 sm:p-7">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Planning list
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">Review Event List</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-feasta-text-secondary">
          These selections are saved in this browser so you can compare them.
          Displayed prices are snapshots from when each item was added. They are not a booking quote,
          payment amount, or provider acceptance. Submitting a booking from this list is not available yet.
          Opening a package loads its current service levels and visual styles. This saved snapshot does not choose them.
        </p>
      </header>

      {items.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-feasta-border-strong bg-white p-6 text-center">
          <h2 className="text-xl font-extrabold">Your Event List is empty.</h2>
          <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
            Add a package from the marketplace, then return here to review the planning list.
          </p>
          <Link
            href="/customer/packages"
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Browse packages
          </Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="event-list-schedule" className="rounded-[24px] border border-feasta-border-soft bg-white p-5 sm:p-6">
            <h2 id="event-list-schedule" className="text-xl font-extrabold">Event context</h2>
            <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
              Optional planning details for this list. Saving them does not reserve a provider.
            </p>
            <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={saveSchedule}>
              <label className="grid gap-2 text-sm font-semibold">
                Event date
                <Input type="date" value={draft.eventDate} onChange={(event) => updateDraft(setDraft, "eventDate", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Event type
                <select
                  value={draft.eventType}
                  onChange={(event) => updateDraft(setDraft, "eventType", event.target.value)}
                  className="min-h-12 rounded-lg border border-input bg-card px-3 text-sm"
                >
                  <option value="">Not set</option>
                  {EVENT_TYPES.map((eventType) => (
                    <option key={eventType} value={eventType}>{eventType}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Start time
                <Input type="time" value={draft.eventTime} onChange={(event) => updateDraft(setDraft, "eventTime", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                End time
                <Input type="time" value={draft.eventEndTime} onChange={(event) => updateDraft(setDraft, "eventEndTime", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Guest count
                <Input inputMode="numeric" value={draft.guestCount} onChange={(event) => updateDraft(setDraft, "guestCount", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Location label
                <Input value={draft.eventLocation} maxLength={180} onChange={(event) => updateDraft(setDraft, "eventLocation", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
                Address
                <Input value={draft.eventAddress} maxLength={500} onChange={(event) => updateDraft(setDraft, "eventAddress", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
                Notes
                <Textarea rows={3} maxLength={1000} value={draft.specialRequest} onChange={(event) => updateDraft(setDraft, "specialRequest", event.target.value)} />
              </label>
              {scheduleError ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{scheduleError}</p> : null}
              {scheduleSaved ? <p role="status" className="text-sm text-feasta-text-secondary sm:col-span-2">Planning context saved in this browser.</p> : null}
              <div className="sm:col-span-2">
                <Button type="submit">Save event context</Button>
              </div>
            </form>
          </section>

          <section aria-labelledby="event-list-items" className="grid gap-4">
            <h2 id="event-list-items" className="text-xl font-extrabold">Planned selections</h2>
            <ul className="grid gap-4">
              {items.map((item) => (
                <ReviewItem
                  key={customerEventListItemKey(item)}
                  item={item}
                  onRemove={() => removeCustomerEventListItem(customerEventListItemKey(item))}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </article>
  );
}

function ReviewItem({
  item,
  onRemove,
}: {
  item: CustomerEventListItem;
  onRemove: () => void;
}) {
  const title = item.type === "custom_menu" ? item.menuItemName : item.packageName;
  const href = item.type === "custom_menu" ? item.providerHref : item.packageHref;

  return (
    <li className="rounded-[20px] border border-feasta-border-soft bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-extrabold">{title}</h3>
          <p className="mt-1 text-sm text-feasta-text-secondary">{item.providerName}</p>
          {item.type === "custom_menu" ? (
            <p className="mt-2 text-sm text-feasta-text-secondary">
              {item.servingOptionName} · {menuServingGuestLabel(item.servingMinimumGuests, item.servingMaximumGuests)}
            </p>
          ) : null}
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-feasta-text-tertiary">
            Displayed price
          </p>
          <PriceDisplay amount={item.price} className="mt-1" />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-feasta-border-strong px-4 text-sm font-bold outline-none hover:bg-feasta-surface-soft focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Remove
        </button>
      </div>
      <Link
        href={href}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {item.type === "custom_menu" ? "View provider" : "View package"}
      </Link>
    </li>
  );
}

type ScheduleDraft = {
  eventDate: string;
  eventTime: string;
  eventEndTime: string;
  eventType: string;
  guestCount: string;
  eventLocation: string;
  eventAddress: string;
  specialRequest: string;
};

const emptySchedule: ScheduleDraft = {
  eventDate: "",
  eventTime: "",
  eventEndTime: "",
  eventType: "",
  guestCount: "",
  eventLocation: "",
  eventAddress: "",
  specialRequest: "",
};

function scheduleToDraft(schedule: CustomerEventListSchedule): ScheduleDraft {
  return {
    eventDate: schedule.eventDate,
    eventTime: schedule.eventTime,
    eventEndTime: schedule.eventEndTime ?? "",
    eventType: schedule.eventType ?? "",
    guestCount: schedule.guestCount ? String(schedule.guestCount) : "",
    eventLocation: schedule.eventLocation ?? "",
    eventAddress: schedule.eventAddress ?? "",
    specialRequest: schedule.specialRequest ?? "",
  };
}

function draftToSchedule(draft: ScheduleDraft): CustomerEventListSchedule | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.eventDate) || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(draft.eventTime)) {
    return null;
  }
  if (draft.eventEndTime && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(draft.eventEndTime)) return null;

  const guestCount = draft.guestCount.trim();
  const parsedGuests = Number(guestCount);
  if (
    guestCount &&
    (!Number.isSafeInteger(parsedGuests) || parsedGuests < 1 || parsedGuests > 10_000)
  ) {
    return null;
  }

  return {
    eventDate: draft.eventDate,
    eventTime: draft.eventTime,
    ...(draft.eventEndTime ? {eventEndTime: draft.eventEndTime} : {}),
    ...(EVENT_TYPES.includes(draft.eventType as (typeof EVENT_TYPES)[number])
      ? {eventType: draft.eventType as CustomerEventListSchedule["eventType"]}
      : {}),
    ...(guestCount ? {guestCount: parsedGuests} : {}),
    ...(draft.eventLocation.trim() ? {eventLocation: draft.eventLocation} : {}),
    ...(draft.eventAddress.trim() ? {eventAddress: draft.eventAddress} : {}),
    ...(draft.specialRequest.trim() ? {specialRequest: draft.specialRequest} : {}),
  };
}

function updateDraft(
  setDraft: Dispatch<SetStateAction<ScheduleDraft>>,
  field: keyof ScheduleDraft,
  value: string,
) {
  setDraft((current) => ({...current, [field]: value}));
}
