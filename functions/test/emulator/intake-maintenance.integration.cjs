const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {requireMaintenanceOpen,recordMaintenanceAdmission}=require('../../lib/shared/maintenance.js');
const project=process.env.GCLOUD_PROJECT;
if(!project?.startsWith('demo-') || !/^127\.0\.0\.1:\d+$/u.test(process.env.FIRESTORE_EMULATOR_HOST??'')) {
  throw Error('Local demo Firestore emulator required');
}
const app=initializeApp({projectId:project}),db=getFirestore(app);
(async()=>{try{
  const control=db.doc('maintenanceControls/intake');
  await control.set({schemaVersion:1,revision:1,intake:false,publication:false});
  for(const scope of ['intake','publication']) {
    await control.update({intake:false,publication:false});
    const out=db.collection('maintenanceRace').doc();
    let release,started,attempt=0;
    const wait=new Promise(r=>release=r),ready=new Promise(r=>started=r);
    const pending=db.runTransaction(async tx=>{
      await requireMaintenanceOpen(tx,db,scope);
      if(attempt++===0){started();await wait;}
      recordMaintenanceAdmission(tx,db);
      tx.create(out,{at:FieldValue.serverTimestamp()});
    });
    await ready;
    const closing=db.runTransaction(async tx=>{await tx.get(control);tx.update(control,{intake:true,publication:true,closedAt:FieldValue.serverTimestamp()});});
    release();
    const [admitted,closed]=await Promise.allSettled([pending,closing]);
    assert.equal(closed.status,'fulfilled');
    if(admitted.status==='fulfilled') {
      assert.ok((await out.get()).data().at.toMillis()<=(await control.get()).data().closedAt.toMillis());
    } else assert.equal(admitted.reason.code,'unavailable');
    const attempts=await Promise.allSettled(Array.from({length:8},()=>db.runTransaction(async tx=>{
      await requireMaintenanceOpen(tx,db,scope);tx.create(db.collection('maintenanceRace').doc(),{bad:true});
    })));
    assert.ok(attempts.every(r=>r.status==='rejected'&&r.reason.code==='unavailable'));
  }
  console.log('Real Firestore transaction activation races and concurrent rejection passed.');
  // Run existing financial acceptance fixtures while BOTH scopes are paused.
  // Their gateway dependencies are mocked by those fixtures; no PayMongo I/O.
  const {createPaymentSessionForCustomer}=require('../../lib/payments/create-payment-session.js');
  const agreement={legacyContract:'retained immutable booking agreement'};
  await db.doc('mainEvents/maintenance-existing').set({mainEventId:'maintenance-existing',bookingId:'maintenance-existing',
    customerId:'maintenance-customer',providerRequestIds:['maintenance-request'],status:'waiting_for_down_payment'});
  await db.doc('providerRequests/maintenance-request').set({providerRequestId:'maintenance-request',
    mainEventId:'maintenance-existing',bookingId:'maintenance-existing',customerId:'maintenance-customer',providerId:'maintenance-provider',
    status:'waiting_for_down_payment',paymentStatus:'unpaid',downPaymentAmount:100,
    type:'catering',guestCount:20,eventTime:'10:00',eventEndTime:'14:00',
    acceptedAt:Timestamp.fromMillis(Date.now()-1000),expiresAt:Timestamp.fromMillis(Date.now()+3600000),
    eventDate:Timestamp.fromMillis(Date.now()+30*86400000),bookingPaymentAgreement:agreement,
    financialSnapshot:{schemaVersion:1,currency:'PHP',grossAmountInCentavos:10000,
      requiredUpfrontAmountInCentavos:10000,remainingBalanceInCentavos:0}});
  await db.doc('providers/maintenance-provider').set({ownerId:'maintenance-owner',verificationStatus:'approved',
    isActive:true,isSuspended:false,isDeleted:false,providerServiceType:'catering',providerCategory:'catering_service',
    serviceCategories:['catering_service'],operatingDays:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
    unavailableDates:[],bookingLeadTimeDays:0,acceptsMultipleEventsPerDay:true,maxEventsPerDay:50,minGuestsPerEvent:1,maxGuestsPerEvent:500});
  await db.doc('users/maintenance-owner').set({role:'provider',providerId:'maintenance-provider',accountStatus:'active',
    isActive:true,isBlocked:false});
  await db.doc('providerPaymentAccounts/maintenance-provider').set({schemaVersion:1,providerId:'maintenance-provider',
    linkedAccountType:'merchant',setupStatus:'ready',payoutReady:true,paymongoAccountId:'org_test_maintenance'});
  let gateway=0;
  const checkoutInput={customerId:'maintenance-customer',providerRequestId:'maintenance-request',paymentChoice:'full',
    clientKey:'maintenance_existing_payment',secretKey:'stub-secret',successUrl:'https://example.test/success',
    cancelUrl:'https://example.test/cancel',createCheckout:async input=>{
      gateway++;assert.equal(input.amountInCentavos,10000);
      return {id:'cs_maintenance_existing',checkoutUrl:'https://checkout.paymongo.com/maintenance'};
    }};
  const paid=await createPaymentSessionForCustomer(checkoutInput);
  assert.ok(paid.paymentId);assert.equal(gateway,1);
  assert.equal((await createPaymentSessionForCustomer(checkoutInput)).paymentId,paid.paymentId);
  assert.equal(gateway,1);
  assert.deepEqual((await db.doc('providerRequests/maintenance-request').get()).data().bookingPaymentAgreement,agreement);
  console.log('Existing booking checkout and cached replay work with both scopes paused.');
  for(const file of ['payment-webhook.integration.cjs','refund-execution.integration.cjs']) {
    const r=spawnSync(process.execPath,[path.join(__dirname,file)],{env:process.env,encoding:'utf8',maxBuffer:3e6});
    process.stdout.write(r.stdout);process.stderr.write(r.stderr);
    assert.equal(r.status,0,file+' failed');
    assert.equal((await control.get()).data().intake,true);
  }
  await control.update({revision:2,intake:true,publication:false});
  await db.runTransaction(tx=>requireMaintenanceOpen(tx,db,'publication'));
  await assert.rejects(db.runTransaction(tx=>requireMaintenanceOpen(tx,db,'intake')),{code:'unavailable'});
  await control.update({revision:3,intake:false,publication:false});
  await db.runTransaction(tx=>requireMaintenanceOpen(tx,db,'intake'));
  await control.delete();
  await assert.rejects(db.runTransaction(tx=>requireMaintenanceOpen(tx,db,'intake')),{code:'unavailable'});
  console.log('Financial fixtures under maintenance and reopening passed.');
  const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
  const {doc,setDoc}=require('firebase/firestore');
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const env=await initializeTestEnvironment({projectId:project,firestore:{host,port:Number(port)}});
  try {
    for(const claims of [{role:'provider'},{role:'admin',admin:true}]) {
      const client=env.authenticatedContext('maintenance-rules-user',claims).firestore();
      for(const target of ['maintenanceControls/intake','maintenanceAudits/client-overwrite',
        'mainEvents/legacy-new','providerRequests/legacy-new','bookings/legacy-new',
        'packages/legacy-new','addons/legacy-new','providers/legacy-provider/catalog/setups']) {
        await assertFails(setDoc(doc(client,target),{isPublished:true,intake:false,publication:false}));
      }
    }
  } finally {await env.cleanup();}
  console.log('Legacy SDK and client-admin maintenance/publication bypass attempts denied by rules.');
}finally{await deleteApp(app);}})().catch(e=>{console.error(e);process.exitCode=1;});
