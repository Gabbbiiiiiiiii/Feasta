import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Windows-safe file:// import. node --experimental-strip-types --test
const moduleFile = resolve(dirname(fileURLToPath(import.meta.url)),
  '../src/packages/occasion-transition-inventory-scan.ts');
const {scanOccasionPackageInventory: scan} = await import(pathToFileURL(moduleFile).href);
const pub = (overrides = {}) => ({providerId:'provider1',
  eventType:'birthday',status:'published',isActive:true,isPublished:true,
  providerPubliclyVisible:true, ...overrides});
const doc = (id, data=pub()) => ({id,data});
function fakePages(rows, opts={}) {
  const data = [...rows];
  const calls=[];
  return {calls, readPage: async(after,limit)=>{
    calls.push({after,limit});
    if (opts.rejectAt && calls.length===opts.rejectAt) throw new Error('FIRESTORE_QUERY_FAILED');
    return data.filter(row => after===null || row.id>after).slice(0,limit);
  }};
}
const input = (readPage, extra={})=>({action:'activate',occasionId:'birthday',
  applicableCategoryCodes:['catering_service'],readPage,...extra});

// Pure planner tests use fake backend pages; no Firebase initialization.
test('enumerates a terminal page and reports only potential candidates, never permission',async()=>{
  const f=fakePages([doc('p001'),doc('p002',pub({eventType:'wedding'}))]);
  const r=await scan(input(f.readPage));
  assert.deepEqual(r.candidatePackageIds,['p001']);
  assert.equal(r.scannedCount,2);assert.equal(r.pageCount,2);
  assert.equal(r.terminalPageReached,true);
  assert.equal(r.canWithdraw,false);assert.equal(r.canActivate,false);
  assert.equal(r.canRestore,false);assert.equal(r.allWritersFenced,false);
  assert.equal(r.snapshotIsolated,false);
  assert.deepEqual(f.calls.map(c=>c.limit),[100,100]);
});
test('empty inventory still blocks activation and withdrawal',async()=>{
  const r=await scan(input(fakePages([]).readPage));
  assert.equal(r.scannedCount,0);assert.deepEqual(r.candidatePackageIds,[]);
  assert.equal(r.canActivate,false);assert.equal(r.canWithdraw,false);
});
test('two full pages plus terminal page are required',async()=>{
  const rows=Array.from({length:200},(_,i)=>doc(`p${String(i).padStart(3,'0')}`));
  const f=fakePages(rows);const r=await scan(input(f.readPage));
  assert.equal(r.scannedCount,200);assert.equal(r.pageCount,3);
  assert.equal(f.calls[2].after,'p199');
});
test('specific V2 match and universal eligible category are candidates',async()=>{
  const f=fakePages([
    doc('p001',pub({occasionSchemaVersion:2, occasionScope:'specific',
      occasionIds:['birthday'], occasionMatchIds:['birthday']})),
    doc('p002',pub({occasionSchemaVersion:2, occasionScope:'all',
      occasionIds:[],occasionMatchIds:['wedding'],serviceCategoryCode:'catering_service'})),
    doc('p003',pub({occasionSchemaVersion:2,occasionScope:'all',
      occasionIds:[],occasionMatchIds:['wedding'],serviceCategoryCode:'photographer'})),
  ]);
  const r=await scan(input(f.readPage));
  assert.deepEqual(r.candidatePackageIds,['p001','p002']);
  assert.deepEqual(r.ambiguousPackageIds,[]);
});
test('unknown legacy event and corrupt schema are quarantined as ambiguous',async()=>{
  const r=await scan(input(fakePages([
    doc('p001',pub({eventType:'all'})),
    doc('p002',pub({occasionSchemaVersion:2,occasionScope:'all',occasionIds:'bad'})),
    doc('p003',pub({occasionIds:['birthday']})),
  ]).readPage));
  assert.deepEqual(r.ambiguousPackageIds,['p001','p002','p003']);
});
test('private packages do not become withdrawal candidates',async()=>{
  const r=await scan(input(fakePages([doc('p001',pub({status:'draft',
    isActive:false,isPublished:false,providerPubliclyVisible:false}))]).readPage));
  assert.deepEqual(r.candidatePackageIds,[]);
});
test('failed later page is never treated as complete',async()=>{
  const f=fakePages([doc('p001')],{rejectAt:2});
  await assert.rejects(scan(input(f.readPage)),/FIRESTORE_QUERY_FAILED/);
});
test('reader must return strict ascending unique IDs across pages',async()=>{
  for(const rows of [[doc('p002'),doc('p001')],[doc('p001'),doc('p001')],
    [{id:'../../escape',data:pub()}],[{id:'p001',data:null}]]){
    await assert.rejects(scan(input(async()=>rows)),
      /UNSORTED_OR_MALFORMED_OCCASION_INVENTORY/);
  }
});
test('rejects overfull pages',async()=>{
  const rows=Array.from({length:101},(_,i)=>doc(`p${String(i).padStart(3,'0')}`));
  await assert.rejects(scan(input(async()=>rows)),/INVALID_OCCASION_INVENTORY_PAGE/);
});
test('valid target and category input required, no browser-owned completion bit',async()=>{
  const reader=fakePages([]).readPage;
  for(const patch of [{occasionId:'../birthday'},{occasionId:'Birthday'},
    {action:'rollback'}, {applicableCategoryCodes:[]},
    {applicableCategoryCodes:['catering_service','catering_service']},
    {readPage:null}]){
    await assert.rejects(scan(input(reader,patch)),/INVALID_OCCASION_INVENTORY_REQUEST/);
  }
});
test('bounded scan must reach an empty page and cannot silently truncate',async()=>{
  let n=0;
  const readPage=async()=>Array.from({length:100},(_,i)=>doc(`p${String(n++).padStart(6,'0')}`));
  await assert.rejects(scan(input(readPage)),/OCCASION_INVENTORY_NOT_EXHAUSTED/);
});
test('no Firestore writes, lifecycle entrypoint or mutation exported',async()=>{
  const {readFileSync}=await import('node:fs');const s=readFileSync(moduleFile,'utf8');
  assert.doesNotMatch(s,/\.update\(|\.set\(|\.create\(|\.delete\(/u);
  assert.doesNotMatch(s,/onCall\(|runTransaction\(/u);
});
test('private Firestore adapter uses stable ascending document IDs only',async()=>{
  const {readFileSync}=await import('node:fs');
  const adapter=resolve(dirname(fileURLToPath(import.meta.url)),
    '../src/packages/occasion-transition-inventory-server.ts');
  const s=readFileSync(adapter,'utf8');
  assert.match(s,/\.collection\("packages"\)\.orderBy\(FieldPath\.documentId\(\)\)/u);
  assert.match(s,/base\.startAfter\(afterId\)/u);
  assert.match(s,/\.limit\(limit\)/u);
  assert.doesNotMatch(s,/onCall\(|onRequest\(|runTransaction\(|\.update\(|\.create\(/u);
});
