import "server-only";

import {cache} from "react";
import {readFreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";
import {isServiceCategoryCode, providerCapacityCapabilities} from "@feasta/shared-types";
import {FieldValue, Timestamp, type DocumentReference, type Transaction} from "firebase-admin/firestore";
import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {calendarRequestOccupies, dailyEventCapacity} from "@/lib/provider/calendar/provider-calendar-service";
import {CATERING_PACKAGE_SERVICE_TIERS, cateringPackageServiceTierLabel} from "@/lib/catering/catering-service-tier";
import {normalizePackageServiceOptions} from "@/lib/catering/package-offer-configuration";
import {walkInInputError} from "./walk-in-validation";

class WalkInInputError extends Error {}

function field(form: FormData, name: string, limit: number, required = true) {
  const value = form.get(name);
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > limit) {
    throw new WalkInInputError(`Check the ${name} field.`);
  }
  const error = walkInInputError(name, text);
  if (error) throw new WalkInInputError(error);
  return text;
}

function manilaToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseDate(date: string) {
  const timestamp = new Date(`${date}T00:00:00+08:00`);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp.getTime()) ||
      new Date(timestamp.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) !== date) {
    throw new WalkInInputError("Enter a valid date.");
  }
  return timestamp;
}

export const walkInReferencePattern = /^(?:[A-Za-z0-9]{20}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;

function reservationCounts(data: Record<string, unknown>, today: string): Record<string, number> {
  const counts = data.walkInReservedCounts;
  if (counts && typeof counts === "object" && !Array.isArray(counts)) {
    return Object.fromEntries(Object.entries(counts).filter(([date, count]) =>
      /^20\d{2}-\d{2}-\d{2}$/.test(date) && date >= today &&
      Number.isInteger(count) && count > 0 && count <= 100));
  }
  const legacy = Array.isArray(data.walkInReservedDates) ? data.walkInReservedDates : [];
  return Object.fromEntries(legacy.filter((date) => typeof date === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(date) && date >= today).map((date) => [date, 1]));
}

export type WalkInOffer = {
  id: string;
  kind: "packages" | "addons";
  name: string;
  category: string;
  description: string;
  inclusions: string[];
  publishedPriceCentavos: number | null;
  pricingModel: string;
  minimumGuests: number | null;
  maximumGuests: number | null;
  options: {id: string; label: string; priceCentavos: number; inclusions: string[]}[];
  freelanceDetails: ReturnType<typeof readFreelanceServiceDetails>;
};

function offerInclusions(...values: unknown[]): string[] {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : []).flatMap((item) => {
    const label = item && typeof item === "object" ? item.name ?? item.dishName ?? item.label : item;
    return typeof label === "string" && label.trim() ? [label.trim()] : [];
  }))];
}

function toCentavos(value: unknown): number | null {
  return typeof value === "number" && value >= 0 && Number.isSafeInteger(Math.round(value * 100))
    ? Math.round(value * 100) : null;
}

export function publishedWalkInOffer(
  id: string, kind: WalkInOffer["kind"], data: Record<string, unknown>, providerId: string,
): WalkInOffer | null {
  if (data.providerId !== providerId || data.status !== "published" ||
      data.isPublished !== true || data.isActive !== true || data.isDeleted === true ||
      data.deletedAt != null || data.isArchived === true || data.isAvailable === false ||
      (kind === "addons" && data.isAvailable !== true) ||
      typeof data.name !== "string" || !data.name.trim()) return null;

  const pricingModel = kind === "packages" ? data.pricingModel : data.pricingType;
  const pricing = typeof pricingModel === "string" && [
    "per_pax", "per_bundle", "per_guest", "per_hour", "per_unit", "custom_quote",
  ].includes(pricingModel) ? pricingModel : "fixed";
  const tiers = normalizePackageServiceOptions(data.serviceOptions);
  const options = kind === "packages" ? CATERING_PACKAGE_SERVICE_TIERS.flatMap((key) => {
    const tier = tiers?.[key];
    const priceCentavos = toCentavos(tier?.price);
    if (priceCentavos === null) return [];
    return [{id: key, label: cateringPackageServiceTierLabel(key), priceCentavos, inclusions: offerInclusions(
      tier?.includedServices, tier?.decorInclusions, tier?.furnitureInclusions, tier?.equipmentInclusions,
    )}];
  }) : [];
  const category = data.serviceCategoryCode ?? data.category;
  const guestLimit = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
  return {
    id, kind, name: data.name,
    category: typeof category === "string" ? category : "",
    description: typeof data.description === "string" ? data.description : "",
    inclusions: offerInclusions(data.inclusions, data.packageInclusions, data.includedDishes,
      data.serviceInclusions, data.foodInclusions, data.decorInclusions, data.furnitureInclusions, data.equipmentInclusions),
    publishedPriceCentavos: pricing === "custom_quote" ? null : toCentavos(data.price),
    pricingModel: pricing,
    minimumGuests: guestLimit(data.minimumGuests),
    maximumGuests: guestLimit(data.maximumGuests ?? data.guestCapacity),
    options,
    freelanceDetails: readFreelanceServiceDetails(data.freelanceDetails),
  };
}

