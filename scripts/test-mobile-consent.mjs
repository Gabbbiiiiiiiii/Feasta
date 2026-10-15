// Run inside isolated demo Auth/Firestore emulators. Backend source stays unchanged.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-feasta-consent');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:48080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:48999');
const backend = path.resolve(process.env.CONSENT_BACKEND || '../web/.validation/backend/functions');
const requireBackend = createRequire(path.join(backend, 'package.json'));
requireBackend('firebase-admin/app').initializeApp({projectId: 'demo-feasta-consent'});
const {db} = requireBackend('./lib/shared/firestore.js');
const {getAuth} = requireBackend('firebase-admin/auth');
const {ensureUserProfile} = requireBackend('./lib/auth/ensure-user-profile.js');
const auth = getAuth();
const identity = await auth.createUser({email: `mobile-${Date.now()}@example.test`});
const version = value => ({version: value, name: 'Published policy', effectiveDate: '2026-10-15', status: 'current', sections: [{title: 'Agreement', paragraphs: ['Demo policy text']}], createdAt: '2026-10-15T00:00:00Z', publishedAt: '2026-10-15T00:00:00Z', archivedAt: null});
for (const type of requireBackend('./lib/shared/agreement-types.js').initialAgreementTypes()) await db.doc(`agreementTypes/${type.code}`).set(type);
async function publish(terms) {
  await db.doc('agreementTemplates/terms_of_service').set({agreementTypeCode: 'terms_of_service', versions: [version(terms)]});
  await db.doc('agreementTemplates/privacy_policy').set({agreementTypeCode: 'privacy_policy', versions: [version('P-3')]});
}
await publish('T-7');
let rejected = 0;
const server = http.createServer(async (request, response) => {
  try {
    let raw = ''; for await (const chunk of request) raw += chunk;
    if (request.url === '/rotate') { await publish('T-8'); response.end('{}'); return; }
    const data = JSON.parse(raw);
    const before = (await db.doc(`users/${identity.uid}`).get()).data();
    const beforeCustomer = (await db.doc(`customers/${identity.uid}`).get()).data();
    try {
      const result = await ensureUserProfile.run({data, auth: {uid: identity.uid, token: {email: identity.email}}, rawRequest: {headers: {}, ip: '127.0.0.1'}});
      response.end(JSON.stringify({result}));
    } catch (error) {
      assert.deepEqual((await db.doc(`users/${identity.uid}`).get()).data(), before);
      assert.deepEqual((await db.doc(`customers/${identity.uid}`).get()).data(), beforeCustomer);
      rejected++;
      response.end(JSON.stringify({reason: error.details?.reason}));
    }
  } catch (error) { response.statusCode = 500; response.end(String(error)); }
});
await new Promise(resolve => server.listen(48081, '127.0.0.1', resolve));
const app = fileURLToPath(new URL('../apps/customer_mobile', import.meta.url));
const source = fs.readFileSync(path.join(app, 'lib/features/authentication/data/repositories/auth_repository.dart'), 'utf8');
const start = source.indexOf('  Future<void> _ensureCustomerProfile(');
const end = source.indexOf('  Future<void> _signOutIfLoginMustBeRejected', start);
assert.ok(start >= 0 && end > start);
// Extract the production method verbatim; only make its private name callable.
const method = source.slice(start, end).replace('_ensureCustomerProfile(', 'ensureCustomerProfile(');
const generated = `import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
class Bridge {
  Bridge httpsCallable(String name) { expect(name, 'ensureUserProfile'); return this; }
  Future<void> call(Map<String, dynamic> data) async {
    final result = await send('/', data);
    if (result['reason'] != null) throw result['reason']!;
  }
}
Future<Map<String, dynamic>> send(String route, Map<String, dynamic> data) async {
  final client = HttpClient();
  try {
    final request = await client.postUrl(Uri.parse('http://127.0.0.1:48081'+route));
    request.write(jsonEncode(data)); final response = await request.close();
    expect(response.statusCode, 200);
    return jsonDecode(await utf8.decoder.bind(response).join()) as Map<String, dynamic>;
  } finally { client.close(force: true); }
}
class Serializer {
 final _functions = Bridge();
${method}
}
void main() {
 test('original invalid-policy-version, corrected independent versions, stale rejection and explicit recovery', () async {
   final serializer = Serializer();
   await expectLater(serializer.ensureCustomerProfile(firstName: 'Mobile', lastName: 'Email', acceptedTerms: true, acceptedPrivacy: true), throwsA('invalid-policy-version'));
   await serializer.ensureCustomerProfile(firstName: 'Mobile', lastName: 'Email', acceptedTerms: true, acceptedPrivacy: true, termsPolicyVersion: 'T-7', privacyPolicyVersion: 'P-3');
   await send('/rotate', {});
   await expectLater(serializer.ensureCustomerProfile(acceptedTerms: true, acceptedPrivacy: true, termsPolicyVersion: 'T-7', privacyPolicyVersion: 'P-3'), throwsA('policy-version-outdated'));
   await serializer.ensureCustomerProfile(acceptedTerms: true, acceptedPrivacy: true, termsPolicyVersion: 'T-8', privacyPolicyVersion: 'P-3');
   await serializer.ensureCustomerProfile();
 });
}
`;
fs.mkdirSync(path.join(app, '.validation'), {recursive: true});
fs.writeFileSync(path.join(app, '.validation/.gitignore'), '*\n');
fs.writeFileSync(path.join(app, '.validation/email-consent.test.dart'), generated);
try {
  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'flutter test --no-pub .validation/email-consent.test.dart'], {cwd: app, stdio: 'inherit', windowsHide: true});
  const code = await new Promise(resolve => child.on('exit', resolve));
  assert.equal(code, 0);
  assert.equal(rejected, 2);
  const stored = (await db.doc(`users/${identity.uid}`).get()).data();
  assert.equal(stored.termsVersion, 'T-8'); assert.equal(stored.privacyVersion, 'P-3');
  console.log('PASS exact Flutter serializer / unchanged PR #8 handler / original failure / independent versions / stale recovery / empty sync / rejected calls wrote nothing');
} finally {
  await new Promise(resolve => server.close(resolve));
  await requireBackend('firebase-admin/app').deleteApp(requireBackend('firebase-admin/app').getApp());
}
