import {customerInitialPaymentEligibility, customerInitialPaymentExplanation} from "@/lib/customer/bookings/customer-booking-initial-payment-eligibility";

export type ProviderInitialPaymentPresentation = {
  kind: "full" | "minimum" | "unavailable";
  amount: number | null;
  explanation: string;
};
export const unavailableProviderInitialPayment: ProviderInitialPaymentPresentation = {
  kind: "unavailable", amount: null,
  explanation: "Saved initial-payment eligibility is unavailable. The customer's payment options cannot be determined from the original package terms.",
};

/** Read-only projection of frozen evidence. Never infer eligibility from a clock or package terms. */
export function providerInitialPaymentPresentation(data: Readonly<Record<string, unknown>>): ProviderInitialPaymentPresentation {
  if (data.type === "addon") {
    const addonPayment = fullPaymentAddonPresentation(data);
    if (addonPayment.kind === "unavailable") return addonPayment;
    // External add-ons freeze the agreement without separate eligibility fields.
    // Any supplied eligibility must still pass the existing canonical checks below.
    if (data.initialPaymentEligibility === undefined && data.initialPaymentEligibilitySchemaVersion === undefined) {
      return addonPayment;
    }
  }
  const eligibility = customerInitialPaymentEligibility(data);
  if (eligibility.kind !== "canonical" || data.initialPaymentEligibilitySchemaVersion !== 2) return unavailableProviderInitialPayment;
  const agreement = record(data.bookingPaymentAgreement);
  const frozenEligibility = record(data.initialPaymentEligibility);
  if (!agreement || !frozenEligibility || agreement.schemaVersion !== 1 || agreement.timingSchemaVersion !== 3 ||
    agreement.channel !== "booking_submission" || agreement.initialPaymentEligibilitySchemaVersion !== 2 ||
    agreement.depositEligible !== (eligibility.mode === "minimum_or_full") || agreement.eligibilityReason !== eligibility.reason ||
    !validAmounts(agreement)) return unavailableProviderInitialPayment;
  const submittedAt = savedTime(frozenEligibility.submittedAt);
  const eventStartAt = savedTime(frozenEligibility.eventStartAt);
  if (submittedAt === null || eventStartAt === null || savedTime(frozenEligibility.evaluatedAt) !== submittedAt ||
    savedTime(agreement.agreedAt) !== submittedAt || savedTime(agreement.eventStartAt) !== eventStartAt) return unavailableProviderInitialPayment;
  const gross = agreement.grossAmountInCentavos;
  const upfront = agreement.requiredUpfrontAmountInCentavos;
  if (eligibility.mode === "full_only" && (upfront !== gross || agreement.remainingBalanceInCentavos !== 0)) {
    return unavailableProviderInitialPayment;
  }
  // Acceptance snapshots retain nominal package upfront terms. Full-only eligibility
  // can require more upfront than that snapshot while preserving the same gross.
  if (data.financialSnapshot !== undefined) {
    const snapshot = record(data.financialSnapshot);
    if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.currency !== "PHP" || !validAmounts(snapshot) ||
      snapshot.grossAmountInCentavos !== gross ||
      (eligibility.mode === "minimum_or_full" && snapshot.requiredUpfrontAmountInCentavos !== upfront)) {
      return unavailableProviderInitialPayment;
    }
  }
  if (eligibility.mode === "minimum_or_full") {
    if (upfront <= 0 || upfront >= gross) return unavailableProviderInitialPayment;
    return {kind: "minimum", amount: upfront / 100,
      explanation: "The customer may choose the minimum deposit or full payment."};
  }
  const explanation = eligibility.reason === "short_notice" && data.initialPaymentEligibilitySchemaVersion === 2
    ? "Full payment is required because the booking was submitted fewer than 72 hours before the event."
    : customerInitialPaymentExplanation(data) ?? "Full payment is required under this booking's saved payment eligibility.";
  return {kind: "full", amount: gross / 100, explanation};
}

