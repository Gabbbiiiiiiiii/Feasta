(async () => {
const fs = await import('node:fs');

const {default: assert} = await import('node:assert/strict');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:48080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:48999'||process.env.GCLOUD_PROJECT!=='demo-feasta-consent')throw Error('Dedicated local demo emulators required');
const path = await import('node:path');
const {createRequire} = await import('node:module');
const webRequire=createRequire(path.resolve('apps/web/package.json'));
const backendRequire=createRequire(path.resolve('.validation/backend/functions/package.json'));
backendRequire('firebase-admin/app').initializeApp({projectId:'demo-feasta-consent'});
const db=backendRequire('./lib/shared/firestore.js').db;
const ensure=backendRequire('./lib/auth/ensure-user-profile.js').ensureUserProfile;
const legal=backendRequire('./lib/documents/current-legal-agreement.js').getCurrentLegalAgreement;
const types=backendRequire('./lib/shared/agreement-types.js').initialAgreementTypes();
const sdk=webRequire('firebase/auth'),app=webRequire('firebase/app').initializeApp({apiKey:'demo-key',projectId:'demo-feasta-consent'}),auth=sdk.getAuth(app);
sdk.connectAuthEmulator(auth,'http://127.0.0.1:48999',{disableWarnings:true});
let submissions=[];let popup;
const functions={httpsCallable:(_,name)=>async data=>{
 if(name==='getCurrentLegalAgreement')return {data:await legal.run({data})};
 assert.equal(name,'ensureUserProfile');submissions.push(data);
 const u=auth.currentUser;return {data:await ensure.run({data,auth:u?{uid:u.uid,token:{email:u.email}}:undefined,rawRequest:{headers:{},ip:'127.0.0.1'}})};
}};
const ts=webRequire('typescript');
function load(file){const source=fs.readFileSync((process.argv.includes('--baseline') && file === 'client-session' ? '.validation/baseline/' : '')+'apps/web/src/lib/auth/'+file+'.ts','utf8');const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const loadedModule={exports:{}};new Function('require','module','exports',out)(name=>name==='@/lib/firebase/client'?{auth,functions:{}}:name==='firebase/functions'?functions:name==='firebase/auth'?{...sdk,signInWithPopup:()=>popup()}:name==='./auth-diagnostics'?{authDiagnostic:()=>{}}:webRequire(name),loadedModule,loadedModule.exports);return loadedModule.exports;}
const client=load('client-session'),policies=load('customer-consent');
const originalFetch=global.fetch;
global.fetch=async (url,options)=> !String(url).startsWith("/") ? originalFetch(url,options) : ({ok:true,json:async()=>String(url).endsWith('csrf')?{token:'test'}:String(url).endsWith('session')?{role:'customer',destination:'/customer'}:{}});
const version=v=>({version:v,name:'Published agreement',effectiveDate:'2026-10-01',status:'current',sections:[{title:'Published content',paragraphs:['Actual emulator policy text']}],createdAt:'2026-10-01T00:00:00Z',publishedAt:'2026-10-01T00:00:00Z',archivedAt:null});
const terms=db.collection('agreementTemplates').doc('terms_of_service'),privacy=db.collection('agreementTemplates').doc('privacy_policy');
(async()=>{
 for(const type of types)await db.collection('agreementTypes').doc(type.code).set(type);
 await terms.set({agreementTypeCode:'terms_of_service',versions:[version('T-7')]});await privacy.set({agreementTypeCode:'privacy_policy',versions:[version('P-3')]});
 const displayed=await policies.loadCustomerAgreements();const consent={acceptedTerms:true,acceptedPrivacy:true,termsPolicyVersion:displayed.terms.version,privacyPolicyVersion:displayed.privacy.version};
 assert.equal(consent.termsPolicyVersion,'T-7');assert.equal(consent.privacyPolicyVersion,'P-3');
 const input={...consent,firstName:'Web',lastName:'Customer',email:'web-'+Date.now()+'@example.test',password:'Password123!'};
 if(process.argv.includes('--baseline')) {
  await assert.rejects(client.registerCustomer(input),e=>e.details?.reason==='invalid-policy-version');
  console.log('PASS untouched baseline reproduces missing-version incompatibility against strict backend');
  await backendRequire('firebase-admin/app').deleteApp(backendRequire('firebase-admin/app').getApp());process.exit(0);
 }
 await client.registerCustomer(input);const uid=auth.currentUser.uid;let stored=(await db.doc('users/'+uid).get()).data();assert.equal(stored.termsVersion,'T-7');assert.equal(stored.privacyVersion,'P-3');console.log('PASS actual web registration + independent published versions');
 await db.doc('customers/'+uid).delete();await client.signInWithEmail(input.email,input.password);assert.deepEqual(submissions.at(-1),{});assert.ok((await db.doc('customers/'+uid).get()).exists);assert.deepEqual((await db.doc('users/'+uid).get()).data().termsAcceptedAt,stored.termsAcceptedAt);console.log('PASS existing email login + repair + historical consent');
 await terms.update({versions:[version('T-8')]});let count=submissions.length;
 await assert.rejects(client.registerCustomer({...input,email:'stale-'+Date.now()+'@example.test'}),e=>e.details?.reason==='policy-version-outdated');assert.equal(submissions.length,count+1);console.log('PASS stale registration + rollback + no automatic resubmission');
 // Popup boundary is stubbed; emulator Auth credentials and backend storage are real.
 popup=()=>sdk.signInWithEmailAndPassword(auth,input.email,input.password);await client.signInWithGoogle();assert.deepEqual(submissions.at(-1),{});console.log('PASS existing Google synchronization');
 const freshEmail='google-'+Date.now()+'@example.test';await sdk.createUserWithEmailAndPassword(auth,freshEmail,input.password);await sdk.signOut(auth);popup=()=>sdk.signInWithEmailAndPassword(auth,freshEmail,input.password);
 await assert.rejects(client.signInWithGoogle(),e=>e.details?.reason==='consent-required');assert.equal(auth.currentUser,null);
 const latest=await policies.loadCustomerAgreements();await client.signInWithGoogle(undefined,undefined,{...consent,termsPolicyVersion:latest.terms.version,privacyPolicyVersion:latest.privacy.version});stored=(await db.doc('users/'+auth.currentUser.uid).get()).data();assert.equal(stored.termsVersion,'T-8');assert.equal(stored.privacyVersion,'P-3');console.log('PASS new Google explicit consent + exact refreshed versions');
 await terms.update({versions:[{...version('bad'),sections:[]}]});await assert.rejects(policies.loadCustomerAgreements());console.log('PASS malformed published authority fails closed');
 await sdk.signOut(auth);await backendRequire('firebase-admin/app').deleteApp(backendRequire('firebase-admin/app').getApp());process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});

})().catch(e => { console.error(e); process.exitCode = 1; });
