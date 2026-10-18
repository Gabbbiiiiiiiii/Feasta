const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {initializeApp, getApps} = require("firebase-admin/app");
if (!getApps().length) initializeApp({projectId: "demo-feasta"});
const clientModule = require("../lib/provider-finance/paymongo-disbursement-client.js");
const {providerDisbursementTransport: transport} = require("../lib/provider-finance/provider-disbursement-transport.js");
const domain = require("../lib/provider-finance/provider-disbursement-domain.js");
const execution = require("../lib/provider-finance/provider-disbursement-execution.js");
const webhook = require("../lib/provider-finance/provider-disbursement-webhook.js");
const {fixture} = require("./provider-disbursement-fixtures.cjs");
const account = {schemaVersion: 1, setupStatus: "ready", payoutReady: true,
  paymongoAccountId: "org_provider", activationStatus: "activated", relationshipStatus: "enabled",
  settlementTransportMode: "wallet_transfer", settlementTransportReady: true};
const settings = {providerDisbursementTestMode: true, providerDisbursementTestAllowedDisbursementId: "disbursement", providerDisbursementTestWalletId: "wallet_fixture",
  providerDisbursementTestDestination: {number: "999999990002", name: "FEASTA TEST PROVIDER",
    bic: "UBPHPHMMXXX", provider: "instapay"}};
function attempt() {
  const f = fixture(), cap = transport.capability(account, settings);
  return domain.aggregateReservationPlan({...f, transportMode: cap.transportMode,
    destinationSnapshot: cap.destinationSnapshot}).externalAttempt;
}
function evidence(a = attempt(), status = "pending") {
  return {id: "tr_fixture", reference_number: a.referenceNumber, amount: a.amountInCentavos,
    currency: "PHP", livemode: false, status, destination_account: {...a.destinationSnapshot.destinationAccount}};
}
function wallet() {
  return {data: {id: "wallet_fixture", livemode: false, status: "activated", balance: {available: 900000},
    account: {provider: "paymongo", currency: "PHP", account_number: "000000000001", account_name: "FEASTA TEST"}}};
}
const json = (body, status = 200) => new Response(JSON.stringify(body), {status});
function harness({a = attempt(), secret = "sk_test_mock_only", steps = [], w = wallet()} = {}) {
  const requests = [], delays = [];
  const client = clientModule.createPayMongoDisbursementClient({
    secretKey: () => secret, sleep: async ms => {delays.push(ms);},
    http: async (url, init) => {
      requests.push({url, ...init});
      if (url.includes("/wallets/")) return json(w);
      const step = steps.shift();
      if (step instanceof Error) throw step;
      if (typeof step === "function") return step();
      return step ?? json({data: {id: "batch_tr_fixture", transfers: [evidence(a)]}}, 201);
    },
  });
  return {a, client, requests, delays};
}

