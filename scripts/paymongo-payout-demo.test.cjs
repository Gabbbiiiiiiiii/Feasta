const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {parseArgs, execute, assertDemoAttempt} = require('./paymongo-payout-demo.cjs');
const production = require('../functions/lib/provider-finance/paymongo-disbursement-client.js');
const domain = require('../functions/lib/provider-finance/provider-disbursement-domain.js');

function harness(t, {live = false, balance = 1000000, uncertain = false, mismatch = false} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feasta-payout-demo-'));
  t.after(() => {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
        !path.basename(directory).startsWith('feasta-payout-demo-')) throw Error('Unexpected test cleanup target.');
    fs.rmSync(directory, {recursive: true, force: true});
  });
  const requests = [];
  let transfer;
  const dependencies = {directory, readSecret: () => ('sk_' + 'test_' + 'feastaSyntheticFixtureNotCredential0001'), domain,
    clientModule: {...production, createPayMongoDisbursementClient: options => production.createPayMongoDisbursementClient({
      ...options, sleep: async () => {}, http: async (url, init) => {
        requests.push({url, method: init.method});
        if (url.includes('/wallets/')) return new Response(JSON.stringify({data: {
          id: 'wallet_demo', merchant_id: 'org_demo', livemode: live, status: 'activated',
          balance: {available: balance, pending: 0},
          account: {currency: 'PHP', provider: 'paymongo', account_number: '000000000001', account_name: 'SECRET SOURCE NAME'},
        }}));
        if (init.method === 'POST') {
          const payload = JSON.parse(init.body).transfers[0];
          const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'demo01.json'), 'utf8'));
          assert.equal(receipt.status, 'submission_started');
          if (uncertain) throw Error('Lost response');
          transfer = {id: 'tr_demo', reference_number: payload.reference_number, amount: mismatch ? 1 : payload.amount,
            currency: 'PHP', livemode: false, status: 'succeeded', destination_account: payload.destination_account};
          return new Response(JSON.stringify({data: {id: 'btr_demo', transfers: [transfer]}}), {status: 201});
        }
        return new Response(JSON.stringify({data: transfer}));
      },
    })}};
  return {directory, dependencies, requests};
}
const send = () => parseArgs(['send', '--run', 'demo01', '--wallet', 'wallet_demo', '--bic', 'UBPHPHMMXXX', '--confirm-test-transfer']);

test('relationship inventory reads shared account links without exposing profiles or changing receipts', async t => {
  const h=harness(t);const methods=[];
  h.dependencies.http=async(url,init)=>{methods.push(init.method);return new Response(JSON.stringify(url.includes('/accounts/')?
    {data:{id:'org_test_merchant',activation_status:'pending',person:{email:'PRIVATE_EMAIL'}}}:
    {data:[{id:'mr_actual',enabled:true,parent_account:{id:'org_parent',email:'PRIVATE_EMAIL'},child_account:{id:'org_actual'},linking_request_id:null}],has_more:false}));};
  const result=await execute(parseArgs(['relationships']),h.dependencies);
  assert.deepEqual(methods,['GET','GET']);
  assert.equal(result.relationships[0].matchesStoredChild,false);
  assert.equal(result.relationshipsSharedAcrossModes,true);
  assert(!JSON.stringify(result).includes('PRIVATE_EMAIL'));
  assert.deepEqual(fs.readdirSync(h.directory),[]);
});
test('empty shared relationship inventory never invents account readiness', async t => {
  const h=harness(t);
  h.dependencies.http=async url=>new Response(JSON.stringify(url.includes('/accounts/')?
    {data:{id:'org_test_merchant',activation_status:'pending'}}:{data:[],has_more:false}));
  const result=await execute(parseArgs(['relationships']),h.dependencies);
  assert.deepEqual(result.relationships,[]);
  assert.match(result.next,/No link/);
});

