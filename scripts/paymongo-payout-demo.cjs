/* Isolated PayMongo TEST transport demonstration. No Firebase SDK or database writes. */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const RUN = /^[A-Za-z0-9_-]{1,80}$/;
const HELP = `PayMongo test payout demo (never changes FEASTA earnings)
  node scripts/paymongo-payout-demo.cjs inspect
  node scripts/paymongo-payout-demo.cjs relationships
  node scripts/paymongo-payout-demo.cjs send --run demo01 --wallet wallet_ID --bic VERIFIED_BIC --confirm-test-transfer
  node scripts/paymongo-payout-demo.cjs status --run demo01
  node scripts/paymongo-payout-demo.cjs diagnose --run demo01
  node scripts/paymongo-payout-demo.cjs reconcile --run demo01 --transfer tr_ID
Uses PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY version 1 in feasta-catering-system.
Amount: PHP 900.00; simulator destination: 999999990001. No real money moves.`;

function parseArgs(args) {
  const [command = 'help', ...rest] = args;
  if (!['help', 'inspect', 'relationships', 'send', 'status', 'diagnose', 'reconcile'].includes(command)) throw Error('Unknown command. Use help.');
  const options = {command};
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (flag === '--confirm-test-transfer') {
      if (options.confirm) throw Error('Duplicate confirmation.');
      options.confirm = true;
    } else if (['--run', '--wallet', '--bic', '--transfer'].includes(flag)) {
      const key = flag.slice(2);
      if (options[key] || !rest[index + 1] || rest[index + 1].startsWith('--')) throw Error('Invalid arguments.');
      options[key] = rest[++index];
    } else throw Error('Unknown argument. Never pass credentials on the command line.');
  }
  if (['send', 'status', 'diagnose', 'reconcile'].includes(command) && !RUN.test(options.run ?? '')) throw Error('A valid --run is required.');
  if (command === 'reconcile' ? !/^tr_[A-Za-z0-9_-]{1,200}$/.test(options.transfer ?? '') : options.transfer) {
    throw Error('Only reconcile accepts --transfer, which must be a valid transfer ID.');
  }
  if (command === 'send' && (!options.confirm || !/^wallet_[A-Za-z0-9_-]{3,200}$/.test(options.wallet ?? '') ||
      !/^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(options.bic ?? ''))) {
    throw Error('Send requires --confirm-test-transfer, --wallet and a verified --bic.');
  }
  if (command !== 'send' && (options.confirm || options.wallet || options.bic)) throw Error('Send-only arguments supplied.');
  return options;
}

