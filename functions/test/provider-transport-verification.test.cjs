const test = require("node:test"), assert = require("node:assert/strict");
const {initializeApp, getApps} = require("firebase-admin/app");
if (!getApps().length) initializeApp({projectId: "demo-feasta"});
const {Timestamp} = require("firebase-admin/firestore");
const {db} = require("../lib/shared/firestore.js");
const authority = require("../lib/payments/provider-request-payment-reader.js");
const activation = require("../lib/provider-finance/provider-transport-verification.js");
const {providerSettlementCapability} = require("../lib/provider-finance/provider-settlement-capability.js");
const {providerDisbursementTransport} = require("../lib/provider-finance/provider-disbursement-transport.js");
const execution = require("../lib/provider-finance/provider-disbursement-execution.js");
const {fixture} = require("./provider-disbursement-fixtures.cjs");
const {testSettings, verifiedAccount} = require("./provider-transport-fixtures.cjs");
const originalCollection = db.collection.bind(db), originalTransaction = db.runTransaction.bind(db);
const originalAuthority = authority.readTrustedProviderRequestPaymentSetInTransaction;
const authorization = require("../lib/shared/authorization.js"), originalRole = authorization.requireRole;
const rateLimit = require("../lib/shared/rate-limit.js"), originalRateLimit = rateLimit.enforceCallableRateLimit;
const linked = require("../lib/provider-finance/paymongo-linked-account-client.js"), originalAccountRead = linked.retrievePayMongoLinkedAccount;
const originalFetch = global.fetch;
test.afterEach(() => {db.collection = originalCollection; db.runTransaction = originalTransaction;
  authority.readTrustedProviderRequestPaymentSetInTransaction = originalAuthority;
  authorization.requireRole = originalRole; rateLimit.enforceCallableRateLimit = originalRateLimit;
  linked.retrievePayMongoLinkedAccount = originalAccountRead; global.fetch = originalFetch;});

function harness() {
  const f = fixture(), anchor = Timestamp.fromMillis(1);
  const records = new Map([
    ["providerDisbursements/disbursement", {...f.disbursement, trigger: "completed_booking",
      sourcePaymentIds: ["deposit", "balance"], completedBookingAt: anchor, payoutEligibleAt: anchor}],
    ["appSettings/platform", {...structuredClone(testSettings), providerDisbursementsEnabled: false}],
    ["providerPaymentAccounts/provider", {schemaVersion: 1, providerId: "provider", ownerId: "owner",
      setupStatus: "ready", payoutReady: true, paymongoAccountId: "org_provider", linkedAccountType: "merchant",
      activationStatus: "activated", relationshipId: "mr_fixture", relationshipStatus: "enabled",
      relationshipVerificationStatus: "verified", settlementTransportMode: "disabled", settlementTransportReady: false}],
    ["providers/provider", {ownerId: "owner", verificationStatus: "approved", isActive: true,
      businessRegistrationType: "registered_business"}],
    ["users/owner", {role: "provider", providerId: "provider", accountStatus: "active"}],
    ["providerRequests/request", {status: "completed", completedAt: anchor,
      financialSnapshot: {providerDisbursementPolicyVersion: 1}}], ["mainEvents/event", {}],
  ]);
  for (const s of f.sources) {
    records.set("providerSettlements/" + s.settlement.settlementId, s.settlement);
    records.set("providerEarnings/" + s.earning.earningId, s.earning);
    records.set("payments/" + s.payment.paymentId, s.payment);
  }
  const writes = [], calls = [];
  const snapshot = ref => ({ref, id: ref.id, exists: records.has(ref.path), data: () => records.get(ref.path)});
  db.collection = name => ({doc: id => {
    const ref = id === undefined ? originalCollection(name).doc() : originalCollection(name).doc(id);
    ref.get = async () => snapshot(ref);
    ref.update = async data => {records.set(ref.path, {...records.get(ref.path), ...data}); writes.push(["update", ref.path]);};
    return ref;
  }});
  db.runTransaction = async callback => {
    const pending = [], tx = {get: async ref => snapshot(ref), getAll: async (...refs) => refs.map(snapshot),
      update: (ref, data) => pending.push(["update", ref, data]),
      create: (ref, data) => pending.push(["create", ref, data]), set: (ref, data) => pending.push(["set", ref, data])};
    const result = await callback(tx);
    for (const [mode, ref, data] of pending) {
      records.set(ref.path, mode === "update" ? {...records.get(ref.path), ...data} : data);
      writes.push([mode, ref.path]);
    }
    return result;
  };
  authority.readTrustedProviderRequestPaymentSetInTransaction = async () => ({mode: "p5",
    settlement: {fullySettled: true, settledPaymentIds: ["deposit", "balance"]}});
  const account = {accountId: "org_provider", activationStatus: "activated", accountType: "merchant"};
  const relationship = {relationshipId: "mr_fixture", childAccountId: "org_provider", parentAccountId: "org_parent",
    enabled: true, linkingRequestId: null};
  const wallet = {walletId: "wallet_fixture", merchantId: "org_parent", livemode: false, status: "activated",
    currency: "PHP", accountProvider: "paymongo", accountNumber: "0001", availableBalanceInCentavos: 900000};
  const readers = {account: async input => (calls.push(["account", input.accountId]), account),
    relationship: async input => (calls.push(["relationship", input.relationshipId]), relationship),
    wallet: async input => (calls.push(["wallet", input.walletId]), wallet)};
  return {records, writes, calls, readers, account, relationship, wallet,
    verify: () => activation.verifyProviderTestSettlementTransport("disbursement", "admin", readers, "sk_test_mock_only")};
}

