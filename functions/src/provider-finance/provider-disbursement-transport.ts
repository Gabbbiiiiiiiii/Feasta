import type {TransferEvidence} from "./provider-disbursement-domain.js";
type Data = Record<string, unknown>;
export type DisbursementTransportCapability =
  | {ready: false; reason: string}
  | {ready: true; transportMode: "wallet_transfer" | "workflow"; destinationSnapshot: Data};
/** Server-only boundary. No HTTP or live credentials belong in the finance domain. */
export interface ProviderDisbursementTransport {
  capability(account: Data, settings: Data): DisbursementTransportCapability;
  dispatch(attempt: Data): Promise<TransferEvidence | null>;
  retrieve(attempt: Data): Promise<TransferEvidence | null>;
}
/** Existing account records contain org IDs, not verified v2 transfer bank
 * destinations/source accounts. Never infer those identifiers from org IDs.
 * This adapter deliberately performs no external requests until the account
 * provisioning contract has been implemented and verified in test mode.
 */
export const providerDisbursementTransport: ProviderDisbursementTransport = {
  capability: () => ({ready: false, reason: "paymongo_verified_transfer_source_and_destination_missing"}),
  dispatch: async () => { throw new Error("paymongo_verified_transfer_source_and_destination_missing"); },
  retrieve: async () => null,
};
