const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {requireMaintenanceOpen, recordMaintenanceAdmission, parseMaintenance} = require('../lib/shared/maintenance.js');

// Optimistic transaction model: retries any read generation changed before commit.
// This proves our read/write placement; Firestore lock/drain behavior still needs emulator/live acceptance.
function store(initial = {}) {
  const rows = new Map(Object.entries(initial)); const versions = new Map();
  const ref = p => ({path: p, doc: id => ref(p + '/' + id)});
  const db = {doc: ref, collection: ref, runTransaction: async work => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const reads = new Map(), writes = [];
      const result = await work({get: async r => {
        reads.set(r.path, versions.get(r.path) ?? 0);
        return {exists: rows.has(r.path), data: () => rows.get(r.path)};
      }, set: (r,v) => writes.push([r.path,v]), create: (r,v) => {
        if (rows.has(r.path)) throw Error('already exists'); writes.push([r.path,v]);
      }, update: (r,v) => writes.push([r.path,{...rows.get(r.path),...v}])});
      if ([...reads].some(([p,v]) => (versions.get(p) ?? 0) !== v)) continue;
      for (const [p,v] of writes) { rows.set(p,v);versions.set(p,(versions.get(p) ?? 0)+1); }
      return result;
    }
    throw Error('contention');
  }};
  return {db, rows};
}
function callable(s, {role='admin', recent=true} = {}) {
  const filename = path.resolve(__dirname,'../lib/admin/intake-maintenance.js');
  const real = createRequire(filename); const exports = {};
  const stubs = {
    '../shared/firestore.js': {db:s.db},
    '../shared/auth.js': {requireAuth: () => ({uid:'admin'})},
    '../shared/authorization.js': {requireRole: async () => {if(role!=='admin')throw Object.assign(Error(),{code:'permission-denied'});}},
    '../shared/recent-auth.js': {requireRecentAuthentication: () => {if(!recent)throw Object.assign(Error(),{code:'unauthenticated'});}},
    '../shared/rate-limit.js': {enforceCallableRateLimit: async () => {}},
    '../shared/function-options.js': {appCheckCallableOptions:{}},
  };
  const require = name => name === 'firebase-functions/v2/https'
    ? {...real(name),onCall:(_,fn)=>fn} : stubs[name] ?? real(name);
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{exports,require,console,process,Buffer});
  return (data) => exports.setIntakeMaintenance({auth:{token:{auth_time:Date.now()/1000}},data});
}
const admin = {role:'admin',accountStatus:'active',isActive:true,isBlocked:false};
const control = (intake,publication,revision=1) => ({schemaVersion:1,revision,intake,publication});
const request = (expectedRevision,intake,publication,operationKey='maintenance_key_0001') =>
  ({expectedRevision,intake,publication,operationKey,reason:'Approved maintenance window'});

