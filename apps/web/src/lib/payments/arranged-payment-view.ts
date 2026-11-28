type StoredRecord = Readonly<Record<string, unknown>>;

export type ArrangedPaymentView = {
  id: string;
  status: "offered" | "accepted" | "declined" | "withdrawn";
  grossInCentavos: number;
  upfrontInCentavos: number;
  initialDueAt: string;
  balanceDueAt: string;
};

export function arrangedPaymentView(value: unknown): ArrangedPaymentView | null {
  if (!value || typeof value !== "object") return null;
  const offer = value as StoredRecord;
  const date = (value: unknown) => {
    try {
      const parsed = typeof value === "string" ? new Date(value) :
        (value as {toDate?: () => Date} | null)?.toDate?.();
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    } catch { return null; }
  };
  const initialDueAt = date(offer.initialDueAt), balanceDueAt = date(offer.balanceDueAt);
  const {id, status, grossInCentavos, upfrontInCentavos} = offer;
  if (offer.schemaVersion !== 1 || typeof id !== "string" ||
      (status !== "offered" && status !== "accepted" && status !== "declined" && status !== "withdrawn") ||
      typeof grossInCentavos !== "number" || !Number.isSafeInteger(grossInCentavos) ||
      typeof upfrontInCentavos !== "number" || !Number.isSafeInteger(upfrontInCentavos) ||
      upfrontInCentavos < 100 || grossInCentavos - upfrontInCentavos < 100 ||
      !initialDueAt || !balanceDueAt || initialDueAt >= balanceDueAt) return null;
  return {id, status, grossInCentavos, upfrontInCentavos, initialDueAt, balanceDueAt};
}