for (const [name, mutate] of [
  ["absent mode", s => delete s.providerDisbursementTestMode],
  ["false mode", s => s.providerDisbursementTestMode = false],
  ["string mode", s => s.providerDisbursementTestMode = "true"],
  ["arbitrary destination", s => s.providerDisbursementTestDestination.number = "1234567890"],
  ["org wallet", s => s.providerDisbursementTestWalletId = "org_provider"],
  ["empty name", s => s.providerDisbursementTestDestination.name = " "],
  ["invalid BIC", s => s.providerDisbursementTestDestination.bic = "invalid"],
  ["unsupported provider", s => s.providerDisbursementTestDestination.provider = "paymongo"],
]) test("capability rejects " + name, () => {
  const s = structuredClone(settings); mutate(s); assert.equal(transport.capability(account, s).ready, false);
});
for (const number of clientModule.TEST_DESTINATION_NUMBERS) test("capability accepts simulator " + number, () => {
  const s = structuredClone(settings); s.providerDisbursementTestDestination.number = number;
  const cap = transport.capability(account, s); assert.equal(cap.ready, true);
  assert.equal(cap.destinationSnapshot.livemode, false);
});
for (const patch of [{payoutReady: false}, {settlementTransportReady: false},
  {relationshipStatus: "disabled"}, {settlementTransportMode: "workflow"}]) {
  test("capability preserves readiness/mode barrier " + JSON.stringify(patch), () => {
    assert.equal(transport.capability({...account, ...patch}, settings).ready, false);
  });
}
test("capability is independent of dispatch flag, and reservation freezes snapshot", () => {
  const s = structuredClone(settings), cap = transport.capability(account, s);
  const a = domain.aggregateReservationPlan({...fixture(), transportMode: cap.transportMode,
    destinationSnapshot: cap.destinationSnapshot}).externalAttempt;
  s.providerDisbursementTestDestination.number = "123";
  cap.destinationSnapshot.destinationAccount.number = "456";
  assert.equal(a.destinationSnapshot.destinationAccount.number, "999999990002");
  assert.throws(() => domain.aggregateReservationPlan({...fixture(), dispatchEnabled: false,
    transportMode: "wallet_transfer", destinationSnapshot: a.destinationSnapshot}));
});
for (const secret of ["sk_live_fixture", "pk_test_fixture", "", "sk_test_"]) test("reject secret " + secret, async () => {
  const h = harness({secret}); await assert.rejects(h.client.dispatch(h.a), /test secret/);
  assert.equal(h.requests.length, 0);
});
test("test secret uses Basic auth and one authoritative transfer", async () => {
  const h = harness(); await h.client.dispatch(h.a);
  const r = h.requests.find(r => r.method === "POST"), body = JSON.parse(r.body);
  assert.equal(r.url, "https://api.paymongo.com/v2/batch_transfers");
  assert.equal(r.headers.Authorization, "Basic " + Buffer.from("sk_test_mock_only:").toString("base64"));
  assert.equal(r.headers["Idempotency-Key"], h.a.idempotencyKey);
  assert.equal(body.transfers.length, 1);
  const t = body.transfers[0]; assert.equal(t.amount, h.a.amountInCentavos);
  assert.equal(t.reference_number, h.a.referenceNumber); assert.equal(t.currency, "PHP");
  assert.deepEqual(t.destination_account, h.a.destinationSnapshot.destinationAccount);
  assert.equal(t.source_account.bic, "PAEYPHM2XXX");
  assert.equal(t.metadata.feasta_external_attempt_id, h.a.externalAttemptId);
  assert.equal(h.requests[0].url, "https://api.paymongo.com/v2/wallets/wallet_fixture?fields=account&fields=balance");
});
for (const [name, mutate] of [
  ["live wallet", w => w.data.livemode = true],
  ["missing mode", w => delete w.data.livemode],
  ["inactive wallet", w => w.data.status = "deactivated"],
  ["wrong wallet", w => w.data.id = "wallet_other"],
  ["source number missing", w => delete w.data.account.account_number],
  ["source name missing", w => delete w.data.account.account_name],
  ["source currency wrong", w => w.data.account.currency = "USD"],
  ["source provider wrong", w => w.data.account.provider = "other"],
]) test(name + " prevents create", async () => {
  const w = wallet(); mutate(w); const h = harness({w});
  await assert.rejects(h.client.dispatch(h.a)); assert.equal(h.requests.length, 1);
});
test("guide source_account shape is validated", () => {
  const w = wallet(); delete w.data.account;
  w.data.source_account = {number: "0001", name: "TEST", bic: "PAEYPHM2XXX"};
  assert.equal(clientModule.testWalletSource(w, "wallet_fixture").number, "0001");
  w.data.source_account.bic = "UBPHPHMMXXX";
  assert.throws(() => clientModule.testWalletSource(w, "wallet_fixture"));
});
for (const [name, step] of [
  ["network", () => {throw new Error("mock timeout");}],
  ["timeout", () => {throw new DOMException("mock abort", "TimeoutError");}],
  ["5xx", () => json({errors: [{code: "internal_server_error"}]}, 503)],
  ["409 in progress", () => json({errors: [{code: "idempotency_in_progress"}]}, 409)],
]) test(name + " retry reuses exact body and key", async () => {
  const h = harness({steps: [step, step]}); await h.client.dispatch(h.a);
  const writes = h.requests.filter(r => r.method === "POST");
  assert.equal(writes.length, 3); assert.deepEqual(h.delays, [1000, 2000]);
  assert.equal(new Set(writes.map(r => r.body)).size, 1);
  assert.deepEqual(writes.map(r => r.headers["Idempotency-Key"]), Array(3).fill(h.a.idempotencyKey));
});
for (const status of [400, 401, 403, 408, 409, 422, 429]) test("ordinary HTTP " + status + " not retried", async () => {
  const h = harness({steps: [json({errors: [{code: "ordinary_error"}]}, status)]});
  await assert.rejects(h.client.dispatch(h.a)); assert.equal(h.requests.length, 2);
  assert.deepEqual(h.delays, []);
});
test("retry exhaustion returns no trusted failure evidence", async () => {
  const h = harness({steps: Array.from({length: 3}, () => new Error("mock outage"))});
  await assert.rejects(h.client.dispatch(h.a), /outcome unknown/);
  assert.equal(h.requests.filter(r => r.method === "POST").length, 3);
});
for (const [name, mutate] of [
  ["live attempt", a => a.livemode = true],
  ["missing frozen mode", a => delete a.destinationSnapshot.testMode],
  ["arbitrary frozen destination", a => a.destinationSnapshot.destinationAccount.number = "123"],
  ["changed idempotency key", a => a.idempotencyKey = "new"],
  ["changed reference", a => a.referenceNumber = "pd_other"],
  ["invalid amount", a => a.amountInCentavos = 0],
  ["wrong currency", a => a.currency = "USD"],
  ["already processing", a => a.status = "processing"],
  ["known gateway ID", a => a.gatewayResourceId = "tr_fixture"],
]) test(name + " rejected before HTTP", async () => {
  const h = harness(); mutate(h.a); await assert.rejects(h.client.dispatch(h.a));
  assert.equal(h.requests.length, 0);
});
for (const status of ["pending", "succeeded", "failed"]) test("create normalizes " + status, async () => {
  const a = attempt(), e = evidence(a, status);
  const h = harness({a, steps: [json({data: {id: "btr_fixture", transfers: [e]}}, 201)]});
  const result = await h.client.dispatch(a); assert.equal(result.status, status);
  assert.equal(result.batch_transfer_id, "btr_fixture");
});
for (const [name, mutate] of [
  ["amount", e => e.amount++], ["currency", e => e.currency = "USD"],
  ["destination number", e => e.destination_account.number = "999999990001"],
  ["destination name", e => e.destination_account.name = "OTHER"],
  ["destination bic", e => e.destination_account.bic = "BNORPHMM"],
  ["live transfer", e => e.livemode = true], ["absent mode", e => delete e.livemode],
  ["reference", e => e.reference_number = "pd_" + "a".repeat(40)],
  ["status", e => e.status = "returned"],
]) test("mismatching " + name + " rejected", async () => {
  const a = attempt(), e = evidence(a); mutate(e);
  const h = harness({a, steps: [json({data: {id: "batch_tr_fixture", transfers: [e]}}, 201)]});
  await assert.rejects(h.client.dispatch(a));
});
for (const count of [0, 2]) test("batch cardinality " + count + " rejected", async () => {
  const a = attempt(), h = harness({a, steps: [json({data: {
    id: "batch_tr_fixture", transfers: Array(count).fill(evidence(a)),
  }}, 201)]}); await assert.rejects(h.client.dispatch(a));
});
test("retrieve known tr ID validates and preserves rail/batch references", async () => {
  const a = attempt(); a.gatewayResourceId = "tr_fixture"; a.status = "processing";
  const e = {...evidence(a, "succeeded"), provider_reference_number: "rail_123", batch_transfer_id: "btr_fixture"};
  const h = harness({a, steps: [json({data: e})]});
  assert.deepEqual(await h.client.retrieve(a), e);
  assert.equal(h.requests[0].url, "https://api.paymongo.com/v2/transfers/tr_fixture");
});
for (const shape of ["array", "transfers"]) test("reference lookup supports " + shape, async () => {
  const a = attempt(); a.status = "ambiguous"; const e = evidence(a, "failed");
  const h = harness({a, steps: [json({data: shape === "array" ? [e] : {transfers: [e]}})]});
  assert.deepEqual(await h.client.retrieve(a), e);
  assert.ok(h.requests[0].url.includes("reference_number=" + a.referenceNumber));
  assert.ok(h.requests.every(r => r.method === "GET"));
});
test("zero reference matches returns null", async () => {
  const h = harness({steps: [json({data: []})]}); assert.equal(await h.client.retrieve(h.a), null);
});
test("conflicting reference matches rejected", async () => {
  const a = attempt(), h = harness({a, steps: [json({data: [evidence(a), {...evidence(a), id: "tr_other"}]})]});
  await assert.rejects(h.client.retrieve(a), /conflicting/);
});
test("truncated reference page cannot prove uniqueness", async () => {
  const a = attempt(), h = harness({a, steps: [json({data: [evidence(a)], has_more: true})]});
  await assert.rejects(h.client.retrieve(a));
});
test("known ID mismatching returned ID rejected", async () => {
  const a = attempt(); a.gatewayResourceId = "tr_other";
  const h = harness({a, steps: [json({data: evidence(a)})]}); await assert.rejects(h.client.retrieve(a));
});
test("legacy reservation retrieval is unavailable without HTTP", async () => {
  assert.equal(await transport.retrieve({}), null);
});
const originalApply = execution.applyProviderDisbursementEvidence;
test.afterEach(() => {execution.applyProviderDisbursementEvidence = originalApply;});
function event(e, type = "transfer.outward.successful", shape = "wallet_transaction") {
  return {data: {id: "evt_fixture", attributes: {type, livemode: false, data: shape === "transfer" ?
    {type: shape, id: e.id, attributes: e} : {type: shape, id: "wallet_tr_fixture", attributes: {
      ...e, transfer_id: e.id, receiver: {bank_account_number: e.destination_account.number,
        bank_account_name: e.destination_account.name, bank_code: e.destination_account.bic},
    }}}}};
}
async function process(payload) {
  let applied;
  execution.applyProviderDisbursementEvidence = async (id, e) => {applied = {id, e}; return {applied: true};};
  const result = await webhook.processProviderTransferWebhook(Buffer.from(JSON.stringify(payload)));
  return {applied, result};
}
for (const shape of ["transfer", "wallet_transaction"]) for (const status of ["succeeded", "failed"]) {
  test(shape + " outward webhook normalizes " + status, async () => {
    const e = evidence(attempt(), status), payload = event(e,
      status === "succeeded" ? "transfer.outward.successful" : "transfer.outward.failed", shape);
    const {applied} = await process(payload);
    assert.equal(applied.id, e.reference_number); assert.deepEqual(applied.e, e);
  });
}
test("wallet webhook falls back to trusted tr resource ID", async () => {
  const e = evidence(attempt(), "succeeded"), payload = event(e);
  delete payload.data.attributes.data.attributes.transfer_id;
  payload.data.attributes.data.id = e.id;
  assert.equal((await process(payload)).applied.e.id, e.id);
});
for (const type of ["transfer.inward.successful", "transfer.inward.failed"]) test(type + " ignored", async () => {
  const {applied, result} = await process(event(evidence(), type));
  assert.equal(applied, undefined); assert.equal(result, null);
});
for (const [name, change] of [
  ["live envelope", p => p.data.attributes.livemode = true],
  ["live resource", p => p.data.attributes.data.attributes.livemode = true],
  ["pending success", p => p.data.attributes.data.attributes.status = "pending"],
  ["failed success", p => p.data.attributes.data.attributes.status = "failed"],
  ["succeeded failure", p => p.data.attributes.type = "transfer.outward.failed"],
  ["bad reference", p => p.data.attributes.data.attributes.reference_number = "browser"],
  ["wallet ID cannot replace tr ID", p => delete p.data.attributes.data.attributes.transfer_id],
]) test("webhook rejects " + name, async () => {
  const p = event(evidence(attempt(), "succeeded")); change(p); await assert.rejects(process(p));
});
test("scheduled dispatcher/reconciler explicitly binds secret", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/provider-finance/provider-disbursement-reconciliation.ts"), "utf8");
  assert.match(src, /secrets: \[providerDisbursementTestSecret\]/);
  const transportSrc = fs.readFileSync(path.join(__dirname, "../src/provider-finance/provider-disbursement-transport.ts"), "utf8");
  assert.match(transportSrc, /defineSecret\("PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY"\)/);
  assert.doesNotMatch(transportSrc, /PAYMONGO_SECRET_KEY/);
});

