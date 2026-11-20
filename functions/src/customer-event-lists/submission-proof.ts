import {createHash} from "node:crypto";
import type {Firestore, Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {bookingOutcomeId} from "../bookings/submission-outcome.js";
import {
  parseMultiProviderSubmissionEnvelope, parseMultiProviderMixedSubmissionEnvelope,
} from "../bookings/multi-provider-submission-contract.js";
import {stable, type Json, type PlanningEntry, type RecordValue} from "./contract.js";

// Must match submit-multi-provider-booking's fingerprint ordering exactly.
function bookingStable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(bookingStable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${bookingStable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export function submittedEnvelope(value: unknown) {
  try {
    return (value as {schemaVersion?: unknown} | null)?.schemaVersion === 2 ?
      parseMultiProviderMixedSubmissionEnvelope(value) :
      parseMultiProviderSubmissionEnvelope(value);
  } catch {
    throw new HttpsError("invalid-argument", "Unsupported or invalid submission evidence.");
  }
}
export function envelopeFingerprint(uid: string, envelope: unknown): string {
  return createHash("sha256").update(bookingStable({customerId: uid, envelope})).digest("hex");
}
function fail(): never {
  throw new HttpsError("failed-precondition", "Submission proof is incomplete or requires review.",
    {reason: "EVENT_LIST_SUBMISSION_PROOF_REQUIRED"});
}
function normalizedMobileEvent(event: RecordValue): RecordValue {
  return {...event, eventType: String(event.eventType).trim().toLowerCase(),
    eventLocation: String(event.eventLocation).trim(),
    eventAddress: String(event.eventAddress).trim()};
}
/** Only losslessly attributable snapshots qualify. No display estimate is authority.
 * Exact payload matching also supports Web snapshots if their submitted representation agrees.
 * Mobile's existing transport projections are reproduced without modifying booking contracts.
 */
function matches(entry: PlanningEntry, selection: Record<string, unknown>): boolean {
  if (!entry.configuration || entry.kind === "custom_menu" ||
      selection.providerId !== entry.providerId) return false;
  const marketplace = entry.kind === "marketplace_service";
  if (marketplace ? (selection.kind !== "marketplace_service" ||
      selection.serviceId !== entry.selectionId ||
      selection.expectedRevision !== entry.expectedRevision) :
    (selection.packageId !== entry.selectionId ||
      selection.kind === "marketplace_service")) return false;
  const config = entry.configuration;
  const submitted = selection.configuration as Json;
  if (!marketplace && stable(config) === stable(submitted)) return true;
  // A foreign-only editor representation is not silently converted for cleanup.
  if (Object.hasOwn(config, "themeInspiration") || Object.hasOwn(config, "selectedEventServices")) {
    return false;
  }
  const event = normalizedMobileEvent(config.event as RecordValue);
  const projected = marketplace ? {event, specialRequest:
    config.specialRequest ?? (config.event as RecordValue).specialRequest} :
    {...config, event, expectedPackageRevision:
      config.sharedContractVersion === 2 ? config.expectedPackageRevision : null};
  // Marketplace transport omits display-only and unsupported package fields;
  // require its original saved configuration to contain no customization that
  // could be silently attributed to the booking.
  if (marketplace && (config.customTheme !== "" ||
      ![null, undefined, "none"].includes(config.themeChoice as string | null | undefined) ||
      config.willArrangeOwnAddOns !== false || config.customerArrangedAddOnsNote !== "" ||
      ["packageThemeId", "serviceTier", "sharedContractVersion", "expectedPackageRevision"]
        .some(k => config[k] !== undefined && config[k] !== null) ||
      ["selectedFoods", "selectedDecorations", "selectedFurniture", "selectedAddOns",
        "foodChoiceSelections"]
        .some(k => !Array.isArray(config[k]) || (config[k] as Json[]).length > 0))) return false;
  return stable(projected as RecordValue) === stable(submitted);
}
export async function proveSubmittedSnapshots(
  firestore: Firestore, transaction: Transaction, uid: string,
  rawEnvelope: unknown, snapshots: PlanningEntry[],
): Promise<string> {
  const envelope = submittedEnvelope(rawEnvelope);
  if (!snapshots.length || snapshots.length > envelope.selections.length ||
      snapshots.some(entry => !envelope.selections.some(s => matches(entry, s)))) fail();
  const bookingId = bookingOutcomeId(uid, envelope.clientRequestId);
  const [bookingSnapshot, outcome] = await Promise.all([
    transaction.get(firestore.collection("mainEvents").doc(bookingId)),
    transaction.get(firestore.collection("bookingSubmissionOutcomes").doc(bookingId)),
  ]);
  const booking = bookingSnapshot.data();
  if (!bookingSnapshot.exists || outcome.exists || !booking ||
      booking.customerId !== uid || booking.clientRequestId !== envelope.clientRequestId ||
      booking.bookingId !== bookingId || booking.mainEventId !== bookingId ||
      booking.submissionFingerprint !== envelopeFingerprint(uid, envelope) ||
      !Array.isArray(booking.providerRequestIds) ||
      booking.providerRequestIds.length !== envelope.selections.length ||
      new Set(booking.providerRequestIds).size !== booking.providerRequestIds.length ||
      !booking.providerRequestIds.every(id => typeof id === "string" &&
        /^[a-f0-9]{40}$/.test(id)) ||
      booking.recoveryStatus !== "none" || booking.reconciliationRequired === true) fail();
  // Existence and immutable linkage, rather than a mutable payment/provider status,
  // establish committed submission. "pending_provider_approval" is a created booking.
  const requests = await Promise.all(booking.providerRequestIds.map(id =>
    transaction.get(firestore.collection("providerRequests").doc(id))));
  for (const selection of envelope.selections) {
    const rows = requests.filter(row => {
      const data = row.data();
      return row.exists && data?.customerId === uid && data.bookingId === bookingId &&
        data.mainEventId === bookingId && data.providerRequestId === row.id &&
        data.providerId === selection.providerId;
    });
    if (rows.length !== 1) fail();
    const data = rows[0].data()!;
    if ("serviceId" in selection ? data.serviceId !== selection.serviceId :
      data.packageId !== selection.packageId) fail();
  }
  return bookingId;
}