test('missing, malformed and paused controls reject both prohibited scopes', async () => {
  for(const value of [undefined,null,{},control(true,true),{...control(false,false),revision:0},
    {...control(false,false),publication:'false'}]) {
    const s = store({'maintenanceControls/intake':value});
    for(const scope of ['intake','publication']) await assert.rejects(
      s.db.runTransaction(tx=>requireMaintenanceOpen(tx,s.db,scope)), {code:'unavailable'});
  }
  assert.equal(parseMaintenance([]),null);
});
test('configuration read failure propagates, never opens', async () => {
  await assert.rejects(requireMaintenanceOpen({get:async()=>{throw Error('offline');}},
    {doc:p=>p},'intake'),/offline/);
});
test('bootstrap is closed-only; reopening publication and then intake is audited', async () => {
  const s=store({'users/admin':admin}), call=callable(s);
  await assert.rejects(call(request(0,false,false)),{code:'failed-precondition'});
  await call(request(0,true,true));
  await call(request(1,true,false,'maintenance_key_0002'));
  await assert.rejects(s.db.runTransaction(tx=>requireMaintenanceOpen(tx,s.db,'intake')),{code:'unavailable'});
  await s.db.runTransaction(tx=>requireMaintenanceOpen(tx,s.db,'publication'));
  await call(request(2,false,false,'maintenance_key_0003'));
  await s.db.runTransaction(tx=>requireMaintenanceOpen(tx,s.db,'intake'));
  assert.equal([...s.rows.keys()].filter(p=>p.startsWith('maintenanceAudits/')).length,3);
});
test('replay cannot repeat an old close or reopen; changed payload conflicts', async () => {
  const s=store({'users/admin':admin}),call=callable(s);
  await call(request(0,true,true));
  await call(request(1,false,false,'maintenance_key_0002'));
  await call(request(0,true,true));
  assert.equal(s.rows.get('maintenanceControls/intake').intake,false);
  await call(request(2,true,true,'maintenance_key_0003'));
  await call(request(1,false,false,'maintenance_key_0002'));
  assert.equal(s.rows.get('maintenanceControls/intake').intake,true);
  await assert.rejects(call(request(1,true,false,'maintenance_key_0002')),{code:'already-exists'});
});
test('stale revisions, corrupt control, invalid scope ordering and inactive admins reject',async()=>{
  const s=store({'users/admin':admin,'maintenanceControls/intake':control(true,true)}),call=callable(s);
  await assert.rejects(call(request(0,false,false)),{code:'aborted'});
  await assert.rejects(call(request(1,false,true)),{code:'failed-precondition'});
  s.rows.set('maintenanceControls/intake',{});
  await assert.rejects(call(request(0,true,true)),{code:'failed-precondition'});
  s.rows.set('users/admin',{...admin,isBlocked:true});
  await assert.rejects(call(request(0,true,true)),{code:'permission-denied'});
});
test('activation and reopening require admin authorization and recent authentication',async()=>{
  for(const opts of [{role:'provider'},{recent:false}]){
    const s=store({'users/admin':admin});
    await assert.rejects(callable(s,opts)(request(0,true,true)));
    assert.equal(s.rows.has('maintenanceControls/intake'),false);
  }
});
test('in-flight booking, publication and preparation retry against activation, committing nothing',async()=>{
  for(const scope of ['intake','publication']) {
    const s=store({'users/admin':admin,'maintenanceControls/intake':control(false,false)});
    let release,started;const wait=new Promise(r=>release=r),ready=new Promise(r=>started=r);
    let attempts=0;
    const pending=s.db.runTransaction(async tx=>{
      await requireMaintenanceOpen(tx,s.db,scope);
      if(attempts++===0){started();await wait;}
      recordMaintenanceAdmission(tx,s.db);
      tx.set(s.db.doc('newWrite/request'),{created:true});
    });
    await ready;await callable(s)(request(1,true,true));release();
    await assert.rejects(pending,{code:'unavailable'});
    assert.equal(s.rows.has('newWrite/request'),false);
  }
});
test('two concurrent admin changes serialize with one revision winner',async()=>{
  const s=store({'users/admin':admin,'maintenanceControls/intake':control(true,true)}),call=callable(s);
  const results=await Promise.allSettled([call(request(1,false,false)),
    call(request(1,true,false,'maintenance_key_0002'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'aborted');
});
test('financial and recovery modules have no maintenance dependency',()=>{
  for(const dir of ['payments','refunds','cancellations','provider-finance']) {
    const folder=path.resolve(__dirname,'../src',dir);
    if(!fs.existsSync(folder))continue;
    for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.ts'))) {
      assert.doesNotMatch(fs.readFileSync(path.join(folder,file),'utf8'),/requireMaintenanceOpen|maintenanceControls/);
    }
  }
});

test('Web server helper matches fail-closed publication contract and admission write', async()=>{
  const ts=require('typescript');
  const filename=path.resolve(__dirname,'../../apps/web/src/lib/firebase/maintenance.ts');
  const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let data;const exports={};const writes=[];
  vm.runInNewContext(compiled,{exports,require:name=>{
    if(name==='server-only')return {};
    if(name==='./admin')return {adminDb:{doc:p=>({path:p})}};
    if(name==='firebase-admin/firestore')return {FieldValue:{serverTimestamp:()=> 'commit-time'}};
    throw Error(name);
  }});
  const tx={get:async()=>({data:()=>data}),update:(r,v)=>writes.push([r.path,v])};
  for(data of [undefined,{},control(true,true),{...control(true,false),revision:'1'}]) {
    await assert.rejects(exports.requirePublicationOpen(tx));
  }
  data=control(true,false);await exports.requirePublicationOpen(tx);
  exports.recordPublicationAdmission(tx);
  assert.equal(writes[0][0],'maintenanceControls/intake');
});
test('checked-in public writers include both transaction control read and admission commit',()=>{
  for(const file of ['bookings/submit-booking-request.ts','packages/publish-provider-package.ts',
    'providers/provider-service-management.ts','auth/audit-account-security-state.ts',
    'auth/manage-role-account.ts','providers/update-provider-business-profile.ts',
    'verification/review-provider-verification.ts','admin/service-category-management.ts',
    'scripts/seed-service-categories.ts']) {
    const source=fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');
    assert.match(source,/await requireMaintenanceOpen\(/,file);
    assert.match(source,/recordMaintenanceAdmission\(/,file);
  }
});