async function recoveryHarness(t, mutate = () => {}) {
  const h = harness(t, {uncertain: true});
  await assert.rejects(execute(send(), h.dependencies));
  const filename = path.join(h.directory, 'demo01.json');
  const attempt = JSON.parse(fs.readFileSync(filename, 'utf8')).attempt;
  const transfer = {id: 'tr_recovered', livemode: false, merchant_id: 'org_demo',
    source_account: {number: '000000000001', name: 'SECRET SOURCE NAME', bic: 'PAEYPHM2XXX'},
    destination_account: {...attempt.destinationSnapshot.destinationAccount},
    reference_number: attempt.referenceNumber.replace(/^pd_/, 'pd-'), amount: 90000,
    currency: 'PHP', provider: 'instapay', status: 'succeeded', metadata: {
      feasta_external_attempt_id: attempt.externalAttemptId, feasta_disbursement_id: attempt.providerDisbursementId,
      feasta_test_mode: true,
    }};
  mutate(transfer);
  const methods = [];
  h.dependencies.http = async (url, init) => {
    methods.push(init.method);
    return new Response(JSON.stringify({data: url.includes('/wallets/') ? {
      id: 'wallet_demo', livemode: false, status: 'activated', merchant_id: 'org_demo',
      account: {currency: 'PHP', provider: 'paymongo', account_number: '000000000001', account_name: 'SECRET SOURCE NAME'},
    } : transfer}));
  };
  return {...h, filename, methods};
}
test('reconciles the observed normalized reference with GET-only evidence and retains original idempotency identity', async t => {
  const h = await recoveryHarness(t);
  const before = JSON.parse(fs.readFileSync(h.filename, 'utf8'));
  const result = await execute(parseArgs(['reconcile', '--run', 'demo01', '--transfer', 'tr_recovered']), h.dependencies);
  assert.equal(result.status, 'confirmed_test_success');
  assert.equal(result.canonicalAccountingChanged, false);
  const saved = JSON.parse(fs.readFileSync(h.filename, 'utf8'));
  assert.equal(saved.attempt.referenceNumber, before.attempt.referenceNumber);
  assert.equal(saved.attempt.idempotencyKey, before.attempt.idempotencyKey);
  assert.equal(saved.evidence.reference_number, before.attempt.referenceNumber.replace(/^pd_/, 'pd-'));
  assert(!JSON.stringify(saved).includes('SECRET SOURCE NAME'));
  assert.equal((await execute(parseArgs(['status', '--run', 'demo01']), h.dependencies)).status, 'confirmed_test_success');
  assert.deepEqual(h.methods, ['GET', 'GET', 'GET', 'GET']);
});
for (const [name, mutate] of [
  ['other reference', value => {value.reference_number = 'pd-unrelated';}],
  ['wrong attempt metadata', value => {value.metadata.feasta_external_attempt_id = 'other';}],
  ['missing metadata', value => {delete value.metadata;}],
  ['live mode', value => {value.livemode = true;}],
  ['wrong amount', value => {value.amount = 90001;}],
  ['wrong merchant', value => {value.merchant_id = 'org_other';}],
  ['wrong source wallet', value => {value.source_account.number = '12345';}],
  ['wrong destination', value => {value.destination_account.number = '999999990002';}],
  ['wrong transfer ID', value => {value.id = 'tr_other';}],
]) test('reconciliation rejects ' + name + ' and preserves unresolved receipt', async t => {
  const h = await recoveryHarness(t, mutate);
  const before = fs.readFileSync(h.filename, 'utf8');
  await assert.rejects(execute(parseArgs(['reconcile', '--run', 'demo01', '--transfer', 'tr_recovered']), h.dependencies));
  assert.equal(fs.readFileSync(h.filename, 'utf8'), before);
  assert(h.methods.every(method => method === 'GET'));
});

test('diagnose is GET-only and never changes an unresolved receipt', async t => {
  const h = harness(t, {uncertain: true});
  await assert.rejects(execute(send(), h.dependencies));
  const filename = path.join(h.directory, 'demo01.json');
  const before = fs.readFileSync(filename, 'utf8');
  const reference = JSON.parse(before).attempt.referenceNumber;
  const methods = [];
  h.dependencies.http = async (url, init) => {
    methods.push(init.method);
    return new Response(JSON.stringify(url.includes('/wallets/') ? {data: {id: 'wallet_demo', livemode: false,
      balance: {available: 1000000}, account: {account_number: 'SECRET_ACCOUNT'}}} : {
      data: [{id: 'tr_found', reference_number: reference, amount: 90000, currency: 'PHP',
        livemode: false, status: 'succeeded', destination_account: {name: 'SECRET_NAME'}}], has_more: false,
    }));
  };
  const result = await execute(parseArgs(['diagnose', '--run', 'demo01']), h.dependencies);
  assert.deepEqual(methods, ['GET', 'GET', 'GET']);
  assert.equal(result.requests[1].matches[0].transferId, 'tr_found');
  assert.equal(result.requests[1].observedTransfers[0].referenceMatches, true);
  assert(!JSON.stringify(result).includes('SECRET_'));
  assert(!JSON.stringify(result).includes(('sk_' + 'test_' + 'feastaSyntheticFixtureNotCredential0001')));
  assert.equal(fs.readFileSync(filename, 'utf8'), before);
});
test('diagnosis exposes a changed reference without treating it as the original transfer', async t => {
  const h = harness(t, {uncertain: true});
  await assert.rejects(execute(send(), h.dependencies));
  h.dependencies.http = async () => new Response(JSON.stringify({data: [{id: 'tr_other',
    reference_number: 'gateway_generated_reference', status: 'succeeded', amount: 90000, currency: 'PHP', livemode: false,
    destination_account: {number: '999999990001', name: 'SECRET_NAME', bic: 'UBPHPHMMXXX'},
  }], has_more: false}));
  const result = await execute(parseArgs(['diagnose', '--run', 'demo01']), h.dependencies);
  assert.equal(result.requests[2].observedTransfers[0].returnedReference, 'gateway_generated_reference');
  assert.equal(result.requests[2].observedTransfers[0].referenceMatches, false);
  assert.deepEqual(result.requests[2].matches, []);
  assert(!JSON.stringify(result).includes('SECRET_NAME'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.directory, 'demo01.json'), 'utf8')).status, 'unresolved');
});

