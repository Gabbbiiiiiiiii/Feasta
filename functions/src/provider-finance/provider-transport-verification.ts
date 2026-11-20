import {randomUUID} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {FUNCTION_REGION} from "../shared/constants.js";
import {retrievePayMongoLinkedAccount, retrievePayMongoLinkedAccountRelationship} from "./paymongo-linked-account-client.js";
import {testDestination, TEST_WALLET_ID, retrievePayMongoTestSettlementWallet} from "./paymongo-disbursement-client.js";
import {providerDisbursementTestSecret, providerDisbursementTransport} from "./provider-disbursement-transport.js";
import {reserveProviderDisbursement} from "./provider-disbursement-execution.js";
import {invalidateProviderTransport, transportAccountFingerprint, transportSettingsFingerprint,
  TRANSPORT_VERIFICATION_TTL_MS, providerTransportOwnerEligible} from "./provider-transport-verification-domain.js";

type Data = Record<string, unknown>;
const identity = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,220}$/u.test(value)) throw new Error("Invalid verification identity.");
  return value;
};
/** All gateway dependencies are GET-only. No onboarding activation or transfer is invoked. */
export const providerTransportReaders = {
  account: retrievePayMongoLinkedAccount,
  relationship: retrievePayMongoLinkedAccountRelationship,
  wallet: retrievePayMongoTestSettlementWallet,
};

/** Internal server service; the callable accepts ONLY a disbursement identity.
 * Verification is separate from dispatch permission and requires dispatch disabled. */
export async function verifyProviderTestSettlementTransport(id: string, actorId: string,
  readers = providerTransportReaders, secretKey = providerDisbursementTestSecret.value()) {
  identity(id);
  const d = (await db.collection("providerDisbursements").doc(id).get()).data() ?? {};
  const providerId = identity(d.providerId);
  const accountRef = db.collection("providerPaymentAccounts").doc(providerId);
  const requestId = randomUUID();
  const stored = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(accountRef);
    const account = snapshot.data();
    if (!account || account.providerId !== providerId) throw new Error("Provider account unavailable.");
    // Immediately revoke old evidence; failed/overlapping verification cannot retain readiness.
    transaction.update(accountRef, {...invalidateProviderTransport("verification_pending"),
      settlementTransportVerificationRequestId: requestId, updatedAt: serverTimestamp()});
    return account as Data;
  });
  try {
    if (!/^sk_test_[A-Za-z0-9_-]+$/u.test(secretKey)) throw new Error("Test credential required.");
    const settings = (await db.collection("appSettings").doc("platform").get()).data() ?? {};
    const walletId = settings.providerDisbursementTestWalletId;
    if (settings.providerDisbursementsEnabled !== false || settings.providerDisbursementTestMode !== true ||
        settings.providerDisbursementTestAllowedDisbursementId !== id ||
        typeof walletId !== "string" || !TEST_WALLET_ID.test(walletId)) throw new Error("Test verification settings invalid.");
    testDestination(settings.providerDisbursementTestDestination);
    const settingsFingerprint = transportSettingsFingerprint(settings);
    if (stored.setupStatus !== "ready" || stored.payoutReady !== true || stored.activationStatus !== "activated" ||
        stored.relationshipStatus !== "enabled" || stored.relationshipVerificationStatus !== "verified" ||
        typeof stored.paymongoAccountId !== "string" || typeof stored.relationshipId !== "string" ||
        (stored.livemode !== undefined && stored.livemode !== false)) throw new Error("Provider account not verified.");
    // Validate locally before any gateway request; validate again atomically before activation.
    const provider = (await db.collection("providers").doc(providerId).get()).data() ?? {};
    const owner = (await db.collection("users").doc(identity(provider.ownerId)).get()).data() ?? {};
    if (!providerTransportOwnerEligible(providerId, stored, provider, owner)) throw new Error("Provider eligibility revoked.");
    const account = await readers.account({secretKey, accountId: stored.paymongoAccountId});
    const relationship = await readers.relationship({secretKey, relationshipId: stored.relationshipId});
    const wallet = await readers.wallet({secretKey, walletId});
    if (account.accountId !== stored.paymongoAccountId || account.activationStatus !== "activated" ||
        account.accountType !== stored.linkedAccountType || !relationship.enabled ||
        relationship.relationshipId !== stored.relationshipId || relationship.childAccountId !== account.accountId ||
        (relationship.linkingRequestId !== null && relationship.linkingRequestId !== stored.invitationId) ||
        wallet.walletId !== walletId || wallet.livemode !== false || wallet.status !== "activated" ||
        wallet.currency !== "PHP" || wallet.accountProvider !== "paymongo" ||
        wallet.merchantId !== relationship.parentAccountId ||
        !Number.isSafeInteger(d.amountInCentavos) || Number(d.amountInCentavos) <= 0 ||
        wallet.availableBalanceInCentavos < Number(d.amountInCentavos)) throw new Error("Gateway verification rejected.");
    const candidate = {...stored, livemode: false, settlementTransportMode: "wallet_transfer", settlementTransportReady: true};
    const verifiedAtMs = Date.now();
    const proof = {schemaVersion: 1, livemode: false, providerId, childAccountId: account.accountId,
      relationshipId: relationship.relationshipId, merchantId: wallet.merchantId, walletId,
      disbursementId: id, amountInCentavos: d.amountInCentavos,
      verifiedAtMs, expiresAtMs: verifiedAtMs + TRANSPORT_VERIFICATION_TTL_MS,
      accountFingerprint: transportAccountFingerprint(candidate), settingsFingerprint};
    await reserveProviderDisbursement(id, providerDisbursementTransport, {
      account: {...candidate, settlementTransportVerification: proof},
      expectedAccountFingerprint: transportAccountFingerprint(stored), requestId, actorId,
    });
    return {verified: true, dispatchEnabled: false, expiresAtMs: proof.expiresAtMs};
  } catch {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(accountRef);
      if (snapshot.data()?.settlementTransportVerificationRequestId !== requestId) return;
      transaction.update(accountRef, {...invalidateProviderTransport("verification_failed"),
        settlementTransportVerificationRequestId: null, updatedAt: serverTimestamp()});
    });
    throw new HttpsError("failed-precondition", "Test settlement transport verification failed; readiness remains disabled.");
  }
}

