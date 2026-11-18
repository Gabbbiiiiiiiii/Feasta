"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
function load(file,dependencies={}) {
  const filename=path.resolve(__dirname,"../src/providers/"+file+".ts");
  const output=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const compiled=new Module(filename,module);
  compiled.filename=filename;
  compiled.paths=Module._nodeModulePaths(path.dirname(filename));
  const original=compiled.require.bind(compiled);
  compiled.require=(name) => name in dependencies?dependencies[name]:original(name);
  compiled._compile(output,filename);
  return compiled.exports;
}
const policy=load("service-offer-policy");
const {parseServicePrice}=load("service-price");
const {HttpsError}=require("firebase-functions/v2/https");
const source=fs.readFileSync(path.resolve(__dirname,"../src/providers/provider-service-management.ts"),"utf8");
const inputFunction=source.slice(source.indexOf("function parseServiceInput("),source.indexOf("function parseServiceImage("));
const functionJS=ts.transpileModule(inputFunction,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const parseInput=Function("offerNameError","offerDescriptionError","serviceGuestLimitsError","HttpsError","parseServiceCategory","parsePricingType","parsePrice","supportsServicePackageDetails","parseFreelanceServiceDetails","parseServiceImage",functionJS+";return parseServiceInput;")(
  policy.offerNameError,policy.offerDescriptionError,policy.serviceGuestLimitsError,HttpsError,
  value=>value,value=>value,parseServicePrice,()=>true,value=>value,()=>({imageUrl:null,imagePublicId:null}),
);
const valid=()=>({name:" Wedding Photos ",description:"",category:"photographer",pricingType:"fixed",price:500});
const publishFunction = source.slice(source.indexOf("function validatePublishableService("), source.indexOf("function requireObject("));
const publishJS = ts.transpileModule(publishFunction,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const validatePublishable = Function("offerNameError","offerDescriptionError","serviceGuestLimitsError","HttpsError","parseServiceCategory","parsePricingType","parsePrice","parseServiceImage",publishJS+";return validatePublishableService;")(
  policy.offerNameError, policy.offerDescriptionError, policy.serviceGuestLimitsError,
  HttpsError, value=>value, value=>value, parseServicePrice, ()=>({}),
);
test("validates actual save-input text before persistence without truncation", () => {
  assert.equal(parseInput(valid(),{data:{}}).name,"Wedding Photos");
  for (const name of ["ab","12345","!!!","qqqqq","a".repeat(81)]) assert.throws(()=>parseInput({...valid(),name},{data:{}}));
  for (const description of ["short","x".repeat(501)]) assert.throws(()=>parseInput({...valid(),description},{data:{}}));
});
test("persists valid per-guest bounds and rejects reversed or missing capacity", () => {
  const input={...valid(),pricingType:"per_guest",price:150,minimumGuests:10,maximumGuests:50};
  assert.equal(parseInput(input,{data:{}}).maximumGuests,50);
  assert.throws(()=>parseInput({...input,maximumGuests:9},{data:{}}));
  assert.throws(()=>parseInput({...input,minimumGuests:undefined},{data:{}}));
});
test("legacy per-guest drafts need explicitly saved limits before publication", () => {
  const legacy = {...valid(), pricingType:"per_guest", price:150};
  assert.throws(() => validatePublishable(legacy), error => error.code === "failed-precondition");
  assert.equal(Object.hasOwn(legacy, "minimumGuests"), false);
  assert.equal(Object.hasOwn(legacy, "maximumGuests"), false);
  const updated = parseInput({...legacy, minimumGuests:10, maximumGuests:50}, {data:{}});
  assert.doesNotThrow(() => validatePublishable({...legacy, ...updated}));
});
function uniquenessHarness(records) {
  const read=[],writes=[];
  const db={collection:collection=>({doc:id=>({collection,id}),where:()=>({select:()=>({collection,query:true})})})};
  const locks = new Map();
  const snapshot = ref => ref.query
    ? {docs:(records[ref.collection]||[]).map(item=>({id:item.id,data:()=>item}))}
    : {};
  const transaction={get:async ref=>{read.push(ref);return snapshot(ref);},set:(...args)=>writes.push(args)};
  const api=load("service-name-uniqueness",{"../shared/timestamps.js":{serverTimestamp:()=>"timestamp"},"./service-offer-policy.js":policy});
  const prepare = (tx, ...args) => api.prepareUniqueServiceName(tx, db, ...args);
  const preparePackage = (tx, ...args) => api.preparePackageServiceName(tx, db, ...args);
  let retries = 0;
  async function create(collection, id, name) {
    const versions = new Map();
    const lockWrites = [];
    const tx = {
      async get(ref) {
        assert.equal(lockWrites.length, 0, "reads must precede writes");
        if (!ref.query) versions.set(ref.id, locks.get(ref.id));
        return snapshot(ref);
      },
      set(ref) { lockWrites.push(ref.id); },
    };
    const commit = collection === "addons"
      ? await prepare(tx, "provider", name, id)
      : await preparePackage(tx, "provider", name);
    commit();
    if ([...versions].some(([key, version]) => locks.get(key) !== version)) {
      retries++;
      return create(collection, id, name);
    }
    for (const key of lockWrites) locks.set(key, (locks.get(key) ?? 0) + 1);
    (records[collection] ??= []).push({id, name});
  }
  return {transaction,read,writes,prepare,preparePackage,create,get retries(){return retries;}};
}
test("rejects duplicates from the same provider, ignoring case and whitespace",async()=>{
  const h=uniquenessHarness({addons:[{id:"other",name:"WEDDING   PHOTOS",isDeleted:false}]});
  await assert.rejects(()=>h.prepare(h.transaction,"provider"," wedding photos ","current"),error=>error.code==="already-exists");
  assert.equal(h.writes.length,0);
});
test("allows the current record and deleted records and prepares a deferred lock write",async()=>{
  const h=uniquenessHarness({addons:[{id:"current",name:"Wedding Photos"},{id:"deleted",name:"Wedding Photos",isDeleted:true}]});
  const commit=await h.prepare(h.transaction,"provider","Wedding Photos","current");
  assert.equal(h.writes.length,0);
  commit();
  assert.equal(h.writes.length,1);
  assert.equal(h.read[0].collection,"providerOfferNameLocks");
});
test("also detects an existing catering-package name",async()=>{
  const h=uniquenessHarness({packages:[{id:"existing",name:"Wedding Photos"}]});
  await assert.rejects(()=>h.prepare(h.transaction,"provider","Wedding Photos","current"));
});
test("package creation and renames reject existing services and ignore deleted services", async () => {
  const h = uniquenessHarness({addons:[
    {id:"live", name:"Wedding Photos"},
    {id:"deleted", name:"Birthday Photos", isDeleted:true},
  ]});
  for (const previousName of [undefined, "Previous name"]) {
    await assert.rejects(() => h.preparePackage(h.transaction, "provider", "Ｗｅｄｄｉｎｇ  Photos", previousName),
      error => error.code === "already-exists");
  }
  assert.equal(await h.preparePackage(h.transaction, "provider", "Wedding Photos", "wedding photos"), undefined);
  assert.equal(typeof await h.preparePackage(h.transaction, "provider", "Birthday Photos"), "function");
});

for (const [first, second] of [["addons","addons"], ["addons","packages"], ["packages","addons"]]) {
  test(`concurrent ${first} and ${second} creates commit exactly one normalized name`, async () => {
    const h = uniquenessHarness({});
    const results = await Promise.allSettled([
      h.create(first, "first", "Wedding Photos"),
      h.create(second, "second", "wedding   photos"),
    ]);
    assert.equal(h.retries, 1);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.code, "already-exists");
  });
}