test('requires explicit test confirmation and rejects arbitrary credential arguments', () => {
  assert.throws(() => parseArgs(['send', '--run', 'demo01', '--wallet', 'wallet_demo', '--bic', 'UBPHPHMMXXX']));
  assert.throws(() => parseArgs(['inspect', '--secret', 'sk_live_never']));
  assert.throws(() => parseArgs(['status', '--run', '../escape']));
});
test('rejects live credentials before any client request', async t => {
  const h = harness(t); h.dependencies.readSecret = () => ('sk_' + 'live_' + 'feastaSyntheticFixtureNotCredential0001');
  await assert.rejects(execute(send(), h.dependencies), /Test credential/);
  assert.equal(h.requests.length, 0);
});
for (const scenario of [{live: true}, {balance: 89999}]) {
  test('rejects live or unfunded wallets before POST: ' + JSON.stringify(scenario), async t => {
    const h = harness(t, scenario);
    await assert.rejects(execute(send(), h.dependencies));
    assert.equal(h.requests.filter(request => request.method === 'POST').length, 0);
  });
}
test('records matched gateway test success without credentials or source bank details; repeated send cannot POST', async t => {
  const h = harness(t);
  const result = await execute(send(), h.dependencies);
  assert.equal(result.status, 'confirmed_test_success');
  assert.equal(result.canonicalAccountingChanged, false);
  const receipt = fs.readFileSync(result.receipt, 'utf8');
  assert(!receipt.includes(('sk_' + 'test_' + 'feastaSyntheticFixtureNotCredential0001')));
  assert(!receipt.includes('SECRET SOURCE NAME'));
  assert(!receipt.includes('000000000001'));
  await assert.rejects(execute(send(), h.dependencies), /already exists/);
  const status = await execute(parseArgs(['status', '--run', 'demo01']), h.dependencies);
  assert.equal(status.status, 'confirmed_test_success');
  assert.equal(h.requests.filter(request => request.method === 'POST').length, 1);
});
test('persists uncertainty and blocks replacement runs after a lost POST response', async t => {
  const h = harness(t, {uncertain: true});
  await assert.rejects(execute(send(), h.dependencies));
  const receipt = JSON.parse(fs.readFileSync(path.join(h.directory, 'demo01.json'), 'utf8'));
  assert.equal(receipt.status, 'unresolved');
  const count = h.requests.length;
  await assert.rejects(execute({...send(), run: 'replacement'}, h.dependencies), /earlier demo is unresolved/);
  assert.equal(h.requests.length, count);
});
test('mismatched amount never becomes success', async t => {
  const h = harness(t, {mismatch: true});
  await assert.rejects(execute(send(), h.dependencies));
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.directory, 'demo01.json'), 'utf8')).status, 'unresolved');
});
test('rejects canonical payout IDs in an isolated demo receipt', () => {
  assert.throws(() => assertDemoAttempt({providerDisbursementId: 'provider_disbursement_real'}, 'demo01'));
});
test('inspect returns wallet metadata without source account numbers', async t => {
  const h = harness(t);
  h.dependencies.listWallets = async () => [{walletId: 'wallet_demo', merchantId: 'org_demo',
    livemode: false, status: 'activated', currency: 'PHP', availableBalanceInCentavos: 1000000,
    accountNumber: 'NEVER_SHOW_THIS'}];
  const result = await execute(parseArgs(['inspect']), h.dependencies);
  assert.equal(result.wallets[0].usableTestWallet, true);
  assert(!JSON.stringify(result).includes('NEVER_SHOW_THIS'));
});
