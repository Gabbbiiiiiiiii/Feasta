const {test, beforeEach} = require("node:test");
const assert = require("node:assert/strict");
const {resolve} = require("node:path");
const {HttpsError} = require("firebase-functions/v2/https");
const records = new Map();
const reads = [], verificationReadSizes = [];
let verificationOverride;
const clone = value => value === undefined ? undefined : structuredClone(value);
const snap = path => ({id:path.split("/").at(-1), exists:records.has(path), data:()=>clone(records.get(path))});
function collection(name) {
  const query = (field, value, count) => ({name, field, value, count,
    limit:n=>query(field,value,n)});
  return {...query(), doc:id=>({path:name+"/"+id}), where:(field, op, value)=>query(field,value)};
}
let queue = Promise.resolve(), retry;
const db = {collection, runTransaction:fn=>{
  const run = async () => {
    for (;;) {
      const writes=[];
      const transaction={
        get:async ref=>{
          assert.equal(writes.length,0,"all reads must precede writes");
          if(ref.path) { reads.push(ref.path); return snap(ref.path); }
          const docs = ref.name === "providerVerifications" && verificationOverride
            ? verificationOverride.map(data=>({data:()=>clone(data)}))
            : [...records.keys()].filter(p=>p.startsWith(ref.name+"/") &&
              (!ref.field || records.get(p)[ref.field]===ref.value)).map(snap);
          const bounded=docs.slice(0,ref.count ?? docs.length);
          if(ref.name === "providerVerifications") verificationReadSizes.push(bounded.length);
          return {docs:bounded};
        },
        create:(ref,value)=>{assert.equal(records.has(ref.path),false);writes.push([ref.path,value]);},
        update:(ref,value)=>writes.push([ref.path,{...records.get(ref.path),...value}]),
      };
      const result=await fn(transaction);
      if(retry && writes.length) {const change=retry;retry=null;change();continue;}
      writes.forEach(([path,value])=>records.set(path,clone(value)));
      return result;
    }
  };
  const result=queue.then(run);queue=result.catch(()=>{});return result;
}};
function replace(file,exports) {const path=resolve(__dirname,"../lib/"+file+".js");require.cache[path]={id:path,filename:path,loaded:true,exports};}
replace("shared/firestore",{db});
replace("shared/authorization",{requireRole:async uid=>{
  if(records.get("users/"+uid)?.role!=="provider") throw new HttpsError("permission-denied","Wrong role");
}});
replace("shared/rate-limit",{enforceCallableRateLimit:async()=>{}});
replace("shared/audit",{writeAuditLogInTransaction:(tx,input)=>tx.create({path:"adminLogs/"+input.targetId},input)});
const now={seconds:1792377600,nanoseconds:123000000};
replace("shared/timestamps",{serverTimestamp:()=>clone(now)});
const {initialAgreementTypes}=require("../lib/shared/agreement-types.js");
const {acceptCurrentProviderAgreement:callable,agreementReviewDigest:hash}=require("../lib/providers/accept-current-provider-agreement.js");
const call=(data,uid="owner")=>callable.run({data,auth:uid?{uid,token:{}}:undefined,rawRequest:{headers:{}}});
const review=()=>call({action:"review"});
const accept=r=>call({action:"accept",confirmed:true,version:r.agreement.version,digest:r.digest,acceptedAt:"1990-01-01"});
const entries=()=>[...records.entries()].filter(([p])=>p.startsWith("providerAgreementAcceptances/"));
const version={version:"1.7",name:"Provider Agreement",effectiveDate:"2026-10-01",status:"current",
  sections:[{title:"Terms",paragraphs:["Exact trusted current content."]}],
  createdAt:"2026-10-01T00:00:00Z",publishedAt:"2026-10-01T00:00:00Z",archivedAt:null};