export async function listWalkInOffers() {
  const provider = await readWalkInProvider();
  const snapshots = await Promise.all((["packages", "addons"] as const).map(async (kind) => ({
    kind,
    rows: await adminDb.collection(kind).where("providerId", "==", provider.id).get(),
  })));
  return snapshots.flatMap(({kind, rows}) => rows.docs.flatMap((doc) => {
    const offer = publishedWalkInOffer(doc.id, kind, doc.data(), provider.id);
    return offer ? [offer] : [];
  })).sort((left, right) => left.name.localeCompare(right.name));
}

async function walkInProvider() {
  const account = await requireApprovedProvider();
  if (!account.providerId) throw new Error("Provider account is missing.");
  return {account, provider: adminDb.collection("providers").doc(account.providerId)};
}

function approvedOwner(data: Record<string, unknown> | undefined, uid: string) {
  if (!data || data.ownerId !== uid || data.verificationStatus !== "approved" ||
      data.isActive !== true || data.isBlocked === true || data.isSuspended === true || data.isDeleted === true) {
    throw new WalkInInputError("Your provider account cannot manage walk-in bookings.");
  }
  return data;
}

export const readWalkInProvider = cache(async () => {
  const {account, provider} = await walkInProvider();
  approvedOwner((await provider.get()).data(), account.uid);
  return provider;
});

async function readProvider(transaction: Transaction, provider: DocumentReference, uid: string) {
  return approvedOwner((await transaction.get(provider)).data(), uid);
}

function bookingDay(eventDateKey: string, today: string) {
  const start = parseDate(eventDateKey);
  const latest = new Date(parseDate(today).getTime() + 731 * 86_400_000);
  if (eventDateKey < today || start > latest) {
    throw new WalkInInputError("Choose an event date within the next two years.");
  }
  return start;
}

async function dailyOccupancy(transaction: Transaction, providerId: string,
  data: Record<string, unknown>, eventDateKey: string, start: Date, today: string) {
  const counts = reservationCounts(data, today);
  const day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    new Date(`${eventDateKey}T00:00:00Z`).getUTCDay()
  ];
  const blocked = (!Array.isArray(data.operatingDays) || !data.operatingDays.includes(day)) ||
    (Array.isArray(data.unavailableDates) && data.unavailableDates.includes(eventDateKey));
  const end = new Date(start.getTime() + 86_400_000);
  const requests = await transaction.get(adminDb.collection("providerRequests")
    .where("providerId", "==", providerId)
    .where("status", "in", ["accepted", "waiting_for_down_payment", "payment_processing", "confirmed", "in_progress", "completed"])
    .where("eventDate", ">=", Timestamp.fromDate(start))
    .where("eventDate", "<", Timestamp.fromDate(end)));
  const online = requests.docs.filter((request) => calendarRequestOccupies(request.data()));
  const occupiedOnline = new Set(online.map((request) => {
    const eventId = request.get("mainEventId");
    return typeof eventId === "string" && eventId ? `event:${eventId}` : `request:${request.id}`;
  })).size;
  const occupiedWalkIn = counts[eventDateKey] ?? 0;
  const capacity = dailyEventCapacity(data);
  const occupied = occupiedOnline + occupiedWalkIn;
  return {counts, occupiedWalkIn, capacity, occupied, blocked,
    remaining: blocked ? 0 : Math.max(0, capacity - occupied)};

}

