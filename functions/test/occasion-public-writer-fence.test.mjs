import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {stableOccasionPublicationGeneration} from '../src/packages/occasion-publication-generation.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(resolve(repo, path), 'utf8').replace(/\r\n/g, '\n');
const addon = read('functions/src/providers/provider-service-management.ts');
const gallery = read('apps/web/src/lib/provider/provider-setup-gallery-service.ts');

function between(text, from, until) {
  const at = text.indexOf(from);
  assert.ok(at >= 0, `missing ${from}`);
  const end = text.indexOf(until, at + from.length);
  assert.ok(end >= 0, `missing ${until}`);
  return text.slice(at, end);
}

test('generation validation refuses missing, transitioning and malformed catalog', () => {
  assert.equal(stableOccasionPublicationGeneration({activationState:'stable', revision:2}), 2);
  for (const row of [null, {}, {activationState:'transitioning',revision:2},
    {activationState:'stable',revision:0}, {activationState:'stable',revision:'2'},
    {activationState:'stable',revision:2.2}, {activationState:'stable',revision:Infinity}]) {
    assert.equal(stableOccasionPublicationGeneration(row), null);
  }
});

test('add-on publisher reads catalog generation inside existing transaction before making public', () => {
  const scope = between(addon, 'validatePublishableService(\n          current,\n        );', 'transaction.update(\n          reference,');
  assert.match(scope,/transaction\.get\([\s\S]*?occasionCatalog[\s\S]*?current/);
  assert.match(scope,/stableOccasionPublicationGeneration\(occasionCatalog\.data\(\)\)/);
  assert.match(scope,/throw new HttpsError/);
  assert.match(addon, /from "\.\.\/packages\/occasion-publication-generation\.js"/);
});

test('V1 gallery public replacement reads catalog generation in same transaction before write', () => {
  const scope=between(gallery, 'if (setups.some((setup) => setup.isPublished)) {', 'transaction.set(setupRef, {');
  assert.match(scope,/await transaction\.get\([\s\S]*?occasionCatalog[\s\S]*?current/);
  assert.match(scope,/activationState !== "stable"/);
  assert.match(scope,/Number\.isSafeInteger\(revision\)/);
  assert.match(scope,/Setup publication is unavailable during occasion maintenance/);
});

test('gallery private draft writes are not blocked by the public generation conditional', () => {
  assert.match(gallery,/if \(setups\.some\(\(setup\) => setup\.isPublished\)\) \{/);
  assert.match(gallery,/transaction\.set\(setupRef, \{/);
});

test('fences do not export lifecycle mutation or override activation flag', () => {
  const text=addon+gallery;
  assert.doesNotMatch(text,/transaction\.(update|set)\(\s*[^,]*occasionCatalog/);
  assert.doesNotMatch(text,/lifecycleAvailable:\s*true/);
});
