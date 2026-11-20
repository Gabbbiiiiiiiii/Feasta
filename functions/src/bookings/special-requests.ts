import {convertSpecialOfferToBooking} from "./convert-special-offer.js";
import {refundPolicyDisclosures} from "./booking-refund-policy.js";
import {loadSpecialOfferRefundPolicies} from "./special-offer-refund-policy.js";
import {buildProviderRequestFinancialSnapshot} from "../provider-requests/provider-request-financial-snapshot.js";
import {Timestamp} from "firebase-admin/firestore";
import {AVAILABILITY_COUNTED_REQUEST_STATUSES, manilaDateFromKey, validateProviderAvailability} from "../provider-availability/validate-provider-availability.js";
import {createHash} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {isProviderPubliclyEligible} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {createNotificationInTransaction} from "../shared/notifications.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireActiveServiceCategoryInTransaction} from "../shared/service-category-policy.js";
import {requireCustomerPackageV2} from "../packages/customer-package-v2.js";
import {isCanonicalClockTime} from "./catering-schedule.js";
import {bookingPolicyTimingV3} from "./booking-policy-v3.js";
import {dropOffSpecialRequestUnitPrice, isDropOffSpecialRequest, nextSpecialRequestStatus, specialRequestPackageSubtotal} from "./special-request-policy.js";

const requests = db.collection("specialRequests");

function boundedText(value: unknown, label: string, max: number, required = true): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > max || (required && !result)) {
    throw new HttpsError("invalid-argument", `Enter a valid ${label}.`);
  }
  return result;
}

function documentId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new HttpsError("invalid-argument", "Invalid request identifier.");
  }
  return value;
}

