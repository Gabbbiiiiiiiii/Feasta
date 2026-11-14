import {applyProviderDisbursementEvidence} from "./provider-disbursement-execution.js";
import {normalizePayMongoTransfer} from "./paymongo-disbursement-client.js";
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
  if (evidence.status !== expectedStatus || typeof evidence.reference_number !== "string" ||
      !/^pd_[a-f0-9]{40}$/u.test(evidence.reference_number)) throw new Error("Transfer event linkage invalid.");
  // Reference is generated deterministically by FEASTA, not browser metadata.
  return applyProviderDisbursementEvidence(evidence.reference_number, evidence);
}
