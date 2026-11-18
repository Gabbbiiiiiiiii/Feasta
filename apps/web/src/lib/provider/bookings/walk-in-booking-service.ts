import "server-only";

import {FieldValue, Timestamp, type Transaction} from "firebase-admin/firestore";
import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {calendarRequestOccupies} from "@/lib/provider/calendar/provider-calendar-service";

class WalkInInputError extends Error {}

function field(form: FormData, name: string, limit: number, required = true) {
  const value = form.get(name);
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > limit) {
    throw new WalkInInputError(`Check the ${name} field.`);
  }
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

export async function walkInProvider() {
  const account = await requireApprovedProvider();
  if (!account.providerId) throw new Error("Provider account is missing.");
  return {account, provider: adminDb.collection("providers").doc(account.providerId)};
}

export async function mutateWalkIn(form: FormData) {
  const {account, provider} = await walkInProvider();
  const records = provider.collection("walkInBookings");

  async function readProvider(transaction: Transaction) {
    const data = (await transaction.get(provider)).data();
    if (!data || data.ownerId !== account.uid || data.verificationStatus !== "approved" ||
        data.isActive !== true || data.isSuspended === true || data.isDeleted === true) {
      throw new WalkInInputError("Your provider account cannot manage walk-in bookings.");
    }
    return data;
  }

  try {
    const action = form.get("action");
    if (action === "completed" || action === "cancelled") {
      const id = field(form, "reference", 20);
      if (!/^[A-Za-z0-9]{20}$/.test(id)) throw new WalkInInputError("Invalid booking reference.");
      await adminDb.runTransaction(async (transaction) => {
        const data = await readProvider(transaction);
        const reference = records.doc(id);
        const booking = (await transaction.get(reference)).data();
        if (!booking || booking.status !== "confirmed") {
          throw new WalkInInputError("Only confirmed walk-ins can be updated.");
        }
        if (action === "cancelled") {
          const dates = Array.isArray(data.walkInReservedDates) ? data.walkInReservedDates : [];
          transaction.update(provider, {
            walkInReservedDates: dates.filter((date) => date !== booking.eventDateKey),
            availabilityReservationUpdatedAt: FieldValue.serverTimestamp(),
          });
        }
        transaction.update(reference, {status: action, updatedAt: FieldValue.serverTimestamp()});
      });
      return {message: action === "completed" ? "Walk-in completed." : "Walk-in cancelled."};
    }

    if (action !== "create") throw new WalkInInputError("Invalid booking action.");
    const today = manilaToday();
    const eventDateKey = field(form, "event date", 10);
    const start = parseDate(eventDateKey);
    const end = new Date(start.getTime() + 86_400_000);
    const eventTime = field(form, "start time", 5);
    const eventEndTime = field(form, "end time", 5);
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(eventTime) || !timePattern.test(eventEndTime) || eventTime >= eventEndTime) {
      throw new WalkInInputError("Enter a start and end time on the same day.");
    }
    const latest = new Date(parseDate(today).getTime() + 731 * 86_400_000);
    if (eventDateKey < today || start > latest) {
      throw new WalkInInputError("Choose an event date within the next two years.");
    }
    const agreementDate = field(form, "agreement date", 10);
    parseDate(agreementDate);
    if (agreementDate > today || form.get("acknowledgment") !== "on") {
      throw new WalkInInputError("Record the customer's acknowledgment and agreement date.");
    }
    const email = field(form, "email", 254, false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new WalkInInputError("Enter a valid email address.");
    }
    const phone = field(form, "contact number", 40);
    if (!/^[+\d(). -]+$/.test(phone) || phone.replace(/\D/g, "").length < 7) {
      throw new WalkInInputError("Enter a valid contact number.");
    }
    const guestCount = Number(field(form, "number of guests", 6));
    if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 100000) {
      throw new WalkInInputError("Enter a whole number of guests from 1 to 100,000.");
    }
    const price = field(form, "agreed price", 12, false);
    if (price && !/^\d{1,9}(\.\d{1,2})?$/.test(price)) {
      throw new WalkInInputError("Enter a valid peso amount with up to two decimal places.");
    }
    const packageId = field(form, "package", 160, false);
    if (packageId && !/^[A-Za-z0-9_-]+$/.test(packageId)) {
      throw new WalkInInputError("Choose one of your packages.");
    }
    const serviceName = packageId ? "" : field(form, "custom service", 160);
    const reference = records.doc();
    const booking = {
      providerId: provider.id,
      bookingReference: reference.id,
      source: "walk_in",
      status: "confirmed",
      customerName: field(form, "full name", 160),
      phone,
      email: email || null,
      eventType: field(form, "event type", 100),
      eventDate: Timestamp.fromDate(start),
      eventDateKey,
      eventTime,
      eventEndTime,
      eventLocation: field(form, "location", 300),
      packageId: packageId || null,
      serviceDetails: field(form, "service details", 2000, false),
      guestCount,
      specialRequests: field(form, "special requests", 2000, false),
      agreedPriceCentavos: price ? Math.round(Number(price) * 100) : null,
      customerAcknowledged: true,
      agreementDate,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await adminDb.runTransaction(async (transaction) => {
      const data = await readProvider(transaction);
      const reservedDates = Array.isArray(data.walkInReservedDates)
        ? data.walkInReservedDates.filter((date): date is string => typeof date === "string" && date >= today)
        : [];
      if (reservedDates.includes(eventDateKey) ||
          (Array.isArray(data.unavailableDates) && data.unavailableDates.includes(eventDateKey))) {
        throw new WalkInInputError("Your schedule is unavailable on this date.");
      }
      const requests = await transaction.get(adminDb.collection("providerRequests")
        .where("providerId", "==", provider.id)
        .where("status", "in", ["accepted", "waiting_for_down_payment", "payment_processing", "confirmed", "in_progress", "completed"])
        .where("eventDate", ">=", booking.eventDate)
        .where("eventDate", "<", Timestamp.fromDate(end)));
      const now = Date.now();
      if (requests.docs.some((request) => calendarRequestOccupies(request.data(), now))) {
        throw new WalkInInputError("You already have an active booking on this date.");
      }

      let name = serviceName;
      if (packageId) {
        const selected = (await transaction.get(adminDb.collection("packages").doc(packageId))).data();
        if (!selected || selected.providerId !== provider.id || selected.status === "archived" ||
            typeof selected.name !== "string" || !selected.name.trim()) {
          throw new WalkInInputError("Choose a current package from your own catalog.");
        }
        name = selected.name;
      }
      transaction.create(reference, {...booking, serviceName: name});
      // Online reservations read and update this same provider document.
      transaction.update(provider, {
        walkInReservedDates: [...reservedDates, eventDateKey].sort(),
        availabilityReservationUpdatedAt: FieldValue.serverTimestamp(),
      });
    });
    return {message: "Walk-in booking confirmed."};
  } catch (error) {
    if (error instanceof WalkInInputError) return {error: error.message};
    console.error("Walk-in booking operation failed", error instanceof Error ? error.name : "UnknownError");
    return {error: "The walk-in booking could not be saved. Try again."};
  }
}