/** Resolve catering evidence only from the matching, canonical parent lineup. */
export function cateringPaymentPresentation(data: StoredRecord, requestId: string, parentId: string, parent: StoredRecord | null): ProviderInitialPaymentPresentation {
  if (data.type !== "catering") return providerInitialPaymentPresentation(data);
  const fail = unavailableProviderInitialPayment;
  const agreement = record(parent?.bookingPaymentAgreement);
  if (!parent || !agreement || data.mainEventId !== parentId ||
    (data.bookingId !== undefined && data.bookingId !== parentId) ||
    (data.providerRequestId !== undefined && data.providerRequestId !== requestId) ||
    typeof data.customerId !== "string" || !data.customerId || parent.customerId !== data.customerId ||
    typeof data.providerId !== "string" || !data.providerId || parent.providerId !== data.providerId ||
    (parent.currentProviderId !== undefined && parent.currentProviderId !== data.providerId) ||
    (parent.mainEventId !== undefined && parent.mainEventId !== parentId) ||
    (parent.bookingId !== undefined && parent.bookingId !== parentId) ||
    !Array.isArray(parent.providerRequestIds) || !parent.providerRequestIds.includes(requestId) ||
    agreement.customerId !== data.customerId || agreement.providerId !== data.providerId ||
    typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0 ||
    Math.round(data.amount * 100) !== agreement.grossAmountInCentavos) return fail;
  if (data.bookingPaymentAgreement !== undefined && !sameEvidence(data.bookingPaymentAgreement, agreement)) return fail;
  if (parent.initialPaymentEligibilitySchemaVersion !== data.initialPaymentEligibilitySchemaVersion ||
    !sameEvidence(parent.initialPaymentEligibility, data.initialPaymentEligibility)) return fail;
  const eligibility = record(data.initialPaymentEligibility);
  const submittedAt = savedTime(eligibility?.submittedAt), eventStartAt = savedTime(eligibility?.eventStartAt);
  if (submittedAt === null || eventStartAt === null || submittedAt >= eventStartAt ||
    (eligibility?.reason === "short_notice" && eventStartAt - submittedAt >= 72 * 3600000) ||
    (eligibility?.reason === "deposit_eligible" && eventStartAt - submittedAt < 72 * 3600000)) return fail;
  for (const evidence of [data, parent]) {
    for (const field of ["eventStartAt", "depositEligibilityCutoffAt", "remainingBalanceDueAt", "hardPaymentDeadlineAt", "preparationStartsAt"] as const) {
      if (evidence[field] !== undefined && (savedTime(evidence[field]) === null ||
        savedTime(evidence[field]) !== savedTime(agreement[field]))) return fail;
    }
  }
  const projected = {...data, bookingPaymentAgreement: agreement};
  if (!consistentOriginalAmounts(projected, data.financialSnapshot === undefined ? undefined : record(data.financialSnapshot) ?? undefined)) return fail;
  return providerInitialPaymentPresentation(projected);
}

function sameEvidence(left: unknown, right: unknown): boolean {
  const leftTime = savedTime(left), rightTime = savedTime(right);
  if (leftTime !== null || rightTime !== null) return leftTime !== null && leftTime === rightTime;
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => sameEvidence(value, right[index]));
  const a = record(left), b = record(right);
  return !!a && !!b && Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(key => Object.hasOwn(b, key) && sameEvidence(a[key], b[key]));
}

type StoredRecord = Readonly<Record<string, unknown>>;