test("explicit live configuration cannot pass capability", () => {
  const s = structuredClone(settings); s.providerDisbursementTestDestination.livemode = true;
  assert.equal(transport.capability(account, s).ready, false);
  assert.equal(transport.capability({...account, livemode: true}, settings).ready, false);
});
test("nested transfer envelope cannot hide live evidence", () => {
  assert.throws(() => clientModule.normalizePayMongoTransfer({
    id: "tr_fixture", type: "transfer", livemode: true, attributes: evidence(),
  }));
});
test("nested wallet envelope cannot hide live evidence", () => {
  const w = wallet();
  assert.throws(() => clientModule.testWalletSource({
    data: {id: w.data.id, livemode: true, attributes: w.data},
  }, w.data.id));
});

for (const [name, value] of [
  ["missing", undefined], ["empty", ""], ["path", "other/id"], ["nonstring", 42],
]) test("capability requires valid single-disbursement allowlist: " + name, () => {
  const s = {...settings, providerDisbursementTestAllowedDisbursementId: value};
  assert.equal(transport.capability(account, s).ready, false);
});
for (const value of [undefined, "other-disbursement"]) {
  test("frozen allowlist " + String(value) + " prevents all HTTP", async () => {
    const h = harness(); h.a.destinationSnapshot.allowedDisbursementId = value;
    await assert.rejects(h.client.dispatch(h.a));
    assert.equal(h.requests.length, 0);
  });
}
for (const [name, delta] of [["sufficient", 1], ["exact", 0]]) {
  test(name + " V2 available balance permits full-entitlement create", async () => {
    const a = attempt(), w = wallet(); w.data.balance.available = a.amountInCentavos + delta;
    const h = harness({a, w}); await h.client.dispatch(a);
    const post = h.requests.find(r => r.method === "POST");
    assert.ok(post); assert.equal(JSON.parse(post.body).transfers[0].amount, a.amountInCentavos);
    const fields = new URL(h.requests[0].url).searchParams.getAll("fields");
    assert.deepEqual(fields, ["account", "balance"]);
  });
}
for (const [name, balance] of [
  ["insufficient", {available: 899999}],
  ["zero", {available: 0}],
  ["missing", undefined], ["null", null], ["array", []],
  ["missing available", {}], ["string", {available: "900000"}],
  ["negative", {available: -1}], ["fraction", {available: 900000.5}],
  ["unsafe", {available: Number.MAX_SAFE_INTEGER + 1}],
]) test(name + " balance prevents POST without trusted terminal evidence", async () => {
  const w = wallet(); w.data.balance = balance;
  const h = harness({w});
  await assert.rejects(h.client.dispatch(h.a),
    name === "insufficient" || name === "zero" ?
      /paymongo_test_wallet_balance_insufficient/ : /paymongo_test_wallet_balance_invalid/);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].method, "GET");
  assert.deepEqual(h.delays, []);
});
test("legacy available_balance is not accepted as documented V2 funding", async () => {
  const w = wallet(); delete w.data.balance; w.data.available_balance = 900000;
  const h = harness({w}); await assert.rejects(h.client.dispatch(h.a), /balance_invalid/);
  assert.equal(h.requests.some(r => r.method === "POST"), false);
});