function readTestSecret() {
  let value;
  try {
    // Constant command: credentials appear in captured stdout only, never in arguments or logs.
    const command = 'gcloud secrets versions access 1 --secret=PAYMONGO_DISBURSEMENT_TEST_SECRET_KEY --project=feasta-catering-system --quiet';
    value = process.platform === 'win32'
      ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& ${command}; exit $LASTEXITCODE`], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000}).trim()
      : execFileSync('gcloud', command.split(' ').slice(1), {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000}).trim();
  } catch { throw Error('Could not read dedicated test credential. Check gcloud access.'); }
  if (!/^sk_test_[A-Za-z0-9_-]+$/.test(value)) throw Error('Dedicated sk_test_ credential required. No request sent.');
  return value;
}

function assertDemoAttempt(attempt, run) {
  if (attempt.providerDisbursementId !== `feasta_demo_${run}` || attempt.amountInCentavos !== 90000 ||
      attempt.livemode !== false || attempt.destinationSnapshot?.testMode !== true ||
      attempt.destinationSnapshot?.allowedDisbursementId !== `feasta_demo_${run}` ||
      attempt.destinationSnapshot?.destinationAccount?.number !== '999999990001') {
    throw Error('Receipt is not an isolated test demonstration.');
  }
}

/** GET-only diagnostics. No raw gateway bodies, bank details or credentials are returned. */
async function diagnose(attempt, secret, http = fetch) {
  const reference = attempt.referenceNumber;
  const requests = [];
  for (const endpoint of [
    `/v2/wallets/${attempt.destinationSnapshot.walletId}?fields=balance`,
    `/v2/transfers?limit=100&reference_number=${encodeURIComponent(reference)}`,
    '/v2/transfers?limit=100',
  ]) {
    const result = {endpoint, method: 'GET'};
    try {
      const response = await http('https://api.paymongo.com' + endpoint, {method: 'GET',
        redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: {Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64')}});
      result.httpStatus = response.status;
      const body = await response.json();
      result.responseFields = body && typeof body === 'object' ? Object.keys(body) : [];
      result.errorCodes = Array.isArray(body?.errors) ? body.errors.map(error => error?.code)
        .filter(code => typeof code === 'string' && /^[a-z0-9_-]{1,80}$/i.test(code)) : [];
      const data = body?.data;
      if (endpoint.startsWith('/v2/wallets/')) {
        const wallet = data?.attributes ?? data;
        result.walletId = data?.id;
        result.livemode = typeof wallet?.livemode === 'boolean' ? wallet.livemode : null;
        result.availableBalanceInCentavos = Number.isSafeInteger(wallet?.balance?.available) ? wallet.balance.available : null;
      } else {
        const rows = Array.isArray(data) ? data : data?.transfers ?? data?.attributes?.transfers;
        result.dataFields = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [];
        result.rowCount = Array.isArray(rows) ? rows.length : null;
        result.hasMore = body?.has_more ?? data?.has_more ?? body?.meta?.has_more ?? null;
        result.observedTransfers = Array.isArray(rows) ? rows.slice(0, 10).map(row => {
          const transfer = row.attributes ?? row;
          const destination = transfer.destination_account ?? transfer.receiver;
          const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_: -]{1,220}$/.test(value) ? value : null;
          return {
            transferId: safeId(row.id), type: safeId(row.type), fields: Object.keys(transfer),
            returnedReference: safeId(transfer.reference_number), batchId: safeId(transfer.batch_transfer_id),
            status: safeId(transfer.status), amountInCentavos: Number.isSafeInteger(transfer.amount) ? transfer.amount : null,
            currency: safeId(transfer.currency), livemode: transfer.livemode ?? row.livemode ?? null,
            createdAt: transfer.created_at ?? null,
            referenceMatches: transfer.reference_number === reference,
            attemptMetadataMatches: transfer.metadata?.feasta_external_attempt_id === attempt.externalAttemptId,
            demoMetadataMatches: transfer.metadata?.feasta_disbursement_id === attempt.providerDisbursementId,
            amountMatches: transfer.amount === attempt.amountInCentavos,
            merchantMatches: transfer.merchant_id === attempt.destinationSnapshot.sourceMerchantId,
            destinationNumberMatches: (destination?.number ?? destination?.bank_account_number) === attempt.destinationSnapshot.destinationAccount.number,
            destinationBicMatches: (destination?.bic ?? destination?.bank_code) === attempt.destinationSnapshot.destinationAccount.bic,
          };
        }) : [];
        result.matches = Array.isArray(rows) ? rows.filter(row => (row.attributes ?? row).reference_number === reference)
          .map(row => {const transfer = row.attributes ?? row; return {
            transferId: row.id, reference: transfer.reference_number, status: transfer.status,
            amountInCentavos: transfer.amount, currency: transfer.currency, livemode: transfer.livemode ?? row.livemode ?? null,
          };}) : [];
      }
    } catch { result.readError = 'network_timeout_or_unreadable_response'; }
    requests.push(result);
  }
  return {testOnly: true, canonicalAccountingChanged: false, reference, requests,
    conclusion: 'Diagnostic observations only. An empty lookup does not prove the original POST was rejected. No resend authorized.'};
}

async function execute(options, dependencies = {}) {
  if (options.command === 'help') return {help: HELP};
  const secret = (dependencies.readSecret ?? readTestSecret)();
  if (!/^sk_test_[A-Za-z0-9_-]+$/.test(secret)) throw Error('Test credential required.');
  if (options.command === 'relationships') {
    const http=dependencies.http ?? fetch;
    const get=async endpoint=>{
      const response=await http('https://api.paymongo.com'+endpoint,{method:'GET',redirect:'error',
        signal:AbortSignal.timeout(10000),headers:{Accept:'application/json',
          Authorization:'Basic '+Buffer.from(secret+':').toString('base64')}});
      if(!response.ok) throw Error('Read-only relationship inventory unavailable.');
      return response.json();
    };
    const accountBody=await get('/v2/accounts/org_test_merchant');
    const account=accountBody.data?.attributes ?? accountBody.data;
    const body=await get('/v2/relationships?limit=100');
    if(!Array.isArray(body.data) || body.data.length>100 || typeof body.has_more!=='boolean') throw Error('Unknown relationship response shape.');
    const safeId=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,220}$/.test(value)?value:null;
    const relationships=body.data.map(resource=>{
      const value=resource.attributes ?? resource;
      if(typeof value.enabled!=='boolean' || !safeId(resource.id) || !safeId(value.parent_account?.id) || !safeId(value.child_account?.id)) {
        throw Error('Invalid relationship identity.');
      }
      return {relationshipId:resource.id,parentAccountId:value.parent_account.id,childAccountId:value.child_account.id,
        enabled:value.enabled,linkingRequestId:safeId(value.linking_request_id),
        matchesStoredChild:value.child_account.id==='org_test_merchant'};
    });
    return {credentialMode:'test',relationshipsSharedAcrossModes:true,canonicalAccountingChanged:false,
      storedChild:{requestedId:'org_test_merchant',returnedId:safeId(accountBody.data?.id),
        activationStatus:safeId(account?.activation_status),
        identityVerificationStatus:safeId(account?.person?.identity_verification_status ?? account?.identity_verification_status)},
      relationships,hasMore:body.has_more,
      next:body.has_more?'Inventory incomplete. Do not infer a missing relationship.':
        relationships.some(value=>value.matchesStoredChild)?'Validate the exact relationship and provider ownership before refreshing readiness.':
          'No link to the stored mock child. Verify parent Linked Accounts access and the actual provider child mapping in PayMongo. Do not fabricate a link.'};
  }
  const clientModule = dependencies.clientModule ?? require('../functions/lib/provider-finance/paymongo-disbursement-client.js');
  const domain = dependencies.domain ?? require('../functions/lib/provider-finance/provider-disbursement-domain.js');
  if (options.command === 'inspect') {
    const list = dependencies.listWallets ?? require('../functions/lib/provider-finance/paymongo-wallet-client.js').listPayMongoWallets;
    const wallets = await list({secretKey: secret});
    return {testOnly: true, canonicalAccountingChanged: false, wallets: wallets.map(wallet => ({
      walletId: wallet.walletId, merchantId: wallet.merchantId, livemode: wallet.livemode,
      status: wallet.status, currency: wallet.currency, availableBalanceInCentavos: wallet.availableBalanceInCentavos,
      usableTestWallet: wallet.livemode === false && wallet.status === 'activated' && wallet.currency === 'PHP' &&
        Number.isSafeInteger(wallet.availableBalanceInCentavos) && wallet.availableBalanceInCentavos >= 90000,
    }))};
  }
  const directory = dependencies.directory ?? path.join(ROOT, '.local', 'paymongo-payout-demo');
  fs.mkdirSync(directory, {recursive: true});
  const filename = path.join(directory, `${options.run}.json`);
  if (options.command === 'diagnose') {
    const receipt = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (receipt.testOnly !== true || receipt.canonicalAccountingChanged !== false || !receipt.attempt) throw Error('Invalid demo receipt.');
    assertDemoAttempt(receipt.attempt, options.run);
    return diagnose(receipt.attempt, secret, dependencies.http);
  }
  const lockname = path.join(directory, 'demo.lock');
  let lock;
  try { lock = fs.openSync(lockname, 'wx'); } catch { throw Error('This run is already active. Do not start a duplicate transfer.'); }
  const save = value => {
    const temporary = `${filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), {mode: 0o600});
    fs.renameSync(temporary, filename);
  };
  let receipt;
  try {
    const client = clientModule.createPayMongoDisbursementClient({secretKey: () => secret,
      authorizeSubmission: async attempt => {
        assertDemoAttempt(attempt, options.run);
        receipt.status = 'submission_started';
        save(receipt); // Durable uncertainty marker before every possible POST.
      }});
    if (options.command === 'status' || options.command === 'reconcile') {
      receipt = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (receipt.testOnly !== true || receipt.canonicalAccountingChanged !== false || !receipt.attempt) throw Error('No submitted demo to retrieve.');
      assertDemoAttempt(receipt.attempt, options.run);
      const transferId = options.command === 'reconcile' ? options.transfer :
        receipt.referenceNormalization === 'pd_prefix_underscore_to_hyphen' ? receipt.attempt.gatewayResourceId : null;
      const evidence = transferId
        ? await reconcileDemoTransfer(receipt.attempt, transferId, secret, clientModule, dependencies.http)
        : await client.retrieve(receipt.attempt);
      if (!evidence) return {testOnly: true, status: 'unresolved', next: 'Keep this receipt. Do not resubmit or create a replacement run.'};
      receipt.evidence = evidence;
      if (transferId) receipt.referenceNormalization = 'pd_prefix_underscore_to_hyphen';
    } else {
      if (fs.existsSync(filename)) throw Error('Run already exists. Use status; send never resubmits an existing run.');
      for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.json'))) {
        const previous = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
        if (['submission_started', 'unresolved', 'pending'].includes(previous.status)) {
          throw Error('An earlier demo is unresolved. Use status for that run before sending another.');
        }
      }
      receipt = {schemaVersion: 1, testOnly: true, canonicalAccountingChanged: false,
        run: options.run, status: 'preflight', createdAt: new Date().toISOString()};
      save(receipt);
      const wallet = await client.verifyWallet(options.wallet);
      if (wallet.livemode !== false || wallet.status !== 'activated' || wallet.currency !== 'PHP' ||
          !/^org_[A-Za-z0-9_-]{3,200}$/.test(wallet.merchantId ?? '') || wallet.availableBalanceInCentavos < 90000) {
        throw Error('An activated, funded PHP test wallet is required. No transfer sent.');
      }
      const id = `feasta_demo_${options.run}`;
      receipt.attempt = {schemaVersion: 1, ...domain.externalAttemptIdentity(id, 1),
        providerDisbursementId: id, attemptSequence: 1, amountInCentavos: 90000, currency: 'PHP',
        transportMode: 'wallet_transfer', livemode: false, status: 'reserved', gatewayResourceId: null,
        destinationSnapshot: {testMode: true, livemode: false, allowedDisbursementId: id,
          walletId: options.wallet, provider: 'instapay', sourceMerchantId: wallet.merchantId,
          verificationExpiresAtMs: Date.now() + 15 * 60 * 1000,
          destinationAccount: {number: '999999990001', name: 'FEASTA ISOLATED TEST DEMO', bic: options.bic}}};
      assertDemoAttempt(receipt.attempt, options.run);
      save(receipt);
      receipt.evidence = await client.dispatch(receipt.attempt);
    }
    const evidence = receipt.evidence;
    // Production client validates reference, destination, amount, currency and test-mode evidence.
    receipt.attempt.gatewayResourceId = evidence.id;
    receipt.attempt.status = 'processing';
    receipt.status = evidence.status === 'succeeded' ? 'confirmed_test_success' :
      evidence.status === 'failed' ? 'confirmed_test_failure' : 'pending';
    receipt.updatedAt = new Date().toISOString();
    save(receipt);
    return {testOnly: true, canonicalAccountingChanged: false, status: receipt.status,
      transferId: evidence.id, reference: evidence.reference_number, receipt: filename};
  } catch (error) {
    if (receipt && options.command === 'send') {
      receipt.status = receipt.status === 'submission_started' ? 'unresolved' : 'not_submitted';
      save(receipt);
    }
    throw error;
  } finally { if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockname); } }
}