function fullPaymentAddonPresentation(data: StoredRecord): ProviderInitialPaymentPresentation {
  const agreement = record(data.bookingPaymentAgreement);
  if (!agreement || agreement.schemaVersion !== 1 || agreement.timingSchemaVersion !== 3 ||
    agreement.channel !== "booking_submission" || agreement.initialPaymentEligibilitySchemaVersion !== 2 ||
    record(agreement.paymentPolicy)?.paymentPolicy !== "full_payment" || agreement.depositEligible !== false ||
    agreement.eligibilityReason !== "package_full_payment" || !validAmounts(agreement) ||
    agreement.requiredUpfrontAmountInCentavos !== agreement.grossAmountInCentavos || agreement.remainingBalanceInCentavos !== 0 ||
    savedTime(agreement.agreedAt) === null || savedTime(agreement.eventStartAt) === null) return unavailableProviderInitialPayment;
  for (const field of ["customerId", "providerId"] as const) {
    if (typeof agreement[field] !== "string" || !agreement[field].trim() ||
      (data[field] !== undefined && data[field] !== agreement[field])) return unavailableProviderInitialPayment;
  }
  if (data.amount !== undefined && (typeof data.amount !== "number" || !Number.isFinite(data.amount) ||
    data.amount <= 0 || Math.round(data.amount * 100) !== agreement.grossAmountInCentavos)) return unavailableProviderInitialPayment;
  if (data.remainingBalanceTimingSchemaVersion !== undefined && data.remainingBalanceTimingSchemaVersion !== 3) return unavailableProviderInitialPayment;
  for (const field of ["eventStartAt", "depositEligibilityCutoffAt", "remainingBalanceDueAt", "hardPaymentDeadlineAt", "preparationStartsAt"] as const) {
    if (data[field] !== undefined && (savedTime(data[field]) === null ||
      savedTime(data[field]) !== savedTime(agreement[field]))) return unavailableProviderInitialPayment;
  }
  // Compare the saved Manila event date/clock when present; no current-time decision.
  const eventStart = new Date(savedTime(agreement.eventStartAt)!);
  const localDay = (date: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  if (data.eventDate !== undefined) {
    const eventDate = savedTime(data.eventDate);
    if (eventDate === null || localDay(new Date(eventDate)) !== localDay(eventStart)) return unavailableProviderInitialPayment;
  }
  const localClock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(eventStart);
  if ((data.eventTime !== undefined && data.eventTime !== localClock) ||
    (data.eventEndTime !== undefined && data.eventEndTime !== agreement.eventEndTime)) return unavailableProviderInitialPayment;
  if (data.financialSnapshot !== undefined) {
    const snapshot = record(data.financialSnapshot);
    if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.currency !== "PHP" || !validAmounts(snapshot) ||
      snapshot.grossAmountInCentavos !== agreement.grossAmountInCentavos ||
      !consistentOriginalAmounts(data, snapshot)) {
      return unavailableProviderInitialPayment;
    }
  }
  if (!consistentOriginalAmounts(data)) return unavailableProviderInitialPayment;
  return {kind: "full", amount: agreement.grossAmountInCentavos / 100,
    explanation: "Full payment is required under this booking's saved payment eligibility."};
}

/** Original service amounts describe nominal terms, not the required customer payment. */
function consistentOriginalAmounts(data: StoredRecord, snapshot?: StoredRecord): boolean {
  const gross = record(data.bookingPaymentAgreement)?.grossAmountInCentavos;
  const amounts: number[] = [];
  for (const [field, snapshotField] of [
    ["downPaymentAmount", "requiredUpfrontAmountInCentavos"],
    ["remainingBalance", "remainingBalanceInCentavos"],
  ] as const) {
    const value = data[field];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      !Number.isSafeInteger(Math.round(value * 100))) return false;
    const centavos = Math.round(value * 100);
    if (typeof gross !== "number" || centavos > gross ||
      (field === "downPaymentAmount" && centavos === 0) ||
      (snapshot && centavos !== snapshot[snapshotField])) return false;
    amounts.push(centavos);
  }
  return amounts.length !== 2 || amounts[0] + amounts[1] === gross;
}

function record(value: unknown): StoredRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as StoredRecord : null;
}

function validAmounts(value: StoredRecord): value is StoredRecord & {
  grossAmountInCentavos: number; requiredUpfrontAmountInCentavos: number; remainingBalanceInCentavos: number;
} {
  const gross = value.grossAmountInCentavos;
  const upfront = value.requiredUpfrontAmountInCentavos;
  const balance = value.remainingBalanceInCentavos;
  return typeof gross === "number" && Number.isSafeInteger(gross) && gross > 0 &&
    typeof upfront === "number" && Number.isSafeInteger(upfront) && upfront > 0 && upfront <= gross &&
    typeof balance === "number" && Number.isSafeInteger(balance) && balance >= 0 && upfront + balance === gross;
}

/** Compare saved evidence only, never evaluate eligibility against the current time. */
function savedTime(value: unknown): number | null {
  try {
    const stored = record(value);
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) :
      typeof stored?.toDate === "function" ? stored.toDate() : null;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  } catch {
    return null;
  }
}
