export type PaymentDemoEvidence = {
  amountInCentavos: number;
  transferId: string;
  gatewayReference: string;
};

/** Display-only receipt validation. This result never authorizes a payment or changes accounting. */
export function parsePaymentDemoEvidence(value: unknown): PaymentDemoEvidence | null {
  if (!value || typeof value !== "object") return null;
  const receipt = value as Record<string, unknown>;
  const attempt = receipt.attempt as Record<string, unknown> | undefined;
  const evidence = receipt.evidence as Record<string, unknown> | undefined;
  if (receipt.schemaVersion !== 1 || receipt.testOnly !== true || receipt.canonicalAccountingChanged !== false ||
      receipt.status !== "confirmed_test_success" || !attempt || !evidence || attempt.livemode !== false ||
      evidence.livemode !== false || evidence.status !== "succeeded" || evidence.currency !== "PHP" ||
      !Number.isSafeInteger(evidence.amount) || Number(evidence.amount) <= 0 || evidence.amount !== attempt.amountInCentavos ||
      typeof attempt.providerDisbursementId !== "string" || !attempt.providerDisbursementId.startsWith("feasta_demo_") ||
      typeof evidence.id !== "string" || !/^tr_[A-Za-z0-9_-]{1,200}$/u.test(evidence.id) || evidence.id !== attempt.gatewayResourceId ||
      typeof attempt.referenceNumber !== "string" || !/^pd_[a-f0-9]{40}$/u.test(attempt.referenceNumber) ||
      typeof evidence.reference_number !== "string" || !/^pd[_-][a-f0-9]{40}$/u.test(evidence.reference_number) ||
      evidence.reference_number.slice(3) !== attempt.referenceNumber.slice(3)) return null;
  return {amountInCentavos: Number(evidence.amount), transferId: evidence.id, gatewayReference: evidence.reference_number};
}