/** Narrow recovery for the operator-observed pd_ -> pd- gateway reference conversion.
 * Metadata, source wallet, merchant and exact destination remain mandatory. Never used by canonical payouts. */
async function reconcileDemoTransfer(attempt, transferId, secret, clientModule, http = fetch) {
  clientModule.validateTestAttempt(attempt);
  if (!/^tr_[A-Za-z0-9_-]{1,200}$/.test(transferId)) throw Error('Invalid transfer identity.');
  if (attempt.gatewayResourceId && attempt.gatewayResourceId !== transferId) throw Error('Transfer identity changed.');
  const get = async endpoint => {
    const response = await http('https://api.paymongo.com' + endpoint, {method: 'GET', redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: {Accept: 'application/json',
        Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64')}});
    if (!response.ok) throw Error('Read-only reconciliation unavailable.');
    return response.json();
  };
  const walletBody = await get(`/v2/wallets/${attempt.destinationSnapshot.walletId}?fields=account&fields=balance`);
  const source = clientModule.testWalletSource(walletBody, attempt.destinationSnapshot.walletId);
  const wallet = walletBody.data.attributes ?? walletBody.data;
  const body = await get(`/v2/transfers/${transferId}`);
  const resource = body.data;
  const transfer = resource?.attributes ?? resource;
  const snapshot = attempt.destinationSnapshot;
  const destination = transfer?.destination_account;
  const returnedSource = transfer?.source_account;
  const reference = transfer?.reference_number;
  if (resource?.id !== transferId || transfer?.livemode !== false ||
      (resource.livemode !== undefined && resource.livemode !== false) ||
      wallet.merchant_id !== snapshot.sourceMerchantId || transfer.merchant_id !== snapshot.sourceMerchantId ||
      transfer.amount !== attempt.amountInCentavos || transfer.currency !== 'PHP' || transfer.provider !== 'instapay' ||
      !['pending', 'succeeded', 'failed'].includes(transfer.status) ||
      ![attempt.referenceNumber, attempt.referenceNumber.replace(/^pd_/, 'pd-')].includes(reference) ||
      transfer.metadata?.feasta_external_attempt_id !== attempt.externalAttemptId ||
      transfer.metadata?.feasta_disbursement_id !== attempt.providerDisbursementId ||
      transfer.metadata?.feasta_test_mode !== true ||
      ['number', 'name', 'bic'].some(key => destination?.[key] !== snapshot.destinationAccount[key] || returnedSource?.[key] !== source[key])) {
    throw Error('Transfer does not satisfy isolated demo reconciliation evidence.');
  }
  return {id: transferId, reference_number: reference, amount: transfer.amount, currency: 'PHP',
    livemode: false, status: transfer.status, destination_account: {...snapshot.destinationAccount}};
}

module.exports = {parseArgs, assertDemoAttempt, execute, reconcileDemoTransfer, HELP};
if (require.main === module) {
  (async () => {
    try { console.log(JSON.stringify(await execute(parseArgs(process.argv.slice(2))), null, 2)); }
    catch (error) {
      console.error('Demo could not complete. No FEASTA accounting changed. See docs/domain/provider-payout-test-demo.md.');
      if (['secret_invalid', 'authority_invalid', 'wallet_verification_failed', 'wallet_balance_invalid',
        'wallet_balance_insufficient', 'submission_unconfirmed'].includes(error.reasonCode)) console.error('Reason: ' + error.reasonCode);
      console.error('Keep any existing receipt. Use status for an unresolved transfer; never create a replacement run.');
      process.exitCode = 1;
    }
  })();
}
