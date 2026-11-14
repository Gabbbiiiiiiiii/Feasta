'use strict';
/* Temporary FEASTA browser acceptance fixture; run only via isolated Firebase emulators. */
const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {initializeApp, getApps} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');

const project = 'demo-feasta-stage-e';
const webPort = Number(process.env.FEASTA_STAGE_E_WEB_PORT);
const root = path.resolve(__dirname, '../../..');
let nextChild;
let stopping = false;

function localHost(name) {
  const value = process.env[name] || '';
  assert.match(value, /^127\.0\.0\.1:\d{2,5}$/, `${name} must be 127.0.0.1:<port>`);
  return value;
}
function stop() {
  if (stopping) return;
  stopping = true;
  if (nextChild && nextChild.exitCode === null && !nextChild.killed) {
    if (process.platform === 'win32') {
      // Windows SIGTERM does not propagate to Next's child server.
      // Terminate only the still-running subtree created by this fixture.
      spawnSync('taskkill.exe', ['/PID', String(nextChild.pid), '/T', '/F'],
        {windowsHide: true, stdio: 'ignore'});
    } else nextChild.kill('SIGTERM');
  }
}
process.on('SIGINT', () => { stop(); process.exit(130); });
process.on('SIGTERM', () => { stop(); process.exit(143); });
process.on('exit', stop);

