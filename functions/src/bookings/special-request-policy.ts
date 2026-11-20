/** Internal workflow statuses. Booking and payment states are tracked separately. */
export type SpecialRequestStatus =
  | "pending_review"
  | "needs_clarification"
  | "quotation_sent"
  | "revision_requested"
  | "quotation_accepted"
  | "converted_to_booking"
  | "declined"
  | "cancelled"
  | "expired";

const transitions = {
  provider: {
    requestClarification: { pending_review: "needs_clarification", revision_requested: "needs_clarification" },
    sendQuotation: { pending_review: "quotation_sent", revision_requested: "quotation_sent" },
    decline: { pending_review: "declined", needs_clarification: "declined", revision_requested: "declined" },
  },
  customer: {
    clarify: { needs_clarification: "pending_review" },
    requestRevision: { quotation_sent: "revision_requested" },
    accept: { quotation_sent: "quotation_accepted" },
    decline: { quotation_sent: "declined" },
    cancel: { pending_review: "cancelled", needs_clarification: "cancelled", quotation_sent: "cancelled", revision_requested: "cancelled" },
  },
  system: {
    convert: { quotation_accepted: "converted_to_booking" },
    expire: { pending_review: "expired", needs_clarification: "expired", quotation_sent: "expired", revision_requested: "expired" },
  },
} satisfies Record<string, Record<string, Partial<Record<SpecialRequestStatus, SpecialRequestStatus>>>>;

type Actor = keyof typeof transitions;

type QuotationVersion = {
  latest: number;
  submitted: number;
  expiresAtMs: number;
};

const quotationActions = new Set(["accept", "decline", "requestRevision"]);

export function nextSpecialRequestStatus(
  status: SpecialRequestStatus,
  actor: Actor,
  action: string,
  nowMs: number,
  quotation?: QuotationVersion,
): SpecialRequestStatus | null {
  const allowed: Record<string, Partial<Record<SpecialRequestStatus, SpecialRequestStatus>>> =
    transitions[actor];
  if (!Object.hasOwn(allowed, action)) return null;

  if (actor === "customer" && quotationActions.has(action)) {
    if (!quotation || !Number.isSafeInteger(quotation.latest) || quotation.latest < 1 ||
        quotation.submitted !== quotation.latest || !Number.isFinite(quotation.expiresAtMs) ||
        !Number.isFinite(nowMs) || nowMs >= quotation.expiresAtMs) {
      return null;
    }
  }

  const byStatus = allowed[action];
  return byStatus && Object.hasOwn(byStatus, status) ? byStatus[status] ?? null : null;
}

export const MAX_SPECIAL_REQUEST_QUANTITY = 100;

export function specialRequestPackageSubtotal(
  unitAmountInCentavos: number,
  quantity: unknown,
): number | null {
  if (typeof quantity !== "number" || !Number.isInteger(quantity) ||
      quantity < 1 || quantity > MAX_SPECIAL_REQUEST_QUANTITY ||
      !Number.isSafeInteger(unitAmountInCentavos) || unitAmountInCentavos < 0) {
    return null;
  }

  const subtotal = unitAmountInCentavos * quantity;
  return Number.isSafeInteger(subtotal) ? subtotal : null;
}

/** Older delivery requests remain eligible for a new all-inclusive quote. */
export function isDropOffSpecialRequest(request: Readonly<Record<string, unknown>>): boolean {
  return request.serviceTier === "drop_off" && request.eventEndTime == null &&
    (request.fulfillment == null || request.fulfillment === "delivery") &&
    typeof request.address === "string" && request.address.trim().length > 0;
}

export function dropOffSpecialRequestUnitPrice(packageData: Readonly<Record<string, unknown>>, providerType: unknown): number | null {
  if (providerType !== "catering" && providerType !== "both") return null;
  const option = (packageData.serviceOptions as {drop_off?: {price?: unknown; enabled?: boolean}} | undefined)?.drop_off;
  if (option?.enabled === false || typeof option?.price !== "number") return null;
  const cents = Math.round(option.price * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function specialOfferTotalIsValid(offer: Readonly<Record<string, unknown>>): boolean {
  const subtotal = offer.subtotalInCentavos;
  const total = offer.totalInCentavos;
  const legacyFee = offer.feeInCentavos;
  if (typeof subtotal !== "number" || !Number.isSafeInteger(subtotal) || subtotal <= 0 ||
      typeof total !== "number" || !Number.isSafeInteger(total)) return false;
  if (offer.deliveryIncluded === true) return legacyFee === undefined && total === subtotal;
  return typeof legacyFee === "number" && Number.isSafeInteger(legacyFee) &&
    legacyFee >= 0 && total === subtotal + legacyFee;
}
