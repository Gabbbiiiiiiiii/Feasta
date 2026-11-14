const {transportAccountFingerprint, transportSettingsFingerprint, TRANSPORT_VERIFICATION_TTL_MS} =
  require("../lib/provider-finance/provider-transport-verification-domain.js");
function verifiedAccount(account, settings, amountInCentavos = 900000) {
  const result = {providerId: "provider", ownerId: "owner", linkedAccountType: "merchant",
    relationshipId: "mr_fixture", relationshipVerificationStatus: "verified", livemode: false, ...account};
  const now = Date.now();
  result.settlementTransportVerification = {schemaVersion: 1, livemode: false,
    providerId: result.providerId, childAccountId: result.paymongoAccountId,
    relationshipId: result.relationshipId, merchantId: "org_parent", walletId: settings.providerDisbursementTestWalletId,
    disbursementId: settings.providerDisbursementTestAllowedDisbursementId, amountInCentavos,
    verifiedAtMs: now, expiresAtMs: now + TRANSPORT_VERIFICATION_TTL_MS,
    accountFingerprint: transportAccountFingerprint(result), settingsFingerprint: transportSettingsFingerprint(settings)};
  return result;
}
const testSettings = {providerDisbursementTestMode: true, providerDisbursementTestWalletId: "wallet_fixture",
  providerDisbursementTestAllowedDisbursementId: "disbursement", providerDisbursementTestDestination: {
    number: "999999990002", name: "FEASTA TEST PROVIDER", bic: "UBPHPHMMXXX", provider: "instapay"}};
module.exports = {verifiedAccount, testSettings};