test("server verification activates a bounded entitlement proof without financial writes or enabling dispatch", async () => {
  const h = harness(), before = JSON.stringify([...h.records].filter(([key]) =>
    !key.startsWith("providerPaymentAccounts/")));
  const result = await h.verify(), account = h.records.get("providerPaymentAccounts/provider");
  assert.equal(result.verified, true); assert.equal(result.dispatchEnabled, false);
  assert.equal(providerSettlementCapability(account).transportReady, true);
  assert.equal(providerDisbursementTransport.capability(account, h.records.get("appSettings/platform")).ready, true);
  assert.equal(account.settlementTransportVerificationRequestId, null);
  assert.equal(h.calls.length, 3);
  assert.ok(h.writes.every(([, key]) => key.startsWith("providerPaymentAccounts/") || key.startsWith("adminLogs/")));
  assert.equal(JSON.stringify([...h.records].filter(([key]) => !key.startsWith("providerPaymentAccounts/") &&
    !key.startsWith("adminLogs/"))), before);
  await assert.rejects(execution.reserveProviderDisbursement("disbursement"), /disabled/);
});
for (const [name, change] of [
  ["live key", h => {h.verify = () => activation.verifyProviderTestSettlementTransport("disbursement", "admin", h.readers, "sk_live_mock_only");}],
  ["dispatch enabled", h => {h.records.get("appSettings/platform").providerDisbursementsEnabled = true;}],
  ["dispatch flag absent", h => {delete h.records.get("appSettings/platform").providerDisbursementsEnabled;}],
  ["unapproved provider", h => {h.records.get("providers/provider").verificationStatus = "pending";}],
  ["blocked owner", h => {h.records.get("users/owner").isBlocked = true;}],
  ["unverified account", h => {h.records.get("providerPaymentAccounts/provider").payoutReady = false;}],
  ["real recipient", h => {h.records.get("appSettings/platform").providerDisbursementTestDestination.number = "1234567890";}],
  ["wrong entitlement allowlist", h => {h.records.get("appSettings/platform").providerDisbursementTestAllowedDisbursementId = "other";}],
]) test("activation rejects " + name + " before gateway access", async () => {
  const h = harness(); change(h); await assert.rejects(h.verify());
  assert.equal(h.calls.length, 0);
  assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportReady, false);
});
for (const [name, change] of [
  ["inactive child", h => {h.account.activationStatus = "declined";}],
  ["wrong child", h => {h.account.accountId = "org_other";}],
  ["wrong account type", h => {h.account.accountType = "consumer";}],
  ["disabled relationship", h => {h.relationship.enabled = false;}],
  ["wrong relationship child", h => {h.relationship.childAccountId = "org_other";}],
  ["wrong parent merchant", h => {h.relationship.parentAccountId = "org_other";}],
  ["wrong invitation", h => {h.relationship.linkingRequestId = "invite_other";}],
  ["live wallet", h => {h.wallet.livemode = true;}],
  ["wrong wallet", h => {h.wallet.walletId = "wallet_other";}],
  ["inactive wallet", h => {h.wallet.status = "deactivated";}],
  ["unfunded wallet", h => {h.wallet.availableBalanceInCentavos = 0;}],
  ["gateway unavailable", h => {h.readers.wallet = async () => {throw new Error("sensitive raw response");};}],
]) test("activation fails closed on " + name, async () => {
  const h = harness(); change(h);
  await assert.rejects(h.verify(), e => !e.message.includes("sensitive"));
  const account = h.records.get("providerPaymentAccounts/provider");
  assert.equal(account.settlementTransportReady, false); assert.equal(account.settlementTransportVerification, null);
  assert.ok(h.writes.every(([, path]) => path.startsWith("providerPaymentAccounts/")));
});
for (const [name, change] of [
  ["refund reservation", h => {h.records.get("payments/deposit").refundReservedAmountInCentavos = 1;}],
  ["settlement lock", h => {h.records.get("providerSettlements/" + fixture().sources[0].settlement.settlementId).activePayoutAttemptId = "other";}],
  ["unfinished booking", h => {h.records.get("providerRequests/request").status = "confirmed";}],
  ["banking hold", h => {h.records.get("providerDisbursements/disbursement").payoutEligibleAt = Timestamp.fromMillis(Date.now() + 60000);}],
  ["unsettled customer obligation", () => {authority.readTrustedProviderRequestPaymentSetInTransaction = async () => ({mode: "p5", settlement: {fullySettled: false, settledPaymentIds: []}});} ],
]) test("wallet existence cannot bypass " + name, async () => {
  const h = harness(); change(h); await assert.rejects(h.verify());
  assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportReady, false);
  assert.equal(h.records.has("providerDisbursementAttempts/"), false);
  assert.ok(h.writes.every(([, path]) => path.startsWith("providerPaymentAccounts/")));
});
for (const [name, change] of [
  ["settings changed", h => {h.records.get("appSettings/platform").providerDisbursementTestDestination.number = "999999990001";}],
  ["refresh invalidation", h => {h.records.get("providerPaymentAccounts/provider").settlementTransportVerificationRequestId = null;}],
  ["provider revoked", h => {h.records.get("providers/provider").isSuspended = true;}],
  ["account replaced", h => {h.records.get("providerPaymentAccounts/provider").paymongoAccountId = "org_other";}],
  ["amount changed", h => {h.records.get("providerDisbursements/disbursement").amountInCentavos = 1;}],
]) test("concurrent " + name + " rejects activation", async () => {
  const h = harness(), wallet = h.readers.wallet;
  h.readers.wallet = async input => {const result = await wallet(input); change(h); return result;};
  await assert.rejects(h.verify());
  assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportReady, false);
});
test("expired, future, or altered account proof cannot authorize wallet transport", () => {
  const base = verifiedAccount({schemaVersion: 1, setupStatus: "ready", payoutReady: true,
    paymongoAccountId: "org_provider", activationStatus: "activated", relationshipStatus: "enabled",
    settlementTransportMode: "wallet_transfer", settlementTransportReady: true}, testSettings);
  for (const mutate of [a => {delete a.settlementTransportVerification;},
    a => {a.settlementTransportVerification.expiresAtMs = Date.now() - 1;},
    a => {a.settlementTransportVerification.verifiedAtMs = Date.now() + 60000;},
    a => {a.paymongoAccountId = "org_other";}, a => {a.relationshipStatus = "disabled";}]) {
    const account = structuredClone(base); mutate(account);
    assert.equal(providerSettlementCapability(account).transportReady, false);
  }
});
test("recipient/settings changes invalidate effective readiness", async () => {
  const h = harness(); await h.verify();
  h.records.get("appSettings/platform").providerDisbursementTestDestination.number = "999999990001";
  assert.equal(providerDisbursementTransport.capability(h.records.get("providerPaymentAccounts/provider"),
    h.records.get("appSettings/platform")).ready, false);
});
for (const [name, change] of [
  ["provider revoked", h => {h.records.get("providers/provider").verificationStatus = "rejected";}],
  ["owner blocked", h => {h.records.get("users/owner").isBlocked = true;}],
  ["business account type changed", h => {h.records.get("providers/provider").businessRegistrationType = "individual";}],
  ["provider deleted", h => {h.records.delete("providers/provider");}],
]) test("revocation clears persisted proof: " + name, async () => {
  const h = harness(); await h.verify(); change(h);
  await activation.invalidateRevokedProviderTransport("provider");
  assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportReady, false);
  assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportVerification, null);
});
test("runtime reservation blocks revoked provider even before invalidation trigger runs", async () => {
  const h = harness(); await h.verify();
  h.records.get("appSettings/platform").providerDisbursementsEnabled = true;
  h.records.get("providers/provider").isSuspended = true;
  await assert.rejects(execution.reserveProviderDisbursement("disbursement"), /revoked/);
  assert.equal(h.records.get("providerDisbursements/disbursement").status, "ready");
});

