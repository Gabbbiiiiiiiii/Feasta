import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, dirname} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const moduleFile = resolve(here, '../src/packages/occasion-publication-generation.ts');
const publicationFile = resolve(here, '../src/packages/publish-provider-package.ts');
const {stableOccasionPublicationGeneration: stable, activeOccasionAuthority: active} =
  await import(pathToFileURL(moduleFile).href);

test('new publication and bookings require approved active occasion authority and applicability', () => {
  const row = {id:'birthday', moderationState:'approved', active:true, revision:1,
    applicableServiceCategoryCodes:['catering_service']};
  assert.equal(active(row,'birthday','catering_service'),true);
  assert.equal(active(row,'birthday'),true);
  assert.equal(active(row,'birthday','photography'),false);
  for (const patch of [{id:'wedding'}, {active:false}, {active:'true'},
    {moderationState:'pending'}, {revision:0}, {revision:'1'}, {revision:1.5},
    {applicableServiceCategoryCodes:[]}, {applicableServiceCategoryCodes:['bad/path']},
    {applicableServiceCategoryCodes:['catering_service','catering_service']}]) {
    assert.equal(active({...row,...patch},'birthday'),false);
  }
  for (const row of [undefined,null,[],false]) assert.equal(active(row,'birthday'),false);
});

test('only a stable catalog with a positive integer revision permits legacy publication', () => {
  assert.equal(stable({activationState: 'stable', revision: 1}), 1);
  assert.equal(stable({activationState: 'stable', revision: Number.MAX_SAFE_INTEGER}), Number.MAX_SAFE_INTEGER);
  for (const input of [undefined, null, false, [], 'stable', {},
    {activationState: 'preparing', revision: 1},
    {activationState: 'transitioning', revision: 1},
    {activationState: 'blocked', revision: 1},
    {activationState: 'stable', revision: 0},
    {activationState: 'stable', revision: -1},
    {activationState: 'stable', revision: 1.5},
    {activationState: 'stable', revision: '1'},
    {activationState: 'stable', revision: Number.MAX_SAFE_INTEGER + 1},
    {activationState: 'stable', revision: NaN},
  ]) assert.equal(stable(input), null);
});

test('package publisher reads the exact catalog document within its transaction', () => {
  const code = readFileSync(publicationFile, 'utf8').replace(/\r\n/g, '\n');
  assert.match(code, /import \{stableOccasionPublicationGeneration\} from "\.\/occasion-publication-generation\.js";/);
  const transaction = code.indexOf('return db.runTransaction(');
  const read = code.indexOf('await transaction.get(\n          db.collection("occasionCatalog").doc("current"),\n        );');
  const gate = code.indexOf('stableOccasionPublicationGeneration(catalogSnapshot.data())');
  const update = code.indexOf('transaction.update(\n          packageReference,');
  assert.ok(transaction >= 0 && read > transaction && gate > read && update > gate,
    'generation must be read and checked in the SAME transaction before public write');
  assert.equal(code.split('db.collection("occasionCatalog").doc("current")').length - 1, 1);
});

test('old legacy V2 guard is still required before any new publication', () => {
  const code = readFileSync(publicationFile, 'utf8').replace(/\r\n/g, '\n');
  assert.match(code, /!isLegacyOccasionPackage\(packageRecord\.packageData\)/);
  assert.match(code, /V2 occasion packages require verified customer compatibility before publishing/);
  assert.match(code, /"failed-precondition"/);
});