export const verifyProviderSettlementTransport = onCall({
  ...appCheckCallableOptions, secrets: [providerDisbursementTestSecret], timeoutSeconds: 90,
}, async request => {
  const actor = requireAuth(request);
  await requireRole(actor.uid, ["admin"]);
  await enforceCallableRateLimit(request, {scope: "verifyProviderSettlementTransport", limit: 10, windowSeconds: 3600});
  const data = request.data;
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).length !== 1 || typeof data.providerDisbursementId !== "string" ||
      !/^[A-Za-z0-9_-]{1,220}$/u.test(data.providerDisbursementId)) {
    throw new HttpsError("invalid-argument", "Only the disbursement identity may be supplied.");
  }
  return verifyProviderTestSettlementTransport(data.providerDisbursementId, actor.uid);
});

/** Profile/owner revocation clears persisted readiness without contacting PayMongo.
 * Reservation also checks the current documents, so trigger delivery cannot open a race. */
export async function invalidateRevokedProviderTransport(providerId: string) {
  const accountRef = db.collection("providerPaymentAccounts").doc(identity(providerId));
  await db.runTransaction(async transaction => {
    const [accountSnapshot, providerSnapshot] = await Promise.all([
      transaction.get(accountRef), transaction.get(db.collection("providers").doc(providerId)),
    ]);
    const account = accountSnapshot.data();
    if (!account || (!account.settlementTransportReady && !account.settlementTransportVerificationRequestId)) return;
    const provider = providerSnapshot.data() ?? {};
    const ownerId = typeof provider.ownerId === "string" && /^[A-Za-z0-9_-]{1,220}$/u.test(provider.ownerId) ? provider.ownerId : null;
    const owner = ownerId ? (await transaction.get(db.collection("users").doc(ownerId))).data() ?? {} : {};
    if (providerTransportOwnerEligible(providerId, account, provider, owner)) return;
    transaction.update(accountRef, {...invalidateProviderTransport("provider_eligibility_revoked"), updatedAt: serverTimestamp()});
  });
}

export const invalidateProviderTransportOnProfileChange = onDocumentWritten({
  document: "providers/{providerId}", region: FUNCTION_REGION,
}, async event => {await invalidateRevokedProviderTransport(event.params.providerId);});

export const invalidateProviderTransportOnOwnerChange = onDocumentWritten({
  document: "users/{userId}", region: FUNCTION_REGION,
}, async event => {
  const ids = new Set([event.data?.before.data()?.providerId, event.data?.after.data()?.providerId]);
  for (const id of ids) if (typeof id === "string" && /^[A-Za-z0-9_-]{1,220}$/u.test(id)) {
    await invalidateRevokedProviderTransport(id);
  }
});