test("default activation readers issue only authenticated GET requests with mocked HTTP", async () => {
  const h = harness(), requests = [];
  global.fetch = async (url, init) => {
    requests.push({url, method: init.method});
    assert.equal(init.headers.Authorization, "Basic " + Buffer.from("sk_test_mock_only:").toString("base64"));
    const data = url.includes("/accounts/") ? {id: "org_provider", type: "merchant", activation_status: "activated"} :
      url.includes("/relationships/") ? {id: "mr_fixture", enabled: true,
        parent_account: {id: "org_parent"}, child_account: {id: "org_provider"}} :
        {id: "wallet_fixture", merchant_id: "org_parent", livemode: false, status: "activated",
          balance: {available: 900000, pending: 0}, account: {provider: "paymongo", currency: "PHP",
            account_number: "0001", account_name: "FEASTA TEST"}};
    return new Response(JSON.stringify({data}));
  };
  await activation.verifyProviderTestSettlementTransport("disbursement", "admin", undefined, "sk_test_mock_only");
  assert.equal(requests.length, 3); assert.ok(requests.every(r => r.method === "GET"));
  assert.equal(h.records.get("providerDisbursements/disbursement").status, "ready");
});
test("provider account refresh revokes proof before an unavailable gateway response", async () => {
  const h = harness(); await h.verify();
  Object.assign(h.records.get("providers/provider"), {ownerEmail: "owner@example.test", businessName: "TEST"});
  authorization.requireRole = async () => "provider";
  rateLimit.enforceCallableRateLimit = async () => {};
  linked.retrievePayMongoLinkedAccount = async () => {
    assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportReady, false);
    throw new Error("mock unavailable");
  };
  const refresh = require("../lib/provider-finance/provider-payment-account-management.js").refreshProviderPayoutAccount;
  await assert.rejects(refresh.run({auth: {uid: "owner", token: {}}, rawRequest: {headers: {}}, data: {}}));
  assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportVerification, null);
});
test("verification callable rejects unauthenticated and non-admin initiation", async () => {
  const h = harness();
  await assert.rejects(activation.verifyProviderSettlementTransport.run({rawRequest: {headers: {}}, data: {providerDisbursementId: "disbursement"}}),
    e => e.code === "unauthenticated");
  authorization.requireRole = async (_uid, roles) => {
    assert.deepEqual(roles, ["admin"]);
    throw new (require("firebase-functions/v2/https").HttpsError)("permission-denied", "Admin required.");
  };
  await assert.rejects(activation.verifyProviderSettlementTransport.run({auth: {uid: "owner", token: {}}, rawRequest: {headers: {}},
    data: {providerDisbursementId: "disbursement"}}), e => e.code === "permission-denied");
  assert.equal(h.writes.length, 0); assert.equal(h.calls.length, 0);
});
test("verification callable rejects client financial authority and binds only the test secret", async () => {
  const h = harness(); authorization.requireRole = async () => "admin";
  rateLimit.enforceCallableRateLimit = async () => {};
  await assert.rejects(activation.verifyProviderSettlementTransport.run({auth: {uid: "admin", token: {}}, rawRequest: {headers: {}},
    data: {providerDisbursementId: "disbursement", amountInCentavos: 1}}), e => e.code === "invalid-argument");
  assert.equal(h.writes.length, 0);
  assert.deepEqual(activation.verifyProviderSettlementTransport.__endpoint.secretEnvironmentVariables.map(v => v.key),
    ["PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY"]);
  assert.equal(require("../lib/shared/function-options.js").appCheckCallableOptions.enforceAppCheck, true);
});

