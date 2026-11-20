/**
 * Provider-facing money is customer gross minus trusted FEASTA commission.
 * Prefer accrued commission after payment; otherwise use frozen snapshot total.
 */
export function providerNetPesosFromRequestData(
  data: Readonly<Record<string, unknown>>,
  grossPesos: number,
): {
  providerNetPesos: number;
  commissionPesos: number;
  grossPesos: number;
} {
  const grossCentavos = Number.isSafeInteger(data.grossSettledAmountInCentavos)
    ? (data.grossSettledAmountInCentavos as number)
    : Math.round(Math.max(0, grossPesos) * 100);

  const snapshot =
    data.financialSnapshot &&
    typeof data.financialSnapshot === "object" &&
    !Array.isArray(data.financialSnapshot)
      ? (data.financialSnapshot as Record<string, unknown>)
      : null;

  const commissionCentavos = Number.isSafeInteger(data.commissionAccruedInCentavos)
    ? (data.commissionAccruedInCentavos as number)
    : Number.isSafeInteger(snapshot?.platformCommissionTotalInCentavos)
      ? (snapshot?.platformCommissionTotalInCentavos as number)
      : 0;

  const safeCommission = Math.max(
    0,
    Math.min(commissionCentavos, Math.max(0, grossCentavos)),
  );
  const netCentavos = Math.max(0, grossCentavos - safeCommission);

  return {
    grossPesos: grossCentavos / 100,
    commissionPesos: safeCommission / 100,
    providerNetPesos: netCentavos / 100,
  };
}