export async function checkWalkInDay(date: string) {
  const {account, provider} = await walkInProvider();
  try {
    const today = manilaToday();
    const start = bookingDay(date, today);
    return await adminDb.runTransaction(async (transaction) => {
      const data = await readProvider(transaction, provider, account.uid);
      const {capacity, occupied, remaining, blocked} = await dailyOccupancy(transaction, provider.id, data, date, start, today);
      return {date, capacity, occupied, remaining, blocked};
    });
  } catch (error) {
    return {error: error instanceof WalkInInputError ? error.message : "Availability could not be checked. Try again."};
  }
}

export async function mutateWalkIn(form: FormData) {
  const {account, provider} = await walkInProvider();
  const records = provider.collection("walkInBookings");

  function recordAudit(transaction: Transaction, id: string, action: string, before: string | null, after: string) {
    transaction.set(adminDb.collection("adminLogs").doc(), {
      actorId: account.uid,
      actorRole: "provider",
      action,
      targetCollection: "walkInBookings",
      targetId: id,
      reason: null,
      source: "web_server",
      before: before ? {status: before} : null,
      after: {status: after},
      metadata: {providerId: provider.id},
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  try {
    const action = form.get("action");
    if (action === "completed" || action === "cancelled") {
      const id = field(form, "reference", 36);
      const reason = action === "cancelled" ? field(form, "cancellation reason", 500) : null;
      if (!walkInReferencePattern.test(id)) throw new WalkInInputError("Invalid booking reference.");
      await adminDb.runTransaction(async (transaction) => {
        const data = await readProvider(transaction, provider, account.uid);
        const reference = records.doc(id);
        const booking = (await transaction.get(reference)).data();
        if (!booking || booking.status !== "confirmed") {
          throw new WalkInInputError("Only confirmed walk-ins can be updated.");
        }
        if (action === "cancelled") {
          const counts = reservationCounts(data, manilaToday());
          const date = String(booking.eventDateKey);
          if (counts[date] > 1) counts[date]--;
          else delete counts[date];
          transaction.update(provider, {
            walkInReservedCounts: counts,
            walkInReservedDates: FieldValue.delete(),
            availabilityReservationUpdatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (action === "completed") {
          transaction.update(provider, {availabilityReservationUpdatedAt: FieldValue.serverTimestamp()});
        }
        transaction.update(reference, {
          status: action,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: account.uid,
          ...(reason ? {cancellationReason: reason, cancelledBy: account.uid, cancelledAt: FieldValue.serverTimestamp()} : {}),
        });
        recordAudit(transaction, id, `walk_in_${action}`, "confirmed", action);
      });
      return {message: action === "completed" ? "Walk-in completed." : "Walk-in cancelled."};
    }

    if (action !== "create") throw new WalkInInputError("Invalid booking action.");
    const today = manilaToday();
    const eventDateKey = field(form, "event date", 10);
    const start = bookingDay(eventDateKey, today);
    const eventTime = field(form, "start time", 5);
    const eventEndTime = field(form, "end time", 5);
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(eventTime) || !timePattern.test(eventEndTime) || eventTime >= eventEndTime) {
      throw new WalkInInputError("Enter a start and end time on the same day.");
    }
    const agreementDate = field(form, "agreement date", 10);
    const agreementTime = field(form, "agreement time", 5);
    const agreementAt = new Date(`${agreementDate}T${agreementTime}:00+08:00`);
    parseDate(agreementDate);
    if (!timePattern.test(agreementTime) || !Number.isFinite(agreementAt.getTime()) ||
        agreementAt.getTime() > Date.now() || form.get("acknowledgment") !== "on") {
      throw new WalkInInputError("Record the customer's acknowledgment and agreement date.");
    }
    const email = field(form, "email", 254, false);
    const phone = field(form, "contact number", 40);
    const guests = field(form, "number of guests", 6, false);
    const guestCount = guests ? Number(guests) : null;
    const price = field(form, "agreed price", 12, false);
    const selection = field(form, "package", 170, false);
    const offer = /^(packages|addons)\/([A-Za-z0-9_-]{1,160})$/.exec(selection);
    if (selection && selection !== "custom" && !offer) throw new WalkInInputError("Choose one of your published packages or services.");
    const selectionId = offer?.[2];
    const optionId = field(form, "pricing option", 40, false);
    if (optionId && !selectionId) throw new WalkInInputError("Select a package before choosing a pricing option.");
    const serviceName = selectionId ? "" : field(form, "custom service", 160);
    const submissionKey = field(form, "submission key", 36);
    if (!walkInReferencePattern.test(submissionKey)) throw new WalkInInputError("Invalid booking submission.");
    const reference = records.doc(submissionKey);
    const venueName = field(form, "venue name", 160);
    const venueAddress = field(form, "venue address", 300);
    const eventType = field(form, "event type", 100);
    const booking = {
      providerId: provider.id,
      bookingReference: reference.id,
      source: "walk_in",
      status: "confirmed",
      recordedBy: account.uid,
      customerName: field(form, "full name", 160),
      phone,
      email: email || null,
      additionalContact: field(form, "additional contact", 300, false),
      eventType: eventType === "other" ? field(form, "custom event type", 100) : eventType,
      eventDate: Timestamp.fromDate(start),
      eventDateKey,
      eventTime,
      eventEndTime,
      venueName,
      venueAddress,
      eventLocation: venueName,
      eventAddress: venueAddress,
      packageId: offer?.[1] === "packages" ? selectionId : null,
      serviceId: offer?.[1] === "addons" ? selectionId : null,
      serviceDetails: field(form, "service details", 2000, false),
      guestCount,
      specialRequests: field(form, "special requests", 2000, false),
      agreedPriceCentavos: price ? Math.round(Number(price) * 100) : null,
      pricingNotes: field(form, "pricing notes", 1000, false),
      customerAcknowledged: true,
      agreementDate,
      agreementTime,
      agreementAt: Timestamp.fromDate(agreementAt),
      agreementConfirmedAt: FieldValue.serverTimestamp(),
      agreementNotes: field(form, "agreement notes", 1000, false),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const remaining = await adminDb.runTransaction(async (transaction) => {
      const data = await readProvider(transaction, provider, account.uid);
      const previous = await transaction.get(reference);
      if (previous.exists) return null;
      const {counts, occupiedWalkIn, remaining, blocked} = await dailyOccupancy(
        transaction, provider.id, data, eventDateKey, start, today,
      );
      if (blocked) throw new WalkInInputError("Your schedule is unavailable on this date.");
      if (remaining === 0) {
        throw new WalkInInputError("Your business has reached its booking capacity for this date.");
      }
      const categories = Array.isArray(data.serviceCategories) ? data.serviceCategories : [data.providerCategory];
      const requiresGuests = providerCapacityCapabilities(categories.filter(isServiceCategoryCode)).requiresGuestCapacity;
      if (((data.capacityCapabilities as {requiresGuestCapacity?: boolean} | undefined)?.requiresGuestCapacity ?? requiresGuests) && guestCount === null) {
        throw new WalkInInputError("Enter the expected number of guests for this event.");
      }
      let selected: WalkInOffer | null = null;
      if (offer && selectionId) {
        const kind = offer[1] as WalkInOffer["kind"];
        const snapshot = await transaction.get(adminDb.collection(kind).doc(selectionId));
        selected = publishedWalkInOffer(selectionId, kind, snapshot.data() ?? {}, provider.id);
        if (!selected) throw new WalkInInputError("Choose a published package or service from your own catalog.");
      }
      const pricingOption = selected?.options.find((option) => option.id === optionId) ?? null;
      if (optionId && !pricingOption) throw new WalkInInputError("Choose a current pricing option for this package.");
      if (selected && selected.options.length > 1 && !pricingOption && !price) {
        throw new WalkInInputError("Choose a pricing option or enter the agreed price.");
      }
      transaction.create(reference, {
        ...booking,
        serviceName: selected?.name ?? serviceName,
        catalogOffer: selected,
        pricingOption,
      });
      transaction.update(provider, {
        walkInReservedCounts: {...counts, [eventDateKey]: occupiedWalkIn + 1},
        walkInReservedDates: FieldValue.delete(),
        availabilityReservationUpdatedAt: FieldValue.serverTimestamp(),
      });
      recordAudit(transaction, reference.id, "walk_in_created", null, "confirmed");
      return remaining - 1;
    });
    return {
      message: "Walk-in booking recorded successfully.",
      reference: reference.id,
      remaining,
    };
  } catch (error) {
    if (error instanceof WalkInInputError) return {error: error.message};
    console.error("Walk-in booking operation failed", error instanceof Error ? error.name : "UnknownError");
    return {error: "The walk-in booking could not be saved. Try again."};
  }
}