test("profile and owner triggers invalidate revoked accounts without gateway reads", async () => {
  const h = harness(); await h.verify(); const count = h.calls.length;
  h.records.get("providers/provider").isSuspended = true;
  await activation.invalidateProviderTransportOnProfileChange.run({params: {providerId: "provider"}});
  assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportReady, false);
  h.records.get("providers/provider").isSuspended = false;
  await h.verify(); h.records.get("users/owner").isBlocked = true;
  await activation.invalidateProviderTransportOnOwnerChange.run({params: {userId: "owner"}, data: {
    before: {data: () => ({providerId: "provider"})}, after: {data: () => ({providerId: "provider"})}}});
  assert.equal(h.records.get("providerPaymentAccounts/provider").settlementTransportReady, false);
  assert.equal(h.calls.length, count + 3);
});

for (const [name, revoke, event] of [
  ["invalidateProviderTransportOnProfileChange",
    h => {h.records.get("providers/provider").isSuspended = true;},
    {params: {providerId: "provider"}}],
  ["invalidateProviderTransportOnOwnerChange",
    h => {h.records.delete("users/owner");},
    {params: {userId: "owner"}, data: {
      before: {data: () => ({providerId: "provider"})}, after: {data: () => undefined},
    }}],
]) test(name + " replay performs no additional writes or gateway reads", async () => {
  const h = harness(); await h.verify(); revoke(h);
  const writesBefore = h.writes.length, callsBefore = h.calls.length;
  await activation[name].run(event);
  assert.deepEqual(h.writes.slice(writesBefore), [["update", "providerPaymentAccounts/provider"]]);
  const account = h.records.get("providerPaymentAccounts/provider");
  assert.equal(account.settlementTransportReady, false);
  assert.equal(account.settlementTransportVerification, null);
  assert.equal(account.settlementTransportVerificationRequestId, null);
  const writesAfter = h.writes.length;
  await activation[name].run(event);
  assert.equal(h.writes.length, writesAfter);
  assert.equal(h.calls.length, callsBefore);
  assert.ok(activation[name].__endpoint.eventTrigger);
  assert.equal(activation[name].__endpoint.callableTrigger, undefined);
  assert.equal(activation[name].__endpoint.httpsTrigger, undefined);
});

test("revocation cancels pending verification and cannot reactivate it on replay", async () => {
  const h = harness(), account = h.records.get("providerPaymentAccounts/provider");
  account.settlementTransportVerificationRequestId = "pending-verification";
  h.records.get("users/owner").isBlocked = true;
  await activation.invalidateRevokedProviderTransport("provider");
  const invalidated = h.records.get("providerPaymentAccounts/provider");
  assert.equal(invalidated.settlementTransportReady, false);
  assert.equal(invalidated.settlementTransportVerificationRequestId, null);
  assert.equal(invalidated.settlementTransportVerification, null);
  const writes = h.writes.length;
  await activation.invalidateRevokedProviderTransport("provider");
  assert.equal(h.writes.length, writes);
  assert.equal(h.calls.length, 0);
});
