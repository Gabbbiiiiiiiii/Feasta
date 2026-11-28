// Intentionally skipped without an explicitly provided emulator. Never starts one.
const {test} = require('node:test');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds} = require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,collection,getDocs} = require('firebase/firestore');
const {userData} = require('./rules-test-helpers.cjs');
const fixture = JSON.parse(readFileSync(resolve(__dirname,'../../../contracts/customer-event-list/fixtures.json'),'utf8'));
test('customer Event List security: owner-only reads and all client writes denied',{
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
},async t=>{
  const [host,port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({projectId:'demo-feasta-event-list-contract',firestore:{host,port:Number(port),rules:readFileSync(resolve(__dirname,'../../../firebase/firestore.rules'),'utf8')}});
  try {
    const data=fixture.document;
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      for(const [uid,role,extra] of [['customer_A','customer',{}],['customer_B','customer',{}],['blocked','customer',{isBlocked:true}],['provider_A','provider',{}]]) await setDoc(doc(db,'users',uid),userData(uid,role,extra));
      await setDoc(doc(db,'customerEventLists','customer_A'),data);
      await setDoc(doc(db,'customerEventLists','blocked'),{...data,ownerUid:'blocked'});
      await setDoc(doc(db,'customerEventLists','provider_A'),{...data,ownerUid:'provider_A'});
    });
    const owner=env.authenticatedContext('customer_A').firestore();
    await t.test('active owner can read own document',()=>assertSucceeds(getDoc(doc(owner,'customerEventLists','customer_A'))));
    await t.test('active owner can read absent document for initialization',()=>assertSucceeds(getDoc(doc(env.authenticatedContext('customer_B').firestore(),'customerEventLists','customer_B'))));
    for(const uid of ['customer_B','blocked','provider_A',null]) await t.test('reject foreign/guest read '+uid,()=>assertFails(getDoc(doc(uid ? env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore(),'customerEventLists','customer_A'))));
    for(const uid of ['blocked','provider_A']) await t.test('reject inactive/noncustomer own read '+uid,()=>assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(),'customerEventLists',uid))));
    await t.test('reject collection query',()=>assertFails(getDocs(collection(owner,'customerEventLists'))));
    await t.test('reject owner update',()=>assertFails(updateDoc(doc(owner,'customerEventLists','customer_A'),{revision:1})));
    await t.test('reject owner delete',()=>assertFails(deleteDoc(doc(owner,'customerEventLists','customer_A'))));
    await t.test('reject owner create',()=>assertFails(setDoc(doc(env.authenticatedContext('customer_B').firestore(),'customerEventLists','customer_B'),{...data,ownerUid:'customer_B'})));
    for(const row of fixture.invalid) await t.test('reject invalid write: '+row.name,()=>assertFails(setDoc(doc(owner,'customerEventLists','customer_A'),row.document)));
  } finally { await env.cleanup(); }
});
