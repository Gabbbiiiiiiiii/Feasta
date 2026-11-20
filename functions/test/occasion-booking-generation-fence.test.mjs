import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bookingPath = resolve(here, '../src/bookings/submit-booking-request.ts');
const publisherPath = resolve(here, '../src/packages/publish-provider-package.ts');
const helperPath = resolve(here, '../src/packages/occasion-publication-generation.ts');
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const {stableOccasionPublicationGeneration: stable} = await import(pathToFileURL(helperPath).href);

test('booking generation helper refuses missing, transitioning and invalid authority', () => {
  assert.equal(stable({activationState: 'stable', revision: 2}), 2);
  for (const value of [null, {}, {revision: 2}, {activationState: 'transitioning', revision: 2},
    {activationState: 'blocked', revision: 2}, {activationState: 'stable', revision: 0},
    {activationState: 'stable', revision: '2'}, {activationState: 'stable', revision: 2.5},
    {activationState: 'stable', revision: Number.MAX_SAFE_INTEGER + 1}]) {
    assert.equal(stable(value), null);
  }
});

test('booking reads stable generation inside transaction before new-request flow', () => {
  const code = read(bookingPath);
  assert.match(code, /import \{stableOccasionPublicationGeneration\} from "\.\.\/packages\/occasion-publication-generation\.js";/);
  const txnStart = code.indexOf('const result = await db.runTransaction(');
  const replayStart = code.indexOf('if (existingSnapshot.exists)', txnStart);
  const replayReturn = code.indexOf('created: false,', replayStart);
  const catalogRead = code.indexOf('const occasionCatalogSnapshot = await transaction.get(', replayStart);
  const guard = code.indexOf('stableOccasionPublicationGeneration(occasionCatalogSnapshot.data())', catalogRead);
  const rollout = code.indexOf('const initialPaymentRollout = await readInitialPaymentRollout(transaction);', txnStart);
  assert.ok(txnStart >= 0 && replayStart > txnStart && replayReturn > replayStart && catalogRead > replayReturn &&
    guard > catalogRead && rollout > guard, 'only NEW booking submissions must read the catalog generation in the same transaction');
  assert.match(code.slice(catalogRead, guard), /db\.collection\("occasionCatalog"\)\.doc\("current"\)/);
  assert.match(code.slice(guard, rollout), /throw new HttpsError\(\s*"failed-precondition"/);
  assert.equal(code.split('occasionCatalogSnapshot = await transaction.get(').length - 1, 1);
});

test('existing V2 package booking guard and publisher fence remain in place', () => {
  const booking = read(bookingPath);
  const publisher = read(publisherPath);
  assert.match(booking, /!isLegacyOccasionPackage\(packageData\)/);
  assert.match(publisher, /!isLegacyOccasionPackage\(packageRecord\.packageData\)/);
  assert.match(publisher, /stableOccasionPublicationGeneration\(catalogSnapshot\.data\(\)\)/);
});

test('booking generation protection never changes occasion lifecycle or grants', () => {
  const booking = read(bookingPath);
  const section = booking.slice(booking.indexOf('const occasionCatalogSnapshot = await transaction.get('),
    booking.indexOf('const initialPaymentRollout = await readInitialPaymentRollout(transaction);'));
  assert.doesNotMatch(section, /transaction\.(update|set|create|delete)\(/);
  assert.doesNotMatch(section, /(active:\s*true|approvedOccasionIds|activationState:\s*["']stable["'])/);
});
