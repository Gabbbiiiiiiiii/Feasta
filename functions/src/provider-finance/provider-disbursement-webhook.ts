import {applyProviderDisbursementEvidence} from "./provider-disbursement-execution.js";
import {normalizePayMongoTransfer} from "./paymongo-disbursement-client.js";
import {canonicalProviderTransferReference} from "./provider-disbursement-domain.js";
/** Called exclusively AFTER the existing route verifies the raw-body signature.
 * Require the standard PayMongo event envelope and full transfer evidence;
 * unknown/partial transfer payloads cannot release a reservation. */
export async function processProviderTransferWebhook(rawBody: Buffer) {
  const payload = JSON.parse(rawBody.toString("utf8"));
  const event = payload?.data;
  const attributes = event?.attributes;
  if (!["transfer.outward.successful", "transfer.outward.failed"].includes(attributes?.type)) return null;
  if (typeof event.id !== "string" || attributes.livemode !== false) throw new Error("Transfer event authority invalid.");
  const resource = attributes.data;
  if (!["transfer", "wallet_transaction"].includes(resource?.type) || !resource.attributes) {
    throw new Error("Transfer resource invalid.");
  }
  const evidence = normalizePayMongoTransfer(resource);
  const expectedStatus = attributes.type === "transfer.outward.successful" ? "succeeded" : "failed";
  const attemptId = canonicalProviderTransferReference(evidence.reference_number);
  if (evidence.status !== expectedStatus || !attemptId) throw new Error("Transfer event linkage invalid.");
  // Reference is generated deterministically by FEASTA, not browser metadata.
  return applyProviderDisbursementEvidence(attemptId, evidence);
}
