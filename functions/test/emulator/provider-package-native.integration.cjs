const assert = require('node:assert/strict');
const projectId = process.env.GCLOUD_PROJECT;
if (!/^demo-/.test(projectId || '') || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
  !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '') || !process.env.FIREBASE_EMULATOR_HUB) throw new Error('DEMO_EMULATORS_ONLY');
const {initializeApp} = require('firebase-admin/app');
initializeApp({projectId});
const db = require('firebase-admin/firestore').getFirestore();
const adminAuth = require('firebase-admin/auth').getAuth();
const {initializeApp: clientApp} = require('firebase/app');
const {getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut} = require('firebase/auth');
const {getFunctions,connectFunctionsEmulator,httpsCallable} = require('firebase/functions');
const {getFirestore:clientFirestore,connectFirestoreEmulator,doc:getClientDoc,getDocFromServer,setDoc} = require('firebase/firestore');
const app = clientApp({projectId,apiKey:'demo-only',appId:'demo-only'}, 'native-test');
const clientDb=clientFirestore(app);connectFirestoreEmulator(clientDb,'127.0.0.1',Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]));
const auth = getAuth(app); connectAuthEmulator(auth,'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
const functions = getFunctions(app,'asia-southeast1'); connectFunctionsEmulator(functions,'127.0.0.1',Number(process.env.FEASTA_NATIVE_FUNCTIONS_PORT || '55479'));
const call = async (name,data={}) => (await httpsCallable(functions,name)(data)).data;
const reason = async (fn,wanted) => assert.rejects(fn,e => e.details?.reason === wanted);
const uid='native_provider_owner',pid='native_provider'; let n=0;
const input = (extra={}) => ({sharedContractVersion:2,idempotencyKey:'native_request_key_' + (++n),name:'Native package',description:'Native callable test package.',
serviceCategoryCode:'catering_service',occasionSchemaVersion:2,occasionScope:'specific',occasionIds:['birthday','wedding'],offerSchemaVersion:2,
foodChoiceGroups:[{id:'main',title:'Main dish',selectionCount:1,options:[{id:'chicken',name:'Chicken'},{id:'fish',name:'Fish'}]}],pricingModel:'per_pax',price:100,serviceOptions:{drop_off:{price:100,includedServices:['Delivery']}},themeOptions:[],paymentPolicy:'full_payment',depositPercentage:100,
minimumGuests:10,maximumGuests:50,imageUrl:'',imageUrls:[],foodInclusions:['Chicken'],serviceInclusions:[],decorInclusions:[],furnitureInclusions:[],...extra});
(async()=>{
await adminAuth.createUser({uid,email:'native@example.invalid',password:'DemoOnly123!'});
await db.doc('users/'+uid).set({role:'provider',providerId:pid,accountStatus:'active',isActive:true,isBlocked:false});
await db.doc('providers/'+pid).set({ownerId:uid,verificationStatus:'approved',isActive:true,providerServiceType:'catering',serviceCategories:['catering_service'],minGuestsPerEvent:1,maxGuestsPerEvent:100});
await db.doc('contractPolicies/providerPackageV2').set({revision:1,effectiveEnvironment:projectId,maxSpecificOccasions:10,maxThemeImages:4,featureGates:{packageDraftWrites:true,packageEditorProgressWrites:true}});
await db.doc('maintenanceControls/intake').set({schemaVersion:1,revision:1,intake:false,publication:false});
await db.doc('serviceCategories/catering_service').set({code:'catering_service',name:'Catering',serviceType:'catering',status:'active'});
await db.doc('occasionCatalog/current').set({revision:1,activationState:'stable'});
await db.doc('providerEligibilityAuthorities/'+pid).set({revision:1,approvedOccasionIds:['birthday','wedding'],approvedCategoryCodes:['catering_service']});
for(const [i,id] of ['birthday','wedding'].entries()) await db.doc('occasions/'+id).set({id,label:id,sortOrder:i,revision:1,active:true,moderationState:'approved',applicableServiceCategoryCodes:['catering_service']});
await assert.rejects(call('createProviderPackageV2',input()),e=>e.code==='functions/unauthenticated');
await signInWithEmailAndPassword(auth,'native@example.invalid','DemoOnly123!');
const media='https://res.cloudinary.com/test/image/upload/feasta/providers/'+uid+'/services/native_owned/image.jpg';
const callsBefore=(await call('inspectNativeMediaCalls')).calls;
await db.doc('contractPolicies/providerPackageV2').update({'featureGates.packageDraftWrites':false});
await reason(call('createProviderPackageV2',input({imageUrl:media,imageUrls:[media]})),'FEATURE_DISABLED');
await db.doc('contractPolicies/providerPackageV2').update({'featureGates.packageDraftWrites':true});
await db.doc('providers/'+pid).update({ownerId:'foreign_owner'});
await assert.rejects(call('createProviderPackageV2',input({imageUrl:media,imageUrls:[media]})),e=>e.code==='functions/permission-denied');
await db.doc('providers/'+pid).update({ownerId:uid});
await db.doc('maintenanceControls/intake').update({intake:true,publication:true});
await reason(call('createProviderPackageV2',input({imageUrl:media,imageUrls:[media]})),'MAINTENANCE_PAUSED');
await db.doc('maintenanceControls/intake').update({intake:false,publication:false});
assert.equal((await call('inspectNativeMediaCalls')).calls,callsBefore);
const data=input(); const first=await call('createProviderPackageV2',data);
assert.deepEqual(await call('createProviderPackageV2',data),first);
const updated=await call('updateProviderPackageV2',input({packageId:first.packageId,expectedRevision:1,pricingModel:'per_bundle',occasionScope:'all',occasionIds:[]}));
assert.equal(updated.packageRevision,2);
await reason(call('updateProviderPackageV2',input({packageId:first.packageId,expectedRevision:1})),'REVISION_CONFLICT');
await assert.rejects(call('createProviderPackageV2',input({imageUrl:media.replace(uid,'foreign'),imageUrls:[media.replace(uid,'foreign')]})),e=>e.code==='functions/permission-denied');
await assert.rejects(call('createProviderPackageV2',input({imageUrl:media.replace('native_owned','missing'),imageUrls:[media.replace('native_owned','missing')]})),e=>e.code==='functions/failed-precondition');
await call('createProviderPackageV2',input({imageUrl:media,imageUrls:[media]}));
const saved=(await call('saveProviderPackageEditorDraft',{editorSchemaVersion:2,editorDraftId:null,expectedRevision:0,packageId:null,expectedPackageRevision:null,currentStep:4,idempotencyKey:'native_progress_key_123',progress:{name:'Completed progress',description:'Complete saved package progress.',serviceCategoryCode:'catering_service',occasion:{occasionSchemaVersion:2,occasionScope:'all',occasionIds:[]},pricingModel:'per_bundle',minimumGuestsText:'10',maximumGuestsText:'50',paymentPolicy:'full_payment',tiers:{drop_off:{enabled:true,priceText:'100',includedServices:[],decorInclusions:[],furnitureInclusions:[],equipmentInclusions:[]}}}})).draft;
const complete={editorDraftId:saved.editorDraftId,expectedRevision:1,expectedPackageRevision:null,idempotencyKey:'native_completion_key_123'};
const result=await call('completeProviderPackageEditorDraft',complete); assert.deepEqual(await call('completeProviderPackageEditorDraft',complete),result);
const packages=await db.collection('packages').get(); assert.equal(packages.size,3);
for(const doc of packages.docs){assert.equal(doc.data().status,'draft');assert.equal(doc.data().isPublished,false);assert.equal(doc.data().providerPubliclyVisible,false);}
// Exercise the existing publisher over the real SDK transport, with local-only gates.
const publication = {sharedContractVersion: 2, packageId: first.packageId,
  expectedRevision: 2, idempotencyKey: 'native_publication_key_123'};
await reason(call('publishProviderPackage', publication), 'FEATURE_DISABLED');
await db.doc('providers/'+pid).update({businessName:'Native Demo Catering', description:'Native demo provider',
  address:'123 Demo Street',city:'Ormoc',province:'Leyte',publiclyVisible:true});
await db.doc('contractPolicies/providerPackageV2').update({'featureGates.packagePublication':true,
  'featureGates.customerDiscovery':true,'featureGates.customerBooking':true});
try {
  const published = await call('publishProviderPackage', publication);
  assert.equal(published.status, 'published'); assert.equal(published.packageRevision, 3);
  assert.deepEqual(await call('publishProviderPackage', publication), published);
  await reason(call('publishProviderPackage', {...publication, expectedRevision:3}), 'IDEMPOTENCY_CONFLICT');
  const stored=(await db.doc('packages/'+first.packageId).get()).data();
  assert.equal(stored.isPublished,true); assert.equal(stored.revision,3);
  const discovered=await call('getCustomerPackageV2',{packageId:first.packageId});
  assert.equal(discovered.package.revision,3);assert.equal(discovered.package.pricingModel,'per_bundle');
  assert.deepEqual(discovered.package.occasionMatchIds,['birthday','wedding']);
  const cuid='native_customer_v2',email='native-customer@example.invalid',phone='+639171231111';
  await adminAuth.createUser({uid:cuid,email,password:'DemoOnly123!',emailVerified:true,phoneNumber:phone});
  await db.doc('users/'+cuid).set({role:'customer',accountStatus:'active',isActive:true,isBlocked:false,isPhoneVerified:true,phoneNumber:phone});
  await db.doc('customers/'+cuid).set({firstName:'Native',lastName:'Customer'});
  await db.doc('providers/'+pid).update({operatingDays:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],bookingLeadTimeDays:0,unavailableDates:[]});
  await signOut(auth);await signInWithEmailAndPassword(auth,email,'DemoOnly123!');
  const selection={clientRequestId:'native_booking_request_123',providerId:pid,packageId:first.packageId,
    sharedContractVersion:2,expectedPackageRevision:3,eventType:'wedding',eventDate:'2099-03-10',eventTime:'10:00',eventEndTime:'14:00',
    eventLocation:'Ormoc City',eventAddress:'123 Native Street',guestCount:20,serviceTier:'drop_off',
    foodChoiceSelections:[{groupId:'main',optionIds:['chicken']}],selectedFoods:[],selectedDecorations:[],selectedFurniture:[],addonIds:[]};
  const disclosures=await call('getBookingPaymentAgreementDisclosures',selection);
  assert.equal(disclosures.agreements[0].grossAmountInCentavos,10000);
  const payload={...selection,agreementAcknowledgements:disclosures.agreements.map(a=>({providerId:a.providerId,agreementKey:a.agreementKey}))};
  const booking=await call('submitBookingRequest',payload);assert.equal(booking.created,true);
  assert.equal((await call('submitBookingRequest',payload)).created,false);
  const saved=(await db.doc('mainEvents/'+booking.mainEventId).get()).data();
  assert.equal(saved.packagePrice,100);assert.equal(saved.packageOfferSnapshotV2.revision,3);
  assert.equal(saved.foodChoiceSelections[0].options[0].name,'Chicken');
  assert.equal((await getDocFromServer(getClientDoc(clientDb,'packages',first.packageId))).exists(),true);
  await assert.rejects(getDocFromServer(getClientDoc(clientDb,'packages',result.packageId)),e=>e.code==='permission-denied');
  await assert.rejects(setDoc(getClientDoc(clientDb,'packages',first.packageId),{price:1},{merge:true}),e=>e.code==='permission-denied');
} finally {
  await db.doc('contractPolicies/providerPackageV2').update({'featureGates.packagePublication':false,
    'featureGates.customerDiscovery':false,'featureGates.customerBooking':false});
}
console.log('PASS native SDK callable transport: auth, ownership, gates, maintenance, create/update, conflicts, replay/completion, media, private flags and gated V2 publication, verified customer discovery and authoritative booking/replay and real Firestore draft privacy/direct-write denial through the SDK transport.');
await signOut(auth);
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
