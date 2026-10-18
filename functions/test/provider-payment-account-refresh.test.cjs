const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const client = require('../lib/provider-finance/paymongo-linked-account-client.js');
const domain = require('../lib/provider-finance/provider-payment-relationship-domain.js');
const source = fs.readFileSync(path.join(__dirname, '../lib/provider-finance/provider-payment-account-management.js'), 'utf8');

function harness({relationship = null, error = null, activationStatus = 'activated', storedId = null} = {}) {
  const calls = [], updates = [];
  const account = {accountId: 'org_child123', accountType: 'merchant', activationStatus,
    relationshipId: null, identityVerificationStatus: 'pending', legalIdentityPresent: false};
  class HttpsError extends Error {
    constructor(code, message) {super(message); this.code = code;}
  }
  const mocks = {
    'firebase-functions/params': {defineSecret: () => ({value: () => 'sk_test_mock'})},
    'firebase-functions/v2/https': {HttpsError, onCall: (_options, handler) => handler},
    './paymongo-linked-account-client.js': {...client,
      retrievePayMongoLinkedAccount: async () => account,
      findPayMongoLinkedAccountRelationship: async input => {calls.push(['discover', input]); if (error) throw error; return relationship;},
      retrievePayMongoLinkedAccountRelationship: async input => {calls.push(['retrieve', input]); if (error) throw error; return relationship;},
    },
    './provider-payment-relationship-domain.js': domain,
    '../shared/timestamps.js': {serverTimestamp: () => 'timestamp'},
  };
  const context = {exports: {}, require: id => mocks[id] || {}};
  vm.runInNewContext(source + '\nexports.testRefresh = refreshChildAccount;', context);
  return {calls, updates, run: () => context.exports.testRefresh({
    accountReference: {update: async data => updates.push(data)},
    context: {linkedAccountType: 'merchant'}, accountId: account.accountId,
    stored: {paymongoAccountId: account.accountId, relationshipId: storedId, invitationId: null},
  })};
}
const relationship = {relationshipId: 'mr_real123', childAccountId: 'org_child123',
  parentAccountId: 'org_parent123', linkingRequestId: null, enabled: true};

test('activated account with no IDs discovers and verifies gateway relationship', async () => {
  const h = harness({relationship}); await h.run();
  assert.equal(h.calls[0][0], 'discover');
  assert.equal(h.calls[0][1].invitationId, null);
  assert.equal(h.updates[0].relationshipId, 'mr_real123');
  assert.equal(h.updates[0].relationshipVerificationStatus, 'verified');
  assert.equal(h.updates[0].settlementTransportReady, false);
  assert.equal(h.updates[0].settlementTransportMode, undefined);
});
test('absent relationship stays unknown and records not_found without inventing IDs', async () => {
  const h = harness(); await h.run();
  assert.equal(h.updates[0].relationshipId, null);
  assert.equal(h.updates[0].relationshipStatus, 'unknown');
  assert.equal(h.updates[0].relationshipVerificationStatus, 'not_found');
});
test('gateway failure records unavailable and leaves transport unready', async () => {
  const h = harness({error: new client.PayMongoLinkedAccountRequestError('Unavailable', 'ambiguous', 503)});
  await h.run();
  assert.equal(h.updates[0].relationshipVerificationStatus, 'unavailable');
  assert.equal(h.updates[0].relationshipStatus, 'unknown');
  assert.equal(h.updates[0].settlementTransportReady, false);
});
test('disabled gateway relationship remains disabled', async () => {
  const h = harness({relationship: {...relationship, enabled: false}}); await h.run();
  assert.equal(h.updates[0].relationshipStatus, 'disabled');
});
test('existing ID is retrieved rather than rediscovered', async () => {
  const h = harness({relationship, storedId: 'mr_real123'}); await h.run();
  assert.equal(h.calls[0][0], 'retrieve');
});
test('unactivated account skips relationship discovery', async () => {
  const h = harness({activationStatus: 'pending'}); await h.run();
  assert.equal(h.calls.length, 0);
  assert.equal(h.updates[0].relationshipVerificationStatus, 'not_checked');
});
test('mismatched gateway child fails closed', async () => {
  const h = harness({relationship: {...relationship, childAccountId: 'org_wrong123'}});
  await assert.rejects(h.run, /does not match/);
  assert.equal(h.updates.length, 0);
});