beforeEach(()=>{
  records.clear();retry=null;reads.length=0;verificationReadSizes.length=0;verificationOverride=undefined;
  records.set("users/owner",{role:"provider",providerId:"provider",accountStatus:"active",isActive:true});
  records.set("providers/provider",{ownerId:"owner",businessName:"Original business",ownerFirstName:"Test",ownerLastName:"Owner",verificationStatus:"approved",isActive:true});
  records.set("providerVerifications/legacy",{providerId:"provider",ownerId:"owner",providerAgreementVersion:"2026-09-23",providerAgreementAccepted:true,providerAgreementAcceptedAt:{seconds:1790553600,nanoseconds:0}});
  records.set("bookings/historical",{providerId:"provider",agreementVersion:"2026-09-23",financialTerms:{amount:100}});
  for(const type of initialAgreementTypes()) records.set("agreementTypes/"+type.code,type);
  records.set("agreementTemplates/provider_agreement",{status:"active",agreementTypeCode:"provider_agreement",versions:[clone(version)]});
});
test("review has no writes and explicit acceptance preserves all legacy and booking data",async()=>{
  const before=clone([...records]);const r=await review();assert.deepEqual([...records],before);
  const result=await accept(r);assert.equal(result.recorded,true);
  for(const [path,value] of before) if(path!=="providers/provider") assert.deepEqual(records.get(path),value);
  const provider=records.get("providers/provider");const original=before.find(([p])=>p==="providers/provider")[1];
  assert.deepEqual(provider,{...original,providerAgreementCurrentAcceptanceId:result.acceptanceId});
  const stored=entries()[0][1];assert.deepEqual(stored.snapshot,{...r.agreement,acceptedAt:now});
  assert.deepEqual(stored.acceptedAt,now);assert.equal(stored.previousAcceptanceId,null);
  assert.equal(records.get("adminLogs/"+result.acceptanceId).action,"provider.agreement_accepted");
});
test("authentic original snapshot is preserved byte for byte",async()=>{
  const legacy=records.get("providerVerifications/legacy");
  legacy.providerAgreementSnapshot={code:"provider_agreement",...clone(version),version:"2026-09-23",acceptedAt:legacy.providerAgreementAcceptedAt};
  const before=clone(legacy);await accept(await review());assert.deepEqual(records.get("providerVerifications/legacy"),before);
});
test("concurrent and repeated confirmation create one event and preserve timestamp",async()=>{
  const r=await review();const results=await Promise.all([accept(r),accept(r),accept(r)]);
  assert.equal(results.filter(r=>r.recorded).length,1);assert.equal(entries().length,1);
  const before=clone([...records]);await accept(r);assert.deepEqual([...records],before);
});
test("stale version, digest, and nonexplicit confirmation cannot write",async()=>{
  const r=await review();const base={action:"accept",confirmed:true,version:r.agreement.version,digest:r.digest};
  for(const patch of [{version:"1.6"},{digest:"tampered"},{confirmed:false},{confirmed:undefined}]) {
    const before=clone([...records]);await assert.rejects(call({...base,...patch}),e=>e.code==="failed-precondition");assert.deepEqual([...records],before);
  }
});
test("transaction retry rechecks publication after catalog changes",async()=>{
  const r=await review();retry=()=>records.get("agreementTemplates/provider_agreement").versions[0].sections[0].paragraphs[0]="Changed content same version";
  await assert.rejects(accept(r),e=>e.code==="failed-precondition");assert.equal(entries().length,0);
});
test("rejects missing auth, other roles, ownership mismatch, inactive and unapproved providers",async()=>{
  await assert.rejects(call({action:"review"},null),e=>e.code==="unauthenticated");
  for(const [path,field,value] of [["users/owner","role","customer"],["providers/provider","ownerId","other"],["providers/provider","verificationStatus","pending"],["users/owner","accountStatus","blocked"],["users/owner","providerId","other"],["providerVerifications/legacy","ownerId","other"]]) {
    const r=field==="ownerId" && path.startsWith("providerVerifications")?await review():null;
    const original=records.get(path)[field];records.get(path)[field]=value;
    await assert.rejects(r?accept(r):review(),e=>e.code==="permission-denied");records.get(path)[field]=original;
  }
  assert.equal(entries().length,0);
});
test("missing, malformed, ambiguous, and inactive current publication fails closed",async()=>{
  const template=records.get("agreementTemplates/provider_agreement");
  for(const replacement of [null,{...template,versions:[]},{...template,versions:[{...version,sections:[]}]},{...template,versions:[version,version]},{...template,status:"discontinued"}]) {
    if(replacement) records.set("agreementTemplates/provider_agreement",replacement);else records.delete("agreementTemplates/provider_agreement");
    await assert.rejects(review(),e=>e.code==="failed-precondition");
  }
  assert.equal(entries().length,0);
});
test("original acceptance of same version cannot get a contradictory new date",async()=>{
  records.get("providerVerifications/legacy").providerAgreementVersion="1.7";
  await assert.rejects(accept(await review()),e=>e.code==="failed-precondition");assert.equal(entries().length,0);
});
test("later versions append a linked event without rewriting the previous snapshot",async()=>{
  const first=await accept(await review());const before=clone(entries()[0][1]);
  records.get("agreementTemplates/provider_agreement").versions[0].version="1.8";
  const next=await accept(await review());assert.notEqual(next.acceptanceId,first.acceptanceId);
  assert.equal(entries().length,2);
  assert.deepEqual(records.get("providerAgreementAcceptances/"+first.acceptanceId),before);
  assert.equal(records.get("providerAgreementAcceptances/"+next.acceptanceId).previousAcceptanceId,first.acceptanceId);
  assert.equal(records.get("providers/provider").providerAgreementCurrentAcceptanceId,next.acceptanceId);
});
test("corrupt current pointer cannot produce an orphan acceptance",async()=>{
  records.get("providers/provider").providerAgreementCurrentAcceptanceId="a".repeat(64);
  await assert.rejects(accept(await review()),e=>e.code==="failed-precondition");
  assert.equal(entries().length,0);
});