export const submitSpecialRequest = onCall(appCheckCallableOptions, async request => {
  const {uid} = requireAuth(request);
  await requireRole(uid, ["customer"]);
  await enforceCallableRateLimit(request, {scope: "specialRequests.submit", limit: 12, windowSeconds: 600});

  const input = request.data ?? {};
  const packageId = documentId(input.packageId);
  const submissionId = documentId(input.submissionId);
  const quantity = input.quantity;
  if (specialRequestPackageSubtotal(0, quantity) === null) {
    throw new HttpsError("invalid-argument", "Enter a whole quantity from 1 to 100.");
  }
  if ((input.serviceTier != null && input.serviceTier !== "drop_off") ||
      (input.fulfillment != null && input.fulfillment !== "delivery") ||
      input.eventEndTime != null || input.feeInCentavos != null) {
    throw new HttpsError("invalid-argument", "Special requests only support Drop-Off catering with delivery included.");
  }
  const serviceTier = "drop_off";
  const eventDate = boundedText(input.eventDate, "date", 10);
  const day = new Date(eventDate + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(eventDate) ||
      !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== eventDate) {
    throw new HttpsError("invalid-argument", "Select a valid event date.");
  }
  if (!isCanonicalClockTime(input.eventTime)) {
    throw new HttpsError("invalid-argument", "Enter a valid Drop-Off Time.");
  }
  const eventTime = input.eventTime.trim().slice(0, 5);
  const details = {
    packageId, quantity, serviceTier, eventDate, eventTime,
    eventEndTime: null,
    address: boundedText(input.address, "delivery address", 500),
    instructions: boundedText(input.instructions, "special instructions", 2000, false),
    deliveryInstructions: boundedText(input.deliveryInstructions, "delivery instructions", 1000, false),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(details)).digest("hex");
  const id = createHash("sha256").update(JSON.stringify([uid, submissionId])).digest("hex");
  const reference = requests.doc(id);
  return db.runTransaction(async tx => {
    const [existing, packageSnapshot, customerSnapshot] = await Promise.all([
      tx.get(reference), tx.get(db.collection("packages").doc(packageId)),
      tx.get(db.collection("users").doc(uid)),
    ]);
    if (existing.exists) {
      const legacyDetails = {packageId, quantity, fulfillment: "delivery", serviceTier, eventDate, eventTime,
        eventEndTime: null, address: details.address, instructions: details.instructions,
        deliveryInstructions: details.deliveryInstructions};
      const legacyFingerprint = createHash("sha256").update(JSON.stringify(legacyDetails)).digest("hex");
      if (![fingerprint, legacyFingerprint].includes(existing.get("fingerprint"))) {
        throw new HttpsError("already-exists", "This submission was already used for another request.");
      }
      return {id};
    }
    if (Date.parse(`${eventDate}T${eventTime}:00+08:00`) <= Date.now()) {
      throw new HttpsError("invalid-argument", "Choose a future event date and time.");
    }
    const catalogPackage = packageSnapshot.data();
    if (!catalogPackage || catalogPackage.status !== "published" || catalogPackage.isActive !== true ||
        catalogPackage.isPublished !== true || catalogPackage.isDeleted === true ||
        catalogPackage.providerPubliclyVisible !== true) {
      throw new HttpsError("failed-precondition", "This package is unavailable.");
    }
    const providerId = documentId(catalogPackage.providerId);
    const provider = (await tx.get(db.collection("providers").doc(providerId))).data();
    const providerOwnerId = documentId(provider?.ownerId);
    const owner = (await tx.get(db.collection("users").doc(providerOwnerId))).data();
    if (!provider || !owner || !isProviderPubliclyEligible({...provider, id: providerId}, owner)) {
      throw new HttpsError("failed-precondition", "This provider is unavailable.");
    }
    if (catalogPackage.sharedContractVersion === 2) {
      await requireCustomerPackageV2(tx, catalogPackage, "discovery");
    }
    await requireActiveServiceCategoryInTransaction(tx, catalogPackage.serviceCategoryCode, "catering");
    const unitAmountInCentavos = dropOffSpecialRequestUnitPrice(catalogPackage, provider.providerServiceType);
    const subtotalInCentavos = unitAmountInCentavos === null ? null :
      specialRequestPackageSubtotal(unitAmountInCentavos, quantity);
    if (subtotalInCentavos === null) {
      throw new HttpsError("failed-precondition", "This package does not offer Drop-Off catering.");
    }
    const customer = customerSnapshot.data();
    tx.create(reference, {
      ...details, customerId: uid, providerId, providerOwnerId, fingerprint,
      customerName: customer?.fullName ?? customer?.displayName ?? "Customer",
      providerName: provider.businessName,
      packageName: catalogPackage.name ?? "Package",
      unitAmountInCentavos, subtotalInCentavos, status: "pending_review",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    for (const [userId, title, message] of [
      [uid, "Special request submitted", "Your provider will review your request."],
      [providerOwnerId, "New special request", "A customer sent a special request for your package."],
    ]) {
      createNotificationInTransaction(tx, {userId, title, message, type: "special_request",
        relatedCollection: "specialRequests", relatedId: id});
    }
    return {id};
  });
});

function publicRequest(id: string, data: Record<string, unknown>) {
  const details = {...data};
  delete details.fingerprint;
  delete details.customerId;
  delete details.providerOwnerId;
  delete details.fulfillment;
  details.dropOffEligible = isDropOffSpecialRequest(data);
  const offer = details.priceOffer as {expiresAtMs?: number} | undefined;
  const eventStart = Date.parse(`${data.eventDate}T${data.eventTime}:00+08:00`);
  if (offer?.expiresAtMs != null && Number.isFinite(eventStart)) {
    const cutoff = bookingPolicyTimingV3(new Date(eventStart)).hardPaymentDeadlineAt.getTime();
    details.priceOffer = {...offer, expiresAtMs: Math.min(offer.expiresAtMs, cutoff)};
    if (details.status === "quotation_sent" && cutoff <= Date.now() && cutoff < offer.expiresAtMs) {
      details.paymentWindowClosed = true;
      details.status = "expired";
    }
  }
  if (details.status === "quotation_sent" && offer?.expiresAtMs != null && offer.expiresAtMs <= Date.now()) {
    details.status = "expired";
  }
  return {...details, id, status: details.status};
}

export const listSpecialRequests = onCall(appCheckCallableOptions, async request => {
  const {uid} = requireAuth(request);
  const providerView = request.data?.view === "provider";
  await requireRole(uid, [providerView ? "provider" : "customer"]);
  await enforceCallableRateLimit(request, {scope: "specialRequests.list", limit: 60, windowSeconds: 60});
  if (!providerView && request.data?.id != null) {
    const id = documentId(request.data.id);
    return db.runTransaction(async tx => {
      const row = (await tx.get(requests.doc(id))).data();
      if (!row || row.customerId !== uid) {
        throw new HttpsError("not-found", "Special request was not found.");
      }
      const details = publicRequest(id, row);
      if (details.status !== "quotation_sent" ||
          !isDropOffSpecialRequest(row)) return {requests: [details]};
      const [provider, catalogPackage] = await Promise.all([
        tx.get(db.collection("providers").doc(row.providerId)),
        tx.get(db.collection("packages").doc(row.packageId)),
      ]);
      try {
        const policies = await loadSpecialOfferRefundPolicies(tx, {
          providerId: row.providerId, providerName: row.providerName, providerData: provider.data() ?? {},
          packageRecord: {packageId: row.packageId, data: catalogPackage.data() ?? {}},
        });
        return {requests: [{...details, refundPolicies: refundPolicyDisclosures(policies)}]};
      } catch (error) {
        if (!(error instanceof HttpsError) || error.code !== "failed-precondition") throw error;
        return {requests: [{...details, refundPolicyError: error.message}]};
      }
    }, {readOnly: true});
  }
  const field = providerView ? "providerId" : "customerId";
  const account = providerView ? (await db.collection("users").doc(uid).get()).data() : null;
  const ownerScope = providerView ? documentId(account?.providerId) : uid;
  if (providerView && (await db.collection("providers").doc(ownerScope).get()).get("ownerId") !== uid) {
    throw new HttpsError("permission-denied", "This provider account does not own these requests.");
  }
  const rows = await requests.where(field, "==", ownerScope).orderBy("createdAt", "desc").limit(50).get();
  return {requests: rows.docs.map(row => publicRequest(row.id, row.data()))};
});

export const updateSpecialRequest = onCall(appCheckCallableOptions, async request => {
  const {uid} = requireAuth(request);
  const action = request.data?.action;
  const sendingOffer = action === "sendQuotation";
  const acceptingOffer = action === "accept";
  const respondingToOffer = acceptingOffer || action === "declineOffer" || action === "requestRevision";
  const providerView = sendingOffer || action === "requestClarification" || action === "decline";
  if (!providerView && !respondingToOffer && action !== "clarify" && action !== "cancel") {
    throw new HttpsError("invalid-argument", "Unknown special request action.");
  }
  await requireRole(uid, [providerView ? "provider" : "customer"]);
  await enforceCallableRateLimit(request, {scope: "specialRequests.update", limit: 30, windowSeconds: 600});
  const id = documentId(request.data?.id);
  const message = boundedText(request.data?.message, "message", 2000, action !== "cancel" && action !== "declineOffer" && !sendingOffer && !acceptingOffer);
  return db.runTransaction(async tx => {
    const reference = requests.doc(id);
    const row = (await tx.get(reference)).data();
    if (!row || (!providerView && row.customerId !== uid)) {
      throw new HttpsError("not-found", "Special request was not found.");
    }
    const providerRef = db.collection("providers").doc(row.providerId);
    const provider = (await tx.get(providerRef)).data();
    if (providerView && provider?.ownerId !== uid) {
      throw new HttpsError("not-found", "Special request was not found.");
    }
    const now = Date.now();
    const eventStart = Date.parse(`${row.eventDate}T${row.eventTime}:00+08:00`);
    const version = respondingToOffer ? {
      latest: row.priceOffer?.version,
      submitted: request.data?.offerVersion,
      expiresAtMs: Math.min(eventStart, row.priceOffer?.expiresAtMs ?? eventStart),
    } : undefined;
    if (action === "declineOffer" && row.status === "declined" &&
        row.declinedPriceOfferVersion === version?.submitted && Number.isSafeInteger(version?.submitted)) {
      return {status: "declined"};
    }
    if (acceptingOffer && row.status === "converted_to_booking" &&
        row.acceptedPriceOfferVersion === version?.submitted && Number.isSafeInteger(version?.submitted)) {
      return {status: row.status, bookingId: row.bookingId};
    }
    const status = nextSpecialRequestStatus(
      row.status, providerView ? "provider" : "customer",
      action === "declineOffer" ? "decline" : action, now, version,
    );
    if (!status) throw new HttpsError("failed-precondition", "This request has already changed. Refresh and try again.");
    const holds = Object.fromEntries(Object.entries(provider?.specialOfferHolds ?? {}).filter(
      ([, hold]) => typeof hold === "object" && hold !== null &&
        typeof (hold as {expiresAtMs?: unknown}).expiresAtMs === "number" &&
        (hold as {expiresAtMs: number}).expiresAtMs > now,
    ));
    if (sendingOffer) {
      if (!Number.isFinite(eventStart)) {
        throw new HttpsError("failed-precondition", "The requested event time is invalid.");
      }
      const paymentCutoff = bookingPolicyTimingV3(new Date(eventStart)).hardPaymentDeadlineAt.getTime();
      if (paymentCutoff <= Date.now()) {
        throw new HttpsError("failed-precondition", "FEASTA closes payment 24 hours before the event. Ask the customer to request a later schedule.");
      }
      if (!isDropOffSpecialRequest(row)) {
        throw new HttpsError("failed-precondition", "Send a new request for Drop-Off catering with a delivery address.");
      }
      if (request.data?.feeInCentavos != null && request.data.feeInCentavos !== 0) {
        throw new HttpsError("invalid-argument", "Delivery is already included. Remove the separate fee.");
      }
      const packageData = (await tx.get(db.collection("packages").doc(row.packageId))).data();
      if (!packageData || packageData.providerId !== row.providerId || packageData.status !== "published" ||
          packageData.isPublished !== true || packageData.isActive !== true || packageData.isDeleted === true ||
          dropOffSpecialRequestUnitPrice(packageData, provider?.providerServiceType) === null) {
        throw new HttpsError("failed-precondition", "This package no longer offers Drop-Off catering.");
      }
      await requireActiveServiceCategoryInTransaction(tx, packageData.serviceCategoryCode, "catering");
      const subtotal = specialRequestPackageSubtotal(row.unitAmountInCentavos, row.quantity);
      if (subtotal === null || subtotal <= 0) {
        throw new HttpsError("failed-precondition", "A valid package subtotal is required.");
      }
      const existingVersion = row.priceOffer?.version ?? 0;
      if (!Number.isSafeInteger(existingVersion) || existingVersion < 0 ||
          existingVersion >= Number.MAX_SAFE_INTEGER) {
        throw new HttpsError("failed-precondition", "Invalid price offer version.");
      }
      const date = manilaDateFromKey(row.eventDate);
      if (!provider || !date) throw new HttpsError("failed-precondition", "Provider schedule is unavailable.");
      const nextDate = new Date(date.getTime() + 86_400_000);
      const occupied = await tx.get(db.collection("providerRequests")
        .where("providerId", "==", row.providerId)
        .where("status", "in", [...AVAILABILITY_COUNTED_REQUEST_STATUSES])
        .where("eventDate", ">=", Timestamp.fromDate(date))
        .where("eventDate", "<", Timestamp.fromDate(nextDate)));
      const availability = validateProviderAvailability({
        providerData: provider,
        now: new Date(now),
        request: {providerRequestId: id, type: "catering", eventDate: date,
          eventTime: row.eventTime, eventEndTime: row.eventEndTime, serviceTier: row.serviceTier,
          guestCount: provider.minGuestsPerEvent, services: []},
        existingBookings: occupied.docs.map(doc => ({
          ...doc.data(), providerRequestId: doc.id, status: doc.get("status"),
          eventTime: doc.get("eventTime"), eventEndTime: doc.get("eventEndTime"),
        })),
      });
      if (!availability.available) {
        throw new HttpsError("failed-precondition", availability.issues[0]?.message ?? "The date is unavailable.");
      }
      const expiresAtMs = Math.min(paymentCutoff, now + 3_600_000);
      const [platformDoc, taxDoc] = await Promise.all([
        tx.get(db.doc("appSettings/platform")),
        tx.get(db.collection("providerTaxProfiles").doc(row.providerId)),
      ]);
      const pricing = buildProviderRequestFinancialSnapshot({
        providerId: row.providerId,
        providerOwnerId: provider.ownerId,
        providerRequest: {amount: subtotal / 100, downPaymentAmount: subtotal / 100, remainingBalance: 0},
        platformSettings: platformDoc.data() ?? null,
        providerTaxProfile: taxDoc.data() ?? null,
      });
      holds[id] = {date: row.eventDate, expiresAtMs};
      tx.update(providerRef, {specialOfferHolds: holds, availabilityReservationUpdatedAt: serverTimestamp()});
      const priceOffer = {
        expiresAtMs,
        version: existingVersion + 1,
        unitAmountInCentavos: row.unitAmountInCentavos,
        quantity: row.quantity,
        subtotalInCentavos: subtotal,
        deliveryIncluded: true,
        totalInCentavos: subtotal,
        pricing,
        notes: message,
      };
      tx.create(reference.collection("priceOffers").doc(String(priceOffer.version)), {
        ...priceOffer, createdAt: serverTimestamp(),
      });
      tx.update(reference, {status, priceOffer, updatedAt: serverTimestamp()});
      createNotificationInTransaction(tx, {
        userId: row.customerId, title: "Price offer received",
        message: "The provider sent a price offer for your special request.",
        type: "special_request", relatedCollection: "specialRequests", relatedId: id,
      });
      return {status};
    }
    if (acceptingOffer) {
      if (!isDropOffSpecialRequest(row) || !["catering", "both"].includes(provider?.providerServiceType)) {
        throw new HttpsError("failed-precondition", "This older offer cannot be booked as Drop-Off. Submit a new Drop-Off request.");
      }
      const hold = provider?.specialOfferHolds?.[id];
      if (!Number.isSafeInteger(row.priceOffer?.expiresAtMs) ||
          hold?.date !== row.eventDate || hold.expiresAtMs !== row.priceOffer.expiresAtMs ||
          hold.expiresAtMs <= Date.now()) {
        throw new HttpsError("failed-precondition", "The reservation hold is unavailable. Ask the provider for a new offer.");
      }
      if (!provider) throw new HttpsError("failed-precondition", "The provider is unavailable.");
      return convertSpecialOfferToBooking({tx, reference, row, providerRef, provider, holds, eventStart, now,
        policyAcknowledgements: request.data?.policyAcknowledgements});
    }
    if (provider && Object.hasOwn(provider.specialOfferHolds ?? {}, id)) {
      delete holds[id];
      tx.update(providerRef, {specialOfferHolds: holds, availabilityReservationUpdatedAt: serverTimestamp()});
    }
    tx.update(reference, {
      status, ...(message ? {[action + "Message"]: message} : {}),
      ...(action === "declineOffer" ? {declinedPriceOfferVersion: version?.submitted} : {}),
      updatedAt: serverTimestamp(),
    });
    const recipient = providerView ? row.customerId : provider?.ownerId;
    if (typeof recipient === "string" && recipient) {
      createNotificationInTransaction(tx, {
        userId: recipient,
        title: action === "declineOffer" ? "Price offer declined" :
          action === "requestRevision" ? "Price offer changes requested" : "Special request updated",
        message: "Open Special Requests to view the latest update.",
        type: "special_request", relatedCollection: "specialRequests", relatedId: id,
      });
    }
    return {status};
  });
});
