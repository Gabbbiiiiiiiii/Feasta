import {createHash} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {logError} from "../shared/logger.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {assertBookingSubmissionAllowed} from "./booking-authorization.js";

type UnknownRecord = Record<string, unknown>;

/** Server-authoritative transition from booking intent to submitted request. */
export const submitBookingRequest = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["customer"]);
    await enforceCallableRateLimit(request, {
      scope: "bookings.submit",
      limit: 8,
      windowSeconds: 10 * 60,
    });
    const authUser = await getAuth().getUser(actor.uid);

    try {
      const input = asRecord(request.data);
      const clientRequestId = requireId(input, "clientRequestId");
      const providerId = requireId(input, "providerId");
      const packageId = requireId(input, "packageId");
      const eventType = requireText(input, "eventType", 1, 80);
      const eventTime = requireText(input, "eventTime", 1, 40);
      const eventEndTime = requireText(input, "eventEndTime", 1, 40);
      const eventLocation = requireText(input, "eventLocation", 1, 180);
      const eventAddress = requireText(input, "eventAddress", 1, 500);
      const specialRequest = optionalText(input, "specialRequest", 1000);
      const arrangedNote = optionalText(
        input,
        "customerArrangedAddOnsNote",
        500,
      );
      const guestCount = requireInteger(input, "guestCount", 1, 10000);
      const eventDate = requireFutureDate(input.eventDate);
      const selectedFoods = requireStringList(input, "selectedFoods", 50, 120);
      const selectedDecorations = requireStringList(
        input,
        "selectedDecorations",
        50,
        120,
      );
      const selectedFurniture = requireStringList(
        input,
        "selectedFurniture",
        50,
        120,
      );
      const addonIds = requireStringList(input, "addonIds", 20, 160);
      const willArrangeOwnAddOns = input.willArrangeOwnAddOns === true;

      const bookingId = createHash("sha256")
        .update(`${actor.uid}:${clientRequestId}`)
        .digest("hex")
        .slice(0, 40);
      const bookingReference = db.collection("mainEvents").doc(bookingId);
      const userReference = db.collection("users").doc(actor.uid);
      const customerReference = db.collection("customers").doc(actor.uid);
      const providerReference = db.collection("providers").doc(providerId);
      const packageReference = db.collection("packages").doc(packageId);
      const addonReferences = addonIds.map((id) => db.collection("addons").doc(id));

      const result = await db.runTransaction(async (transaction) => {
        const [existing, userSnapshot, customerSnapshot, providerSnapshot,
          packageSnapshot, ...addonSnapshots] = await Promise.all([
          transaction.get(bookingReference),
          transaction.get(userReference),
          transaction.get(customerReference),
          transaction.get(providerReference),
          transaction.get(packageReference),
          ...addonReferences.map((reference) => transaction.get(reference)),
        ]);

        if (existing.exists) {
          if (existing.data()?.customerId !== actor.uid) {
            throw new HttpsError("permission-denied", "Booking ownership is invalid.");
          }
          return {bookingId, created: false};
        }

        const user = userSnapshot.data();
        if (!userSnapshot.exists) {
          throw new HttpsError("permission-denied", "Account is unavailable.");
        }
        assertBookingSubmissionAllowed(
          user ?? {},
          request.auth?.token.email_verified === true,
          authUser.phoneNumber,
        );
        const verifiedPhoneNumber = user?.phoneNumber as string;
        if (!customerSnapshot.exists) {
          throw new HttpsError("not-found", "Customer profile was not found.");
        }

        const provider = providerSnapshot.data();
        if (
          !providerSnapshot.exists ||
          provider?.verificationStatus !== "approved" ||
          provider.isActive !== true ||
          provider.isSuspended === true
        ) {
          throw new HttpsError("failed-precondition", "Provider is unavailable.");
        }
        const packageData = packageSnapshot.data();
        if (
          !packageSnapshot.exists ||
          packageData?.providerId !== providerId ||
          packageData.isActive !== true ||
          packageData.isDeleted === true ||
          typeof packageData.price !== "number"
        ) {
          throw new HttpsError("failed-precondition", "Package is unavailable.");
        }

        const selectedAddOns = addonSnapshots.map((snapshot) => {
          const addon = snapshot.data();
          if (
            !snapshot.exists ||
            addon?.isActive !== true ||
            addon.isAvailable !== true ||
            addon.isDeleted === true ||
            typeof addon.price !== "number" ||
            typeof addon.providerId !== "string"
          ) {
            throw new HttpsError("failed-precondition", "An add-on is unavailable.");
          }
          return {
            addonId: snapshot.id,
            providerId: addon.providerId,
            providerBusinessName: stringValue(addon.providerBusinessName),
            name: stringValue(addon.name),
            category: stringValue(addon.category),
            price: addon.price,
            source: addon.providerId === providerId
              ? "catering_provider"
              : "feasta_addon_provider",
          };
        });
        const marketplaceProviderIds = [...new Set(
          selectedAddOns
            .filter((addon) => addon.source === "feasta_addon_provider")
            .map((addon) => addon.providerId),
        )];
        const marketplaceProviderSnapshots = await Promise.all(
          marketplaceProviderIds.map((id) => transaction.get(
            db.collection("providers").doc(id),
          )),
        );
        const marketplaceOwners = new Map(
          marketplaceProviderSnapshots.map((snapshot) => [
            snapshot.id,
            stringValue(snapshot.data()?.ownerId),
          ]),
        );

        const cateringAddOnsTotal = selectedAddOns
          .filter((addon) => addon.source === "catering_provider")
          .reduce((sum, addon) => sum + addon.price, 0);
        const marketplaceAddOnsTotal = selectedAddOns
          .filter((addon) => addon.source === "feasta_addon_provider")
          .reduce((sum, addon) => sum + addon.price, 0);
        const cateringSubtotal = packageData.price + cateringAddOnsTotal;
        const estimatedEventTotal = cateringSubtotal + marketplaceAddOnsTotal;
        const percentage = typeof packageData.downPaymentPercentage === "number"
          ? packageData.downPaymentPercentage
          : 0;
        const downPaymentAmount = cateringSubtotal * (percentage / 100);
        const customer = customerSnapshot.data() ?? {};
        const providerOwnerId = stringValue(provider.ownerId);
        if (!providerOwnerId) {
          throw new HttpsError("failed-precondition", "Provider owner is invalid.");
        }

        transaction.create(bookingReference, {
          bookingCode: `BK-${bookingId.slice(0, 10).toUpperCase()}`,
          customerId: actor.uid,
          providerId,
          packageId,
          customerFirstName: stringValue(customer.firstName),
          customerLastName: stringValue(customer.lastName),
          customerEmail: stringValue(customer.email),
          customerPhoneNumber: verifiedPhoneNumber,
          providerBusinessName: stringValue(provider.businessName),
          packageName: stringValue(packageData.name),
          eventType,
          eventDate: Timestamp.fromDate(eventDate),
          eventTime,
          eventEndTime,
          guestCount,
          eventLocation,
          eventAddress,
          selectedFoods,
          selectedDecorations,
          selectedFurniture,
          selectedAddOns,
          willArrangeOwnAddOns,
          customerArrangedAddOnsNote: arrangedNote,
          specialRequest,
          packagePrice: packageData.price,
          addOnsTotal: cateringAddOnsTotal,
          totalAmount: cateringSubtotal,
          cateringAddOnsTotal,
          marketplaceAddOnsTotal,
          cateringSubtotal,
          estimatedEventTotal,
          downPaymentPercentage: percentage,
          downPaymentAmount,
          remainingBalance: cateringSubtotal - downPaymentAmount,
          status: "pending",
          paymentStatus: "unpaid",
          recoveryStatus: "none",
          originalProviderId: providerId,
          currentProviderId: providerId,
          rejectedByProviderIds: [],
          cancellationStatus: "none",
          refundStatus: "none",
          refundAmount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.create(bookingReference.collection("timeline").doc(), {
          status: "pending",
          title: "Booking Request Submitted",
          description: "Customer submitted a booking request.",
          createdBy: actor.uid,
          createdByRole: "customer",
          createdAt: serverTimestamp(),
        });
        transaction.create(db.collection("notifications").doc(), {
          userId: providerOwnerId,
          title: "New Booking Request",
          message: "A customer sent a booking request.",
          type: "booking",
          relatedId: bookingId,
          relatedCollection: "mainEvents",
          isRead: false,
          readAt: null,
          createdAt: serverTimestamp(),
        });
        for (const addon of selectedAddOns) {
          if (addon.source !== "feasta_addon_provider") continue;
          const addonRequestId = createHash("sha256")
            .update(`${bookingId}:${addon.addonId}`)
            .digest("hex")
            .slice(0, 40);
          transaction.create(db.collection("addonRequests").doc(addonRequestId), {
            bookingId,
            currentMainBookingId: bookingId,
            originalCateringProviderId: providerId,
            currentCateringProviderId: providerId,
            linkStatus: "active",
            mainBookingStatus: "pending",
            addonId: addon.addonId,
            addonProviderId: addon.providerId,
            addonProviderBusinessName: addon.providerBusinessName,
            customerId: actor.uid,
            customerFirstName: stringValue(customer.firstName),
            customerLastName: stringValue(customer.lastName),
            eventDate: Timestamp.fromDate(eventDate),
            eventTime,
            eventEndTime,
            eventAddress,
            addonName: addon.name,
            category: addon.category,
            price: addon.price,
            status: "pending",
            paymentStatus: "unpaid",
            paymentRequired: true,
            paymentType: "full_payment",
            paidAt: null,
            paymentId: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          const ownerId = marketplaceOwners.get(addon.providerId);
          if (ownerId) {
            transaction.create(db.collection("notifications").doc(), {
              userId: ownerId,
              title: "New Add-on Request",
              message: "A customer requested an add-on for a booking.",
              type: "booking",
              relatedId: addonRequestId,
              relatedCollection: "addonRequests",
              isRead: false,
              readAt: null,
              createdAt: serverTimestamp(),
            });
          }
        }
        transaction.create(db.collection("adminLogs").doc(), {
          action: "booking_submitted",
          actorId: actor.uid,
          actorRole: "customer",
          targetId: bookingId,
          targetType: "mainEvent",
          createdAt: serverTimestamp(),
        });
        return {bookingId, created: true};
      });

      logSecurityEvent({
        action: "booking_submission",
        outcome: "succeeded",
        actorUid: actor.uid,
        targetId: result.bookingId,
        metadata: {created: result.created},
      });
      return result;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logError("Booking submission failed", error, {actorUid: actor.uid});
      throw new HttpsError("internal", "Unable to submit booking.");
    }
  },
);

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Request is invalid.");
  }
  return value as UnknownRecord;
}

function requireId(data: UnknownRecord, field: string): string {
  const value = requireText(data, field, 8, 160);
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value;
}

function requireText(
  data: UnknownRecord,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const value = data[field];
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return normalized;
}

function optionalText(data: UnknownRecord, field: string, maximum: number): string {
  const value = data[field];
  if (value == null) return "";
  if (typeof value !== "string" || value.trim().length > maximum) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value.trim();
}

function requireInteger(
  data: UnknownRecord,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = data[field];
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value as number;
}

function requireFutureDate(value: unknown): Date {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "eventDate is invalid.");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() < Date.now() - 86400000) {
    throw new HttpsError("invalid-argument", "eventDate is invalid.");
  }
  return parsed;
}

function requireStringList(
  data: UnknownRecord,
  field: string,
  maximumItems: number,
  maximumLength: number,
): string[] {
  const value = data[field];
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length > maximumLength) {
      throw new HttpsError("invalid-argument", `${field} is invalid.`);
    }
    return item.trim();
  });
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