async function main() {
  assert.equal(process.env.GCLOUD_PROJECT, project);
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, project);
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, '1234567890');
  assert.equal(process.env.FIREBASE_ADMIN_PROJECT_ID, project);
  assert.equal(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS, 'true');
  assert.equal(process.env.USE_FIREBASE_EMULATORS, 'true');
  assert.equal(process.env.NEXT_PUBLIC_PROVIDER_PACKAGE_EDITOR_PROGRESS_ENABLED, 'true');
  assert.equal(process.env.NEXT_PUBLIC_PROVIDER_PACKAGE_V2_DRAFTS_ENABLED, 'true');
  assert.equal(process.env.FEASTA_V2_DRAFT_DEMO_ENABLED, 'true');
  const mobileWebPort=Number(process.env.FEASTA_STAGE_E_MOBILE_WEB_PORT || 0);
  assert.ok(mobileWebPort===0 || Number.isInteger(mobileWebPort) && mobileWebPort>1023 && mobileWebPort<=65535);
  const allowedOrigins=[`http://127.0.0.1:${webPort}`,
    ...(mobileWebPort ? [`http://127.0.0.1:${mobileWebPort}`] : [])];
  assert.equal(process.env.WEB_ALLOWED_ORIGINS,allowedOrigins.join(','));
  assert.ok(Number.isInteger(webPort) && webPort > 1023 && webPort <= 65535);
  const authHost = localHost('FIREBASE_AUTH_EMULATOR_HOST');
  localHost('FIRESTORE_EMULATOR_HOST');
  localHost('FIREBASE_STORAGE_EMULATOR_HOST');
  const config = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
  assert.equal(config.projectId, project);
  assert.equal(getApps().length, 0, 'Unexpected pre-existing Firebase Admin app');
  initializeApp({projectId: project});
  const auth = getAuth();
  const db = getFirestore();

  const publicationEnabled = process.env.FEASTA_V2_PUBLICATION_DEMO_ENABLED === 'true' &&
    process.env.NEXT_PUBLIC_PROVIDER_PACKAGE_V2_PUBLICATION_DEMO_ENABLED === 'true';
  const email = 'phase1c-browser-provider@example.invalid';
  const password = 'DemoOnly_4567!';
  const phone = '+639171234567';
  const user = await auth.createUser({email, password, emailVerified: true, displayName: 'Demo FEASTA Provider'});
  const providerId = `phase1c_browser_provider_${user.uid}`;
  const provider = {
    ownerId: user.uid, ownerEmail: email, ownerPhone: phone,
    businessName: 'Local FEASTA Browser Demo', providerServiceType: 'catering',
    publiclyVisible:true,description:'Isolated demo catering provider',address:'123 Demo Street',city:'Ormoc City',province:'Leyte',
    providerCategory:'catering_service',operatingDays:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
    bookingLeadTimeDays:0,unavailableDates:[],serviceCategories: ['catering_service'], eventTypesSupported: ['birthday', 'wedding'],
    minGuestsPerEvent: 20, maxGuestsPerEvent: 200,
    verificationStatus: 'approved', accountStatus: 'active',
    isActive: true, isBlocked: false, isSuspended: false, isDeleted: false,
  };
  const userDoc = {
    role: 'provider', providerId, email, isEmailVerified: true,
    accountStatus: 'active', isActive: true, isBlocked: false,
    isPhoneVerified: true, phoneNumber: phone,
  };
  const batch = db.batch();
  batch.set(db.doc(`users/${user.uid}`), userDoc);
  batch.set(db.doc(`providers/${providerId}`), provider);
  batch.set(db.doc(`providerEligibilityAuthorities/${providerId}`), {revision: 1, approvedOccasionIds: ['birthday', 'wedding'], approvedCategoryCodes:['catering_service']});
  batch.set(db.doc('contractPolicies/providerPackageV2'), {
    effectiveEnvironment: project, revision: 1, maxSpecificOccasions: 10, maxThemeImages: 4,
    featureGates: {packageEditorProgressWrites: true, occasionCatalogReads: true, packageDraftWrites: true,
      packagePublication:publicationEnabled,customerDiscovery:publicationEnabled,customerBooking:publicationEnabled},
  });
  batch.set(db.doc('maintenanceControls/intake'), {schemaVersion: 1, revision: 1, intake: false, publication: false});
  batch.set(db.doc('occasionCatalog/current'), {activationState: 'stable', revision: 1});
  for (const [id, label] of [['birthday','Birthday'], ['wedding','Wedding']]) {
    batch.set(db.doc(`occasions/${id}`), {id, label, active: true, moderationState: 'approved', revision: 1,
      sortOrder:id==='birthday'?0:1,applicableServiceCategoryCodes: ['catering_service']});
  }
  batch.set(db.doc('serviceCategories/catering_service'), {code: 'catering_service', name: 'Catering', serviceType: 'catering',
    status: 'active', active: true, isActive: true, isDeleted: false});
  await batch.commit();
  console.log('Demo Auth, provider profile, occasion catalog and private-progress policy seeded.');

  const loginURL = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-only`;
  const loginResponse = await fetch(loginURL, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({email, password, returnSecureToken: true})});
  const login = await loginResponse.json();
  assert.equal(loginResponse.status, 200, 'Demo provider Firebase sign-in failed: ' + JSON.stringify(login));
  assert.ok(login.idToken);

  // Link a real phone provider through the Auth Emulator SMS verification flow.
  // Setting Auth UserRecord.phoneNumber alone does not establish phone provider ownership.
  const smsResponse = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=demo-local-only`, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({phoneNumber: phone, recaptchaToken: 'emulator-test'}),
  });
  const smsBody = await smsResponse.json();
  assert.equal(smsResponse.status, 200, 'Demo SMS challenge failed: ' + JSON.stringify(smsBody));
  assert.ok(smsBody.sessionInfo, 'SMS challenge missing sessionInfo');
  const codesResponse = await fetch(`http://${authHost}/emulator/v1/projects/${project}/verificationCodes`);
  const codesBody = await codesResponse.json();
  assert.equal(codesResponse.status, 200, 'Could not read local emulator verification codes');
  const challenge = (codesBody.verificationCodes || []).find(x => x.sessionInfo === smsBody.sessionInfo);
  assert.ok(challenge?.code, 'Emulator OTP not found');
  const linkResponse = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=demo-local-only`, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({idToken: login.idToken, sessionInfo: smsBody.sessionInfo, code: challenge.code}),
  });
  const linkBody = await linkResponse.json();
  assert.equal(linkResponse.status, 200, 'Phone provider linking failed: ' + JSON.stringify(linkBody));
  assert.equal(linkBody.localId, user.uid, 'Phone linked to wrong Auth account');
  const verifiedAuthUser = await auth.getUser(user.uid);
  assert.equal(verifiedAuthUser.phoneNumber, phone);
  assert.ok(verifiedAuthUser.providerData.some(p => p.providerId === 'phone'), 'Phone provider not linked');
  console.log('Demo provider phone ownership verified through Auth Emulator OTP linking.');

  // Obtain a fresh password-auth token after linking to establish Web session.
  const refreshedResponse = await fetch(loginURL, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({email, password, returnSecureToken: true})});
  const refreshedBody = await refreshedResponse.json();
  assert.equal(refreshedResponse.status, 200, 'Demo re-login failed: ' + JSON.stringify(refreshedBody));
  assert.ok(refreshedBody.idToken);
  login.idToken = refreshedBody.idToken;

  const customerEmail = 'v2-browser-customer@example.invalid';
  const customerPhone = '+639171234568';
  const customer = await auth.createUser({email:customerEmail,password,emailVerified:true});
  await db.doc('users/'+customer.uid).set({role:'customer',email:customerEmail,accountStatus:'active',
    isActive:true,isBlocked:false,isEmailVerified:true,isPhoneVerified:true,phoneNumber:customerPhone});
  await db.doc('customers/'+customer.uid).set({userId:customer.uid,firstName:'Demo',lastName:'Customer',
    email:customerEmail,phoneNumber:customerPhone});
  const customerLogin = await fetch(loginURL,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:customerEmail,password,returnSecureToken:true})});
  assert.equal(customerLogin.status,200,'Customer demo sign-in failed');
  const customerToken = (await customerLogin.json()).idToken;
  const customerSms = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=demo-local-only`,
    {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phoneNumber:customerPhone,recaptchaToken:'emulator-test'})});
  assert.equal(customerSms.status,200,'Customer demo SMS challenge failed');
  const customerChallengeInfo = (await customerSms.json()).sessionInfo;
  const customerCodes = await (await fetch(`http://${authHost}/emulator/v1/projects/${project}/verificationCodes`)).json();
  const customerChallenge = customerCodes.verificationCodes.find(row=>row.sessionInfo===customerChallengeInfo);
  assert.ok(customerChallenge,'Customer demo OTP not found');
  const customerLink = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=demo-local-only`,
    {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:customerToken,
      sessionInfo:customerChallengeInfo,code:customerChallenge.code})});
  assert.equal(customerLink.status,200,'Customer demo phone linking failed');
  assert.equal((await customerLink.json()).localId,customer.uid);
  const customerRefresh = await fetch(loginURL,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:customerEmail,password,returnSecureToken:true})});
  assert.equal(customerRefresh.status,200);
  const customerIdToken=(await customerRefresh.json()).idToken;


  const seededPackages = [];
  if (process.env.FEASTA_BROWSER_SEED_V2 === 'true') {
    assert.ok(publicationEnabled, 'Lifecycle seed requires explicit demo publication gates');
    const {initializeApp: initializeClient, deleteApp} = require('firebase/app');
    const {getAuth: clientAuth, connectAuthEmulator, signInWithEmailAndPassword} = require('firebase/auth');
    const {getFunctions, connectFunctionsEmulator, httpsCallable} = require('firebase/functions');
    const app = initializeClient({projectId: project, apiKey: 'demo-only', appId: 'demo-only'}, 'browser-v2-seed');
    try {
      const client = clientAuth(app);
      connectAuthEmulator(client, 'http://' + authHost, {disableWarnings: true});
      const functions = getFunctions(app, 'asia-southeast1');
      const functionsPort = Number(process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT);
      assert.ok(Number.isInteger(functionsPort) && functionsPort > 1023 && functionsPort <= 65535);
      connectFunctionsEmulator(functions, '127.0.0.1', functionsPort);
      await signInWithEmailAndPassword(client, email, password);
      for (const model of ['per_pax', 'per_bundle']) {
        const price = model === 'per_pax' ? 100 : 5000;
        const created = (await httpsCallable(functions, 'createProviderPackageV2')({
          sharedContractVersion: 2, idempotencyKey: 'browser_seed_' + model + '_12345678',
          name: model === 'per_pax' ? 'Browser Per Pax V2' : 'Browser Fixed Bundle V2',
          description: 'Isolated browser acceptance package. No live media or payments.',
          serviceCategoryCode: 'catering_service', occasionSchemaVersion: 2,
          occasionScope: model === 'per_pax' ? 'specific' : 'all',
          occasionIds: model === 'per_pax' ? ['birthday', 'wedding'] : [],
          offerSchemaVersion: 2, pricingModel: model, price,
          minimumGuests: 20, maximumGuests: 100, paymentPolicy: 'full_payment', depositPercentage: 100,
          imageUrl: '', imageUrls: [], themeOptions: [], foodInclusions: [],
          serviceInclusions: [], decorInclusions: [], furnitureInclusions: [], equipmentInclusions: [],
          serviceOptions: {
            drop_off: {price, includedServices: ['Delivery'], decorInclusions: [], furnitureInclusions: [], equipmentInclusions: ['Transport containers']},
            buffet_setup: {price: price * 1.5, includedServices: ['Buffet setup'], decorInclusions: ['Buffet skirting'], furnitureInclusions: ['Buffet tables'], equipmentInclusions: ['Chafing dishes']},
            full_service: {price: price * 2, includedServices: ['Service staff'], decorInclusions: ['Dining centerpieces'], furnitureInclusions: ['Dining chairs'], equipmentInclusions: ['Full buffet equipment']},
          },
          foodChoiceGroups: [
            {id: 'main', title: 'Main dish', selectionCount: 1, options: [{id: 'chicken', name: 'Chicken'}, {id: 'fish', name: 'Fish'}, {id: 'beef', name: 'Beef'}]},
            {id: 'sides', title: 'Side dishes', selectionCount: 2, options: [{id: 'rice', name: 'Rice'}, {id: 'pasta', name: 'Pasta'}, {id: 'salad', name: 'Salad'}]},
          ],
        })).data;
        seededPackages.push({id: created.packageId, model, price});
        const draft = (await db.doc('packages/' + created.packageId).get()).data();
        assert.equal(draft.status, 'draft'); assert.equal(draft.isPublished, false);
        console.log('Seeded private browser draft: ' + draft.name + ' (' + created.packageId + ')');
      }
    } finally { await deleteApp(app); }
  }

  const nextPath = path.join(root, 'apps', 'web', 'node_modules', 'next', 'dist', 'bin', 'next');
  assert.ok(fs.existsSync(nextPath), `Next.js not installed at ${nextPath} (installation intentionally not attempted)`);
  const origin = `http://127.0.0.1:${webPort}`;
  console.log('Starting isolated Next.js dev server at ' + origin);
  nextChild = spawn(process.execPath, [nextPath, 'dev', '--webpack', '-p', String(webPort), '-H', '127.0.0.1'], {
    cwd: path.join(root, 'apps', 'web'), env: process.env, stdio: 'inherit', windowsHide: true,
  });

  let ready = false;
  for (let i = 0; i < 100; ++i) {
    if (nextChild.exitCode !== null) throw new Error('Next.js exited before becoming ready');
    try {
      const r = await fetch(origin + '/api/auth/csrf', {signal: AbortSignal.timeout(1500)});
      if (r.ok) { ready = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!ready) throw new Error('Next.js CSRF endpoint did not become ready');

  const csrfResponse = await fetch(origin + '/api/auth/csrf');
  const csrfBody = await csrfResponse.json();
  const csrfSetCookie = csrfResponse.headers.get('set-cookie') || '';
  assert.ok(csrfResponse.ok && csrfBody.token, 'CSRF endpoint did not return a token');
  assert.ok(csrfSetCookie, 'CSRF cookie missing');
  const csrfCookie = csrfSetCookie.split(';', 1)[0];
  const sessionResponse = await fetch(origin + '/api/auth/session', {method:'POST', headers: {
    'content-type': 'application/json', origin, cookie: csrfCookie, 'x-feasta-csrf': csrfBody.token,
  }, body: JSON.stringify({idToken: login.idToken, expectedRole:'provider', returnTo:'/provider/packages'})});
  const sessionText = await sessionResponse.text();
  if (!sessionResponse.ok) {
    console.error(`SESSION CHECK FAILED: HTTP ${sessionResponse.status}: ${sessionText.slice(0, 1400)}`);
    throw new Error('Web session check did not pass. Do not bypass session validation.');
  }
  const sessionData = JSON.parse(sessionText);
  assert.equal(sessionData.role, 'provider', 'Web session did not resolve provider role');
  console.log('\nPASS: Demo provider authenticated with Firebase and the real FEASTA Next.js session route.');
  const customerCsrfResponse=await fetch(origin+'/api/auth/csrf');
  const customerCsrf=await customerCsrfResponse.json();
  const customerCsrfCookie=customerCsrfResponse.headers.get('set-cookie').split(';',1)[0];
  const customerSession=await fetch(origin+'/api/auth/session',{method:'POST',headers:{
    'content-type':'application/json',origin,cookie:customerCsrfCookie,'x-feasta-csrf':customerCsrf.token},
    body:JSON.stringify({idToken:customerIdToken,expectedRole:'customer',returnTo:'/customer/packages'})});
  assert.equal(customerSession.status,200,'Customer Web session check failed');
  assert.equal((await customerSession.json()).role,'customer');
  console.log('PASS: Demo customer authenticated with the real FEASTA Next.js session route.');
  if(process.env.FEASTA_BROWSER_SMOKE_ONLY==='true') {
    const providerCookie=sessionResponse.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
    const customerCookie=customerSession.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
    assert.equal((await fetch(origin+'/provider/packages',{headers:{cookie:providerCookie},redirect:'manual'})).status,200);
    assert.equal((await fetch(origin+'/customer/packages',{headers:{cookie:customerCookie},redirect:'manual'})).status,200);
    const customerPage = async () => {
      const response = await fetch(origin + '/customer/packages', {headers: {cookie: customerCookie}, redirect: 'manual'});
      assert.equal(response.status, 200);
      return response.text();
    };
    const privatePage = await customerPage();
    for (const item of seededPackages) {
      const name = item.model === 'per_pax' ? 'Browser Per Pax V2' : 'Browser Fixed Bundle V2';
      assert.ok(!privatePage.includes(name), 'Private draft leaked through customer server rendering');
    }
    if (seededPackages.length) {
      const {initializeApp: initializeClient, deleteApp} = require('firebase/app');
      const {getAuth: clientAuth, connectAuthEmulator, signInWithEmailAndPassword} = require('firebase/auth');
      const {getFunctions, connectFunctionsEmulator, httpsCallable} = require('firebase/functions');
      const app = initializeClient({projectId: project, apiKey: 'demo-only', appId: 'demo-only'}, 'browser-v2-smoke');
      try {
        const client = clientAuth(app); connectAuthEmulator(client, 'http://' + authHost, {disableWarnings: true});
        const functions = getFunctions(app, 'asia-southeast1');
        connectFunctionsEmulator(functions, '127.0.0.1', Number(process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT));
        const call = async (name, data) => (await httpsCallable(functions, name)(data)).data;
        for (const [index, item] of seededPackages.entries()) {
          await signInWithEmailAndPassword(client, email, password);
          const published = await call('publishProviderPackage', {sharedContractVersion: 2, packageId: item.id,
            expectedRevision: 1, idempotencyKey: 'browser_publish_' + item.model + '_12345678'});
          assert.equal(published.packageRevision, 2);
          const name = item.model === 'per_pax' ? 'Browser Per Pax V2' : 'Browser Fixed Bundle V2';
          const publicPage = await customerPage(); assert.ok(publicPage.includes(name), 'Published package missing from customer server rendering');
          if (index === 0) assert.ok(!publicPage.includes('Browser Fixed Bundle V2'), 'Other private draft leaked');
          const detailPage = await fetch(origin + '/customer/packages/' + item.id, {headers: {cookie: customerCookie}, redirect: 'manual'});
          assert.equal(detailPage.status, 200); assert.ok((await detailPage.text()).includes(name));
          await signInWithEmailAndPassword(client, customerEmail, password);
          const verified = (await call('getCustomerPackageV2', {packageId: item.id})).package;
          assert.equal(verified.revision, 2); assert.equal(verified.pricingModel, item.model);
          assert.deepEqual(verified.occasionMatchIds, ['birthday', 'wedding']);
          assert.equal(verified.serviceOptions.full_service.price, item.price * 2);
          const selection = {clientRequestId: 'browser_booking_' + item.model + '_12345678', providerId, packageId: item.id,
            sharedContractVersion: 2, expectedPackageRevision: 2, eventType: 'wedding',
            eventDate: index === 0 ? '2099-03-10' : '2099-03-11', eventTime: '10:00', eventEndTime: '14:00',
            eventLocation: 'Ormoc City', eventAddress: '123 Demo Street', guestCount: 20, serviceTier: 'full_service',
            foodChoiceSelections: [{groupId: 'main', optionIds: ['chicken']}, {groupId: 'sides', optionIds: ['rice', 'pasta']}],
            selectedFoods: [], selectedDecorations: [], selectedFurniture: [], addonIds: []};
          await assert.rejects(call('getBookingPaymentAgreementDisclosures', {...selection,
            foodChoiceSelections: [{groupId: 'main', optionIds: ['chicken']}, {groupId: 'sides', optionIds: ['rice']}]}),
          error => error.code === 'functions/invalid-argument');
          const expectedPrice = item.price * 2 * (item.model === 'per_pax' ? 20 : 1);
          const disclosures = await call('getBookingPaymentAgreementDisclosures', selection);
          assert.equal(disclosures.agreements[0].grossAmountInCentavos, expectedPrice * 100);
          const payload = {...selection, agreementAcknowledgements: disclosures.agreements.map(a => ({providerId: a.providerId, agreementKey: a.agreementKey}))};
          const booking = await call('submitBookingRequest', payload); assert.equal(booking.created, true);
          assert.equal((await call('submitBookingRequest', payload)).created, false);
          const snapshot = (await db.doc('mainEvents/' + booking.mainEventId).get()).data();
          assert.equal(snapshot.packagePrice, expectedPrice); assert.equal(snapshot.packageOfferSnapshotV2.revision, 2);
          assert.equal(snapshot.foodChoiceSelections.find(group => group.groupId === 'sides').options.length, 2);
          console.log('PASS: Next server discovery/detail plus SDK authoritative ' + item.model + ' booking, required-choice rejection, snapshots and replay.');
        }
      } finally { await deleteApp(app); }
    }
    console.log('PASS: isolated provider/customer session and package-page smoke checks.');
    stop();return;
  }
  console.log('MANUAL BROWSER ACCEPTANCE:');
  console.log('Open: ' + origin + '/provider-login');
  console.log('Email: ' + email);
  console.log('Password: ' + password);
  console.log('After login, visit: ' + origin + '/provider/packages');
  console.log('Test: select Birthday+Wedding -> Save progress -> Close -> Resume -> edit -> Discard.');
  console.log('Demo publication/discovery/booking gates: '+publicationEnabled);
  console.log('Customer login: '+customerEmail+' / '+password+' (use a separate browser session).');
  console.log('DO NOT upload images or use live Cloudinary credentials in this local acceptance.');
  console.log('BROWSER CHECKS:');
  console.log('1. Save progress, close and resume; verify values.');
  console.log('2. Create an image-free private V2 draft or edit the optional seeded private drafts.');
  console.log('3. Verify the saved package is a DRAFT and private; reopen it and edit pricing.');
  console.log('4. Try Fits All and the alternate pricing model.');
  console.log('5. If image is required or a Cloudinary error appears, STOP and report it; no bypass.');
  console.log('When finished, press Ctrl+C in the testing PowerShell terminal to stop and clean up.');
  await new Promise((resolve, reject) => {
    nextChild.on('exit', code => code === 0 ? resolve() : reject(new Error('Next.js server exited: ' + code)));
  });
}
main().catch(e => {console.error(e.stack || String(e)); process.exitCode = 1; stop();});
