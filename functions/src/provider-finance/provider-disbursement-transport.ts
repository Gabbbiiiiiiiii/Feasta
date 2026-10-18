import type {TransferEvidence} from "./provider-disbursement-domain.js";
import {defineSecret} from "firebase-functions/params";
import {providerSettlementCapability} from "./provider-settlement-capability.js";
import {
  createPayMongoDisbursementClient, testDestination, TEST_WALLET_ID,
} from "./paymongo-disbursement-client.js";
type Data = Record<string, unknown>;
const DISBURSEMENT_ID = /^[A-Za-z0-9_-]{1,220}$/u;
export function isProviderDisbursementTestAllowed(settings: Data, id: unknown): boolean {
  if (settings.providerDisbursementTestMode !== true) return true;
  const allowed = settings.providerDisbursementTestAllowedDisbursementId;
  return typeof allowed === "string" && DISBURSEMENT_ID.test(allowed) && allowed === id;
}
export type DisbursementTransportCapability =
  | {ready: false; reason: string}
  | {ready: true; transportMode: "wallet_transfer" | "workflow"; destinationSnapshot: Data};
/** Server-only boundary. No HTTP or live credentials belong in the finance domain. */
export interface ProviderDisbursementTransport {
  capability(account: Data, settings: Data): DisbursementTransportCapability;
  dispatch(attempt: Data): Promise<TransferEvidence | null>;
  retrieve(attempt: Data): Promise<TransferEvidence | null>;
}
export const providerDisbursementTestSecret = defineSecret("PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY");
const client = createPayMongoDisbursementClient({
  secretKey: () => providerDisbursementTestSecret.value(),
});
/** Server-owned simulator harness. org_* remains readiness evidence, never a bank destination. */
export const providerDisbursementTransport: ProviderDisbursementTransport = {
  capability: (account, settings) => {
    const capability = providerSettlementCapability(account);
    if (!capability.transportReady) return {ready: false, reason: "provider_" + capability.reason};
    if (account.livemode !== undefined && account.livemode !== false) {
      return {ready: false, reason: "paymongo_test_account_required"};
    }
    if (capability.transportMode !== "wallet_transfer") {
      return {ready: false, reason: "paymongo_test_transport_mode_mismatch"};
    }
    if (settings.providerDisbursementTestMode !== true) {
      return {ready: false, reason: "paymongo_test_mode_required"};
    }
    const allowedDisbursementId = settings.providerDisbursementTestAllowedDisbursementId;
    if (typeof allowedDisbursementId !== "string" || !DISBURSEMENT_ID.test(allowedDisbursementId)) {
      return {ready: false, reason: "paymongo_test_disbursement_allowlist_invalid"};
    }
    const walletId = settings.providerDisbursementTestWalletId;
    if (typeof walletId !== "string" || !TEST_WALLET_ID.test(walletId)) {
      return {ready: false, reason: "paymongo_test_wallet_configuration_invalid"};
    }
    try {
      const {provider, ...destinationAccount} = testDestination(
        settings.providerDisbursementTestDestination,
      );
      return {ready: true, transportMode: "wallet_transfer",
        destinationSnapshot: {
          testMode: true, livemode: false, allowedDisbursementId, walletId, provider, destinationAccount,
        }};
    } catch {
      return {ready: false, reason: "paymongo_test_destination_configuration_invalid"};
    }
  },
  dispatch: attempt => client.dispatch(attempt),
  // Legacy P13-B reservations have no simulator snapshot: retain locks without issuing HTTP.
  retrieve: attempt => (attempt.destinationSnapshot as Data | undefined)?.testMode === true ?
    client.retrieve(attempt) : Promise.resolve(null),
};