test("scheduled disbursement runtime binds only its dedicated test secret", () => {
  const {reconcileProviderDisbursements} = require("../lib/provider-finance/provider-disbursement-reconciliation.js");
  const bindings = reconcileProviderDisbursements.__endpoint.secretEnvironmentVariables;
  assert.deepEqual(bindings.map(binding => binding.key), ["PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY"]);
});
function withTransportSecrets(dedicated, shared, callback) {
  const environment = require("node:process").env;
  const originalDedicated = environment.PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY;
  const originalShared = environment.PAYMONGO_SECRET_KEY;
  const originalFetch = global.fetch;
  if (dedicated === undefined) delete environment.PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY;
  else environment.PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY = dedicated;
  environment.PAYMONGO_SECRET_KEY = shared;
  return Promise.resolve().then(callback).finally(() => {
    if (originalDedicated === undefined) delete environment.PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY;
    else environment.PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY = originalDedicated;
    if (originalShared === undefined) delete environment.PAYMONGO_SECRET_KEY;
    else environment.PAYMONGO_SECRET_KEY = originalShared;
    global.fetch = originalFetch;
  });
}
test("default transport reads dedicated sk_test secret and ignores shared key", async () => {
  await withTransportSecrets("sk_test_dedicated_mock_only", "sk_live_shared_mock_only", async () => {
    const a = attempt(), requests = [];
    global.fetch = async (url, init) => {
      requests.push({url, ...init});
      return url.includes("/wallets/") ? json(wallet()) :
        json({data: {id: "btr_fixture", transfers: [evidence(a)]}}, 201);
    };
    await transport.dispatch(a);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.headers.Authorization,
        "Basic " + Buffer.from("sk_test_dedicated_mock_only:").toString("base64"));
    }
  });
});
for (const [name, dedicated] of [["missing", undefined], ["live", "sk_live_dedicated_mock_only"]]) {
  test(name + " dedicated secret cannot fall back to shared sk_test key", async () => {
    await withTransportSecrets(dedicated, "sk_test_shared_mock_only", async () => {
      let requests = 0;
      global.fetch = async () => {requests++; throw new Error("unexpected mocked HTTP");};
      await assert.rejects(transport.dispatch(attempt()), /PayMongo test secret required/);
      assert.equal(requests, 0);
    });
  });
}
for (const file of [
  "bookings/booking-lifecycle-v3.ts",
  "payments/create-payment-session.ts",
  "payments/paymongo-webhook.ts",
  "payments/process-webhook.ts",
  "payments/remaining-balance-lifecycle-scheduler.ts",
  "payments/request-refund.ts",
  "provider-finance/provider-payment-account-management.ts",
  "refunds/automatic-refund-status-check.ts",
  "refunds/refund-execution.ts",
]) test("existing shared PayMongo secret remains in " + file, () => {
  const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
  assert.match(source, /defineSecret\(\s*"PAYMONGO_SECRET_KEY"\s*,?\s*\)/);
  assert.doesNotMatch(source, /PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY/);
});
