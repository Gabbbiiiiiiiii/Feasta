import {createHash} from "node:crypto";
import {isApprovedProviderForOperations, isProviderOwnerAccountActive} from "../shared/constants.js";

type Data = Readonly<Record<string, unknown>>;
export const TRANSPORT_VERIFICATION_TTL_MS = 15 * 60 * 1000;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function providerTransportOwnerEligible(providerId: string, account: Data, provider: Data, owner: Data): boolean {
  const accountType = provider.businessRegistrationType === "registered_business" ? "merchant" :
    provider.businessRegistrationType === "individual" ? "consumer" : null;
  return isApprovedProviderForOperations(provider) && provider.ownerId === account.ownerId &&
    accountType !== null && account.linkedAccountType === accountType && isProviderOwnerAccountActive(providerId, owner);
}

/** Bind evidence to canonical account identity/status, not a client readiness flag. */
export function transportAccountFingerprint(account: Data): string {
  return digest(["providerId", "ownerId", "paymongoAccountId", "linkedAccountType", "invitationId",
    "setupStatus", "payoutReady", "activationStatus", "relationshipId", "relationshipStatus",
    "relationshipVerificationStatus", "livemode"].map(key => account[key] ?? null));
}
export function transportSettingsFingerprint(settings: Data): string {
  const destination = settings.providerDisbursementTestDestination as Data | undefined;
  return digest([settings.providerDisbursementTestMode, settings.providerDisbursementTestWalletId,
    settings.providerDisbursementTestAllowedDisbursementId,
    ...["number", "name", "bic", "provider", "livemode"].map(key => destination?.[key] ?? null)]);
}
export function freshTransportVerification(account: Data, nowMs = Date.now()): boolean {
  const proof = account.settlementTransportVerification as Data | undefined;
  return !!proof && proof.schemaVersion === 1 && proof.livemode === false &&
    account.livemode === false && proof.accountFingerprint === transportAccountFingerprint(account) &&
    proof.providerId === account.providerId && proof.childAccountId === account.paymongoAccountId &&
    proof.relationshipId === account.relationshipId && account.relationshipVerificationStatus === "verified" &&
    typeof proof.walletId === "string" && /^wallet_[A-Za-z0-9_-]{3,200}$/u.test(proof.walletId) &&
    typeof proof.merchantId === "string" && /^org_[A-Za-z0-9_-]{3,200}$/u.test(proof.merchantId) &&
    typeof proof.disbursementId === "string" && /^[A-Za-z0-9_-]{1,220}$/u.test(proof.disbursementId) &&
    typeof proof.settingsFingerprint === "string" && /^[a-f0-9]{64}$/u.test(proof.settingsFingerprint) &&
    Number.isSafeInteger(proof.amountInCentavos) && Number(proof.amountInCentavos) > 0 &&
    Number.isSafeInteger(proof.verifiedAtMs) && Number.isSafeInteger(proof.expiresAtMs) &&
    Number(proof.verifiedAtMs) <= nowMs && nowMs < Number(proof.expiresAtMs) &&
    Number(proof.expiresAtMs) > Number(proof.verifiedAtMs) &&
    Number(proof.expiresAtMs) - Number(proof.verifiedAtMs) <= TRANSPORT_VERIFICATION_TTL_MS;
}
export function invalidateProviderTransport(reason: string) {
  return {settlementTransportReady: false, settlementTransportMode: "disabled",
    settlementTransportVerification: null, settlementTransportVerificationRequestId: null,
    settlementTransportInvalidationReason: reason};
}