function seedChain(length) {
  let previousAcceptanceId=null;
  const ids=[];
  for(let i=length-1;i>=0;i--) {
    const agreement={code:"provider_agreement",name:"Provider Agreement",summary:"",
      version:"history-"+i,effectiveDate:"2026-10-01",sections:clone(version.sections)};
    const id=hash(["provider",agreement.code,agreement.version]);ids[i]=id;
    records.set("providerAgreementAcceptances/"+id,{ownerId:"owner",providerId:"provider",
      snapshot:{...agreement,acceptedAt:now},acceptedAt:now,digest:hash(agreement),previousAcceptanceId});
    previousAcceptanceId=id;
  }
  records.get("providers/provider").providerAgreementCurrentAcceptanceId=previousAcceptanceId;
  return ids;
}
async function rejectsWithoutWrites(r, code="failed-precondition") {
  const before=clone([...records]);
  await assert.rejects(accept(r),error=>error.code===code);
  assert.deepEqual([...records],before,"validation failure changed original evidence or pointer");
}
for(const corruption of ["digest","id","timestamp","missing timestamp","out of range timestamp","owner","provider",
  "cycle","broken link","missing link","malformed link","snapshot","summary"]) {
  test("rejects corrupt previous chain: "+corruption+" without writes",async()=>{
    const ids=seedChain(3),r=await review();
    const path="providerAgreementAcceptances/"+ids[1],event=records.get(path);
    if(corruption==="digest") event.digest="corrupted";
    if(corruption==="id") {
      const wrongId="f".repeat(64);records.set("providerAgreementAcceptances/"+wrongId,event);
      records.get("providerAgreementAcceptances/"+ids[0]).previousAcceptanceId=wrongId;
    }
    if(corruption==="timestamp") event.snapshot.acceptedAt={seconds:1,nanoseconds:0};
    if(corruption==="missing timestamp") delete event.acceptedAt;
    if(corruption==="out of range timestamp") event.acceptedAt=event.snapshot.acceptedAt={seconds:1e15};
    if(corruption==="owner") event.ownerId="other";
    if(corruption==="provider") event.providerId="other";
    if(corruption==="cycle") event.previousAcceptanceId=ids[0];
    if(corruption==="broken link") records.delete("providerAgreementAcceptances/"+ids[2]);
    if(corruption==="missing link") delete event.previousAcceptanceId;
    if(corruption==="malformed link") event.previousAcceptanceId=7;
    if(corruption==="snapshot") event.snapshot.sections=[];
    if(corruption==="summary") event.snapshot.summary=42;
    await rejectsWithoutWrites(r);
  });
}
test("rejects duplicate versions even when deterministic IDs and digests differ by code",async()=>{
  const ids=seedChain(2),event=records.get("providerAgreementAcceptances/"+ids[1]);
  event.snapshot.code="another_agreement";event.snapshot.version="history-0";
  event.digest=hash({...event.snapshot,acceptedAt:undefined});
  const id=hash(["provider",event.snapshot.code,event.snapshot.version]);
  records.set("providerAgreementAcceptances/"+id,event);
  records.get("providerAgreementAcceptances/"+ids[0]).previousAcceptanceId=id;
  await rejectsWithoutWrites(await review());
});
test("valid chain appends and preserves every existing event and legacy record",async()=>{
  const ids=seedChain(3),before=clone([...records]);
  const result=await accept(await review());
  assert.equal(records.get("providerAgreementAcceptances/"+result.acceptanceId).previousAcceptanceId,ids[0]);
  for(const [path,value] of before) if(path!=="providers/provider") assert.deepEqual(records.get(path),value);
});
test("99 existing events can become 100; replay at 100 succeeds and append is rejected",async()=>{
  seedChain(99);const r=await review();await accept(r);assert.equal(entries().length,100);
  const before=clone([...records]);assert.equal((await accept(r)).recorded,false);assert.deepEqual([...records],before);
  records.get("agreementTemplates/provider_agreement").versions[0].version="1.8";
  await rejectsWithoutWrites(await review());
});
test("101-event chain reads at most 100 previous events and rejects without writes",async()=>{
  seedChain(101);const r=await review();reads.length=0;await rejectsWithoutWrites(r);
  // One additional read is the deterministic candidate event (not a history traversal read).
  assert.equal(reads.filter(path=>path.startsWith("providerAgreementAcceptances/")).length,101);
});
test("verification query inspects at most 11 records and rejects overflow without writes",async()=>{
  const original=records.get("providerVerifications/legacy");
  for(let i=0;i<25;i++) records.set("providerVerifications/extra-"+i,clone(original));
  await rejectsWithoutWrites(await review());assert.deepEqual(verificationReadSizes,[11]);
});
test("exactly 10 consistent metadata-only verifications are accepted unchanged",async()=>{
  const original=records.get("providerVerifications/legacy");
  for(let i=0;i<9;i++) records.set("providerVerifications/extra-"+i,clone(original));
  const before=clone([...records].filter(([path])=>path.startsWith("providerVerifications/")));
  await accept(await review());assert.deepEqual(verificationReadSizes,[10]);
  for(const [path,value] of before) assert.deepEqual(records.get(path),value);
});
for(const conflict of ["version","date","false flag","malformed flag","malformed date","malformed snapshot","snapshot version"]) {
  test("rejects conflicting legacy evidence: "+conflict+" without writes",async()=>{
    seedChain(1);
    const other=clone(records.get("providerVerifications/legacy"));
    if(conflict==="version") other.providerAgreementVersion="other";
    if(conflict==="date") other.providerAgreementAcceptedAt=now;
    if(conflict==="false flag") other.providerAgreementAccepted=false;
    if(conflict==="malformed flag") other.providerAgreementAccepted="true";
    if(conflict==="malformed date") other.providerAgreementAcceptedAt="2026-09-28";
    if(conflict==="malformed snapshot") other.providerAgreementSnapshot={};
    if(conflict==="snapshot version") other.providerAgreementSnapshot={...records.get("providerAgreementAcceptances/"+seedChain(1)[0]).snapshot};
    records.set("providerVerifications/contradiction",other);
    await rejectsWithoutWrites(await review());
  });
}
test("compares chain versions against every raw legacy record",async()=>{
  seedChain(1);records.get("providerVerifications/legacy").providerAgreementVersion="history-0";
  await rejectsWithoutWrites(await review());
});
test("compatible legacy evidence of the same previous acceptance permits a new version",async()=>{
  seedChain(1);const legacy=records.get("providerVerifications/legacy");
  legacy.providerAgreementVersion="history-0";legacy.providerAgreementAcceptedAt=now;
  const before=clone(legacy);await accept(await review());
  assert.deepEqual(records.get("providerVerifications/legacy"),before);
});
test("rejects verification provider identity mismatch even if returned by the query",async()=>{
  verificationOverride=[{...records.get("providerVerifications/legacy"),providerId:"other"}];
  await rejectsWithoutWrites(await review(),"permission-denied");
});
test("replay also rejects a corrupt stored event and conflicting legacy evidence",async()=>{
  const r=await review(),result=await accept(r);
  const event=records.get("providerAgreementAcceptances/"+result.acceptanceId);
  event.snapshot.acceptedAt={seconds:1};await rejectsWithoutWrites(r);
  event.snapshot.acceptedAt=now;
  records.set("providerVerifications/conflict",{...records.get("providerVerifications/legacy"),providerAgreementVersion:"other"});
  await rejectsWithoutWrites(r);
});
