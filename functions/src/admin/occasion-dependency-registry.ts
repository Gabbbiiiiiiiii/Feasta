/**
 * FEASTA Occasion Dependency Registry — local contract v1.
 *
 * This module performs no Firestore operations.
 * An entry establishes a claimed source relationship, NOT complete coverage.
 * No caller may use an empty registry to authorize deactivation.
 */

export type OccasionDependencyKind =
  "package" | "submitted_booking";

export interface OccasionDependencyEntry {
  schemaVersion: 1;
  kind: OccasionDependencyKind;
  occasionId: string;
  sourceId: string;
  sourcePath: string;
}

export type MainEventRegistryClassification =
  "customer_draft" | "submitted_booking" | "unresolved";

const OCCASION_ID = /^[a-z][a-z0-9_]{1,63}$/u;
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const FINGERPRINT = /^[a-f0-9]{64}$/u;

const DRAFT_FIELDS = new Set([
  "customerId", "status", "createdAt", "updatedAt",
  "isDeleted", "eventType", "eventDate", "eventTime",
  "eventEndTime", "guestCount", "eventLocation",
  "eventAddress", "specialRequest", "selectedFoods",
  "selectedDecorations", "selectedFurniture",
  "willArrangeOwnAddOns", "customerArrangedAddOnsNote",
]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value);
}

export function validOccasionDependencyEntry(
  value: unknown,
): value is OccasionDependencyEntry {
  if (!record(value) ||
      value.schemaVersion !== 1 ||
      (value.kind !== "package" && value.kind !== "submitted_booking") ||
      typeof value.occasionId !== "string" ||
      !OCCASION_ID.test(value.occasionId) ||
      typeof value.sourceId !== "string" ||
      !DOCUMENT_ID.test(value.sourceId)) {
    return false;
  }

  const collection = value.kind === "package" ?
    "packages" : "mainEvents";

  return value.sourcePath === `${collection}/${value.sourceId}`;
}

export function occasionDependencyEntryPath(
  value: OccasionDependencyEntry,
): string {
  if (!validOccasionDependencyEntry(value)) {
    throw new Error("OCCASION_DEPENDENCY_ENTRY_INVALID");
  }

  return `occasionDependencies/${value.occasionId}/entries/` +
    `${value.kind}_${value.sourceId}`;
}

/**
 * Conservative local classification.
 *
 * This does not attest historical completeness or source authenticity.
 * A known submitted-booking shape is still verified against its actual
 * mainEvent and linked providerRequests by the Admin dependency checker.
 */
export function classifyMainEventForRegistry(
  documentId: string,
  value: unknown,
): MainEventRegistryClassification {
  if (!DOCUMENT_ID.test(documentId) || !record(value)) {
    return "unresolved";
  }

  if (value.status === "draft") {
    if (value.isDeleted === true ||
        typeof value.customerId !== "string" ||
        !Object.keys(value).every((key) => DRAFT_FIELDS.has(key)) ||
        value.bookingId !== undefined ||
        value.mainEventId !== undefined ||
        value.providerRequestIds !== undefined ||
        value.submissionFingerprint !== undefined) {
      return "unresolved";
    }
    return "customer_draft";
  }

  if (typeof value.eventType !== "string" ||
      !OCCASION_ID.test(value.eventType) ||
      value.bookingId !== documentId ||
      value.mainEventId !== documentId ||
      typeof value.bookingCode !== "string" ||
      !/^BK-[A-Z0-9]{10}$/u.test(value.bookingCode) ||
      typeof value.submissionFingerprint !== "string" ||
      !FINGERPRINT.test(value.submissionFingerprint) ||
      !Array.isArray(value.providerRequestIds) ||
      value.providerRequestIds.length === 0 ||
      !value.providerRequestIds.every((id: unknown) =>
        typeof id === "string" && DOCUMENT_ID.test(id)) ||
      new Set(value.providerRequestIds).size !==
        value.providerRequestIds.length ||
      !Number.isSafeInteger(value.providerRequestCount) ||
      value.providerRequestCount !== value.providerRequestIds.length ||
      value.submittedAt === undefined ||
      value.status === undefined) {
    return "unresolved";
  }

  return "submitted_booking";
}
