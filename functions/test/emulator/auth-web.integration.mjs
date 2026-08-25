import assert from "node:assert/strict";

import {deleteApp as deleteAdminApp, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getAuth as getAdminAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {deleteApp, initializeApp} from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  linkWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST;
const webUrl = process.env.PHASE3_WEB_URL;
assert.ok(authHost && functionsHost && webUrl, "Acceptance emulator hosts are required.");

const password = "FeastaTest!2026";
const customerConsent = {
  acceptedTerms: true,
  acceptedPrivacy: true,
  termsPolicyVersion: "auth-web-test-terms",
  privacyPolicyVersion: "auth-web-test-privacy",
};
const clientApp = initializeApp({apiKey: "fake-api-key", projectId}, `acceptance-${Date.now()}`);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${authHost}`, {disableWarnings: true});
const adminApp = initializeAdminApp({projectId}, `acceptance-admin-${Date.now()}`);
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);

try {
  await waitForWeb();
  await testDeterministicFixtureWorkflows();
  await testEmailCustomerFlow();
  await testGoogleCustomerFlow();
  await testProviderPhoneFirstAuthentication();
  await testPhoneVerificationWorkflow();
  await testBlockedAndDisabledAccounts();
  await testAccountManagementWorkflows();
  await clearWebSessionRateLimits();
  await testWebSessionsAndRoles();
  console.log("Auth/web acceptance passed.");
} finally {
  await signOut(auth).catch(() => undefined);
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}

async function testDeterministicFixtureWorkflows() {
  await clearWebSessionRateLimits();

  const activeCustomer = await signInWithEmailAndPassword(
    auth,
    "customer@feasta.test",
    password,
  );
  const customerSession = await createWebSession(
    await activeCustomer.user.getIdToken(true),
    "/customer",
    "customer",
  );
  assert.equal((await webGet("/customer", customerSession.cookie)).status, 200);
  await signOut(auth);

  const unverified = await signInWithEmailAndPassword(
    auth,
    "customer.unverified@feasta.test",
    password,
  );
  const unverifiedSession = await createWebSession(
    await unverified.user.getIdToken(true),
    "/customer",
    "customer",
  );
  const unverifiedAccess = await webGet(
    "/customer",
    unverifiedSession.cookie,
  );
  assert.equal(unverifiedAccess.status, 307);
  assert.match(
    unverifiedAccess.headers.get("location") ?? "",
    /\/verify-email$/,
  );
  await signOut(auth);

  const blocked = await signInWithEmailAndPassword(
    auth,
    "customer.blocked@feasta.test",
    password,
  );
  const blockedResponse = await postSession(
    await blocked.user.getIdToken(true),
    await getCsrf(),
    "/customer",
    "customer",
  );
  assert.equal(blockedResponse.status, 403);
  assert.equal((await blockedResponse.json()).reason, "account_blocked");
  await signOut(auth);

  const deactivated = await signInWithEmailAndPassword(
    auth,
    "customer.deactivated@feasta.test",
    password,
  );
  const deactivatedResponse = await postSession(
    await deactivated.user.getIdToken(true),
    await getCsrf(),
    "/customer",
    "customer",
  );
  assert.equal(deactivatedResponse.status, 403);
  assert.equal((await deactivatedResponse.json()).reason, "account_disabled");
  await signOut(auth);

  const missingProfile = await signInWithEmailAndPassword(
    auth,
    "customer.missing-profile@feasta.test",
    password,
  );
  const missingProfileResponse = await postSession(
    await missingProfile.user.getIdToken(true),
    await getCsrf(),
    "/customer",
    "customer",
  );
  assert.equal(missingProfileResponse.status, 403);
  assert.equal((await missingProfileResponse.json()).reason, "missing_profile");
  await signOut(auth);

  const setupProvider = await signInWithEmailAndPassword(
    auth,
    "provider.missing-setup@feasta.test",
    password,
  );
  const setupProviderSession = await createWebSession(
    await setupProvider.user.getIdToken(true),
    "/provider",
    "provider",
  );
  const setupAccess = await webGet("/provider", setupProviderSession.cookie);
  assert.equal(setupAccess.status, 307);
  assert.match(
    setupAccess.headers.get("location") ?? "",
    /\/provider-verify-phone$/,
  );
  await signOut(auth);

  const approvedProvider = await signInWithEmailAndPassword(
    auth,
    "provider.approved@feasta.test",
    password,
  );
  const approvedProviderSession = await createWebSession(
    await approvedProvider.user.getIdToken(true),
    "/provider",
    "provider",
  );
  assert.equal(
    (await webGet("/provider", approvedProviderSession.cookie)).status,
    200,
  );
  await signOut(auth);

  const activeAdmin = await signInWithEmailAndPassword(
    auth,
    "admin@feasta.test",
    password,
  );
  const activeAdminSession = await createWebSession(
    await activeAdmin.user.getIdToken(true),
    "/admin",
    "admin",
  );
  assert.equal((await webGet("/admin", activeAdminSession.cookie)).status, 200);
  await signOut(auth);

  await assert.rejects(
    () => signInWithEmailAndPassword(
      auth,
      "admin.disabled@feasta.test",
      password,
    ),
    /user-disabled/i,
  );

  const expectedProviderStates = new Map([
    ["provider-pending", "draft"],
    ["provider-submitted", "submitted"],
    ["provider-under-review", "under_review"],
    ["provider-resubmission", "resubmission_required"],
    ["provider-rejected", "rejected"],
    ["provider-suspended", "suspended"],
    ["provider-approved", "approved"],
    ["provider-blocked", "approved"],
  ]);
  for (const [providerId, status] of expectedProviderStates) {
    const provider = await db.collection("providers").doc(providerId).get();
    const verification = await db
      .collection("providerVerifications")
      .doc(`verification-${providerId}`)
      .get();
    assert.equal(provider.data()?.verificationStatus, status);
    assert.equal(verification.data()?.status, status);
  }

  await clearWebSessionRateLimits();
}

async function testPhoneVerificationWorkflow() {
  const customer = await createVerifiedCustomer(
    "acceptance.phone@feasta.test",
  );
  const userRef = db.collection("users").doc(customer.uid);
  await assert.rejects(
    () => callFunction("syncPhoneVerification", customer, {}),
    /failed[_-]precondition/i,
  );

  const emulatorPhone = "+639000009999";
  await adminAuth.updateUser(customer.uid, {phoneNumber: emulatorPhone});
  await customer.reload();
  const result = await callFunction("syncPhoneVerification", customer, {});
  assert.equal(result.phoneNumber, emulatorPhone);
  assert.equal((await userRef.get()).data()?.isPhoneVerified, true);
  assert.equal(
    (await db.collection("customers").doc(customer.uid).get()).data()
      ?.phoneNumber,
    emulatorPhone,
  );
  await signOut(auth);
}

async function testProviderPhoneFirstAuthentication() {
  await clearPhoneRegistrationRateLimits();
  const phoneNumber = "+639000008888";
  const csrf = await getCsrf();

  const malformedPreflight = await postAuthAttempt({
    action: "provider_phone_registration",
    identifier: "not-a-phone",
  }, csrf);
  assert.equal(malformedPreflight.status, 400);
  const malformedBody = await malformedPreflight.json();
  assert.equal(
    malformedBody.error,
    "The authentication request could not be completed.",
  );
  assert.deepEqual(Object.keys(malformedBody), ["error"]);

  const allowedPreflight = await postAuthAttempt({
    action: "provider_phone_registration",
    identifier: phoneNumber,
  }, csrf);
  assert.equal(allowedPreflight.status, 204);
  const existingAccountPreflight = await postAuthAttempt({
    action: "provider_phone_registration",
    identifier: "+639000000001",
  }, csrf);
  assert.equal(existingAccountPreflight.status, allowedPreflight.status);
  assert.equal(
    await existingAccountPreflight.text(),
    await allowedPreflight.text(),
  );
  let phonePreflightRateLimited;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await postAuthAttempt({
      action: "provider_phone_registration",
      identifier: `+6390000089${String(attempt).padStart(2, "0")}`,
    }, csrf);
    if (response.status === 429) {
      phonePreflightRateLimited = response;
      break;
    }
    assert.equal(response.status, 204);
  }
  assert.ok(phonePreflightRateLimited, "Phone preflight was not rate limited.");
  assert.ok(Number(phonePreflightRateLimited.headers.get("retry-after")) > 0);

  const first = await signInWithEmulatorPhone(phoneNumber);
  const second = await signInWithEmulatorPhone(phoneNumber);
  assert.equal(first.isNewUser, true);
  assert.equal(second.isNewUser, false);
  assert.equal(second.localId, first.localId);

  const authUser = await adminAuth.getUser(first.localId);
  assert.equal(authUser.phoneNumber, phoneNumber);
  assert.ok(
    authUser.providerData.some((provider) => provider.providerId === "phone"),
    "Phone provider was not linked to the Auth Emulator user.",
  );

  const classificationCsrf = await getCsrf();
  const classification = await fetch(
    `${webUrl}/api/auth/provider-registration/classify`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: webUrl,
        cookie: classificationCsrf.cookie,
        "x-feasta-csrf": classificationCsrf.token,
      },
      body: JSON.stringify({
        idToken: second.idToken,
        phoneNumber,
      }),
    },
  );
  const classificationBody = await classification.json();
  assert.equal(classification.status, 200, JSON.stringify(classificationBody));
  assert.equal(classificationBody.classification, "auth_only");
  assert.equal(
    classificationBody.resolution.state,
    "email_credential_link_required",
  );
  assert.equal(
    (await db.collection("users").doc(first.localId).get()).exists,
    false,
  );
  assert.equal(
    (await db.collection("providers").where("ownerId", "==", first.localId).get())
      .empty,
    true,
  );

  await signOut(auth);
  const customToken = await adminAuth.createCustomToken(first.localId);
  const signedInPhone = await signInWithCustomToken(auth, customToken);
  const originalUid = signedInPhone.user.uid;
  assert.equal(originalUid, first.localId);
  const providerEmail = "phase-c.phone-provider@feasta.test";
  const linked = await linkWithCredential(
    signedInPhone.user,
    EmailAuthProvider.credential(providerEmail, password),
  );
  assert.equal(linked.user.uid, originalUid);
  assert.equal(auth.currentUser?.uid, originalUid);
  assert.ok(linked.user.providerData.some(
    (provider) => provider.providerId === "phone",
  ));
  assert.ok(linked.user.providerData.some(
    (provider) => provider.providerId === "password",
  ));
  assert.equal(linked.user.emailVerified, false);
  await linked.user.getIdToken(true);

  const identityInput = {
    firstName: "Phase C",
    lastName: "Provider",
    email: providerEmail,
    phoneNumber,
    acceptedTerms: true,
    acceptedPrivacy: true,
    termsPolicyVersion: "phase-c-test-terms",
    privacyPolicyVersion: "phase-c-test-privacy",
  };
  const identity = await callFunction(
    "ensureProviderIdentity",
    linked.user,
    identityInput,
  );
  assert.equal(identity.created, true);
  const replay = await callFunction(
    "ensureProviderIdentity",
    linked.user,
    identityInput,
  );
  assert.equal(replay.created, false);
  const phaseCAuthUser = await adminAuth.getUser(originalUid);
  assert.equal(phaseCAuthUser.email, providerEmail);
  assert.equal(phaseCAuthUser.emailVerified, false);
  assert.equal(
    (await db.collection("users").doc(originalUid).get()).data()?.role,
    "provider",
  );
  assert.equal(
    (await db.collection("users").doc(originalUid).get()).data()?.isEmailVerified,
    false,
  );
  assert.equal(
    (await db.collection("providers").where("ownerId", "==", originalUid).get())
      .empty,
    true,
  );
  await sendEmailVerification(linked.user);
  const phaseCVerificationCodes = await oobCodes(providerEmail, "VERIFY_EMAIL");
  assert.ok(phaseCVerificationCodes.length >= 1);
  assert.equal(linked.user.emailVerified, false);

  const limitedSession = await createWebSession(
    await linked.user.getIdToken(true),
    "/provider",
    "provider",
  );
  assert.equal(limitedSession.body.destination, "/provider");

  const limitedDashboard = await webGet("/provider", limitedSession.cookie);
  assert.equal(limitedDashboard.status, 200);
  const limitedDashboardHtml = await limitedDashboard.text();
  assert.match(limitedDashboardHtml, /Verify your email to continue/u);
  assert.match(limitedDashboardHtml, /Resend verification email/u);
  assert.doesNotMatch(
    limitedDashboardHtml,
    /Booking Requests|Packages \/ Catalog|Business Profile/u,
  );

  assert.equal(
    (await webGet("/provider/account", limitedSession.cookie)).status,
    200,
  );
  for (const deniedRoute of [
    "/provider/onboarding",
    "/provider/bookings",
    "/provider/packages",
  ]) {
    const denied = await webGet(deniedRoute, limitedSession.cookie);
    if (denied.status === 307) {
      assert.match(
        denied.headers.get("location") ?? "",
        /\/provider-verify-email$/u,
      );
    } else {
      // A redirect thrown after Next.js starts streaming is encoded as a
      // client redirect in a 200 response rather than an HTTP 307.
      assert.equal(denied.status, 200);
      assert.match(await denied.text(), /provider-verify-email/u);
    }
  }
  await signOut(auth);
}

async function testEmailCustomerFlow() {
  const email = "acceptance.customer@feasta.test";
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const first = await callFunction("ensureUserProfile", credential.user, {
    firstName: "Acceptance",
    lastName: "Customer",
    phoneNumber: "+639171111111",
    ...customerConsent,
  });
  assert.equal(first.created, true);

  const userRef = db.collection("users").doc(credential.user.uid);
  const userDoc = await userRef.get();
  const customerDoc = await db.collection("customers").doc(credential.user.uid).get();
  assert.equal(userDoc.data()?.role, "customer");
  assert.equal(userDoc.data()?.accountStatus, "active");
  assert.equal(userDoc.data()?.providerId, null);
  assert.equal(customerDoc.data()?.userId, credential.user.uid);

  await sendEmailVerification(credential.user);
  await sendEmailVerification(credential.user);
  const verificationCodes = await oobCodes(email, "VERIFY_EMAIL");
  assert.ok(verificationCodes.length >= 2, "Verification resend did not create another OOB code.");
  await fetchOk(verificationCodes.at(-1).oobLink);
  await credential.user.reload();
  assert.equal(auth.currentUser?.emailVerified, true);
  await callFunction("syncUserAuthState", auth.currentUser, {});
  assert.equal((await userRef.get()).data()?.isEmailVerified, true);

  await sendPasswordResetEmail(auth, email);
  const resetCodes = await oobCodes(email, "PASSWORD_RESET");
  const resetUrl = new URL(resetCodes.at(-1).oobLink);
  resetUrl.searchParams.set("newPassword", `${password}Reset`);
  await fetchOk(resetUrl.toString());
  await signOut(auth);
  const signedIn = await signInWithEmailAndPassword(auth, email, `${password}Reset`);
  assert.equal(signedIn.user.uid, credential.user.uid);
  await signOut(auth);
}

async function testGoogleCustomerFlow() {
  const googleCredential = GoogleAuthProvider.credential(JSON.stringify({
    sub: "phase3-google-customer",
    email: "acceptance.google@feasta.test",
    email_verified: true,
    name: "Google Customer",
  }));
  const signedIn = await signInWithCredential(auth, googleCredential);
  const first = await callFunction(
    "ensureUserProfile",
    signedIn.user,
    customerConsent,
  );
  const replay = await callFunction(
    "ensureUserProfile",
    signedIn.user,
    customerConsent,
  );
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  const ref = db.collection("users").doc(signedIn.user.uid);
  const user = (await ref.get()).data();
  assert.equal(user?.role, "customer");
  assert.equal(user?.providerId, null);
  assert.equal(user?.authProvider, "google.com");

  const session = await createWebSession(
    await signedIn.user.getIdToken(true),
    "/customer",
  );
  assert.equal(session.body.role, "customer");
  assert.equal(session.body.destination, "/customer");
  assert.equal((await webGet("/customer", session.cookie)).status, 200);

  await ref.update({role: "provider"});
  await assert.rejects(() => callFunction("ensureUserProfile", signedIn.user, {}), /permission[_-]denied/i);
  await signOut(auth);
}

async function testBlockedAndDisabledAccounts() {
  const blocked = await createCustomer("acceptance.blocked@feasta.test");
  await db.collection("users").doc(blocked.uid).update({isBlocked: true, accountStatus: "blocked"});
  await assert.rejects(() => callFunction("syncUserAuthState", blocked, {}), /permission[_-]denied/i);
  await signOut(auth);

  const disabled = await createCustomer("acceptance.disabled@feasta.test");
  await signOut(auth);
  await adminAuth.updateUser(disabled.uid, {disabled: true});
  await assert.rejects(
    () => signInWithEmailAndPassword(auth, "acceptance.disabled@feasta.test", password),
    /user-disabled/i,
  );
}

async function testAccountManagementWorkflows() {
  const customer = await createCustomer(
    "acceptance.account.customer@feasta.test",
  );
  await callFunction("updateCustomerProfile", customer, {
    firstName: "Updated",
    lastName: "Customer",
    address: "Account Street",
    city: "Ormoc City",
    province: "Leyte",
  });
  const customerProfile = (
    await db.collection("customers").doc(customer.uid).get()
  ).data();
  assert.equal(customerProfile?.firstName, "Updated");
  assert.equal(customerProfile?.address, "Account Street");
  await assert.rejects(
    () => callFunction("updateCustomerProfile", customer, {
      firstName: "Unsafe",
      lastName: "Mutation",
      address: "",
      city: "",
      province: "",
      role: "admin",
    }),
    /invalid[_-]argument/i,
  );
  await callFunction("updateAccountPreferences", customer, {
    marketingConsent: true,
    pushNotificationsEnabled: false,
    emailNotificationsEnabled: true,
  });
  assert.equal(
    (await db.collection("users").doc(customer.uid).get()).data()
      ?.marketingConsent,
    true,
  );

  await assert.rejects(
    () => reauthenticateWithCredential(
      customer,
      EmailAuthProvider.credential(customer.email, "incorrect-password"),
    ),
    /invalid-credential|wrong-password/i,
  );
  await reauthenticateWithCredential(
    customer,
    EmailAuthProvider.credential(customer.email, password),
  );
  await updatePassword(customer, `${password}Changed`);
  await verifyBeforeUpdateEmail(
    customer,
    "acceptance.account.changed@feasta.test",
  );
  const emailCodes = await emailChangeCodes(
    "acceptance.account.changed@feasta.test",
  );
  assert.ok(emailCodes.length > 0, "Email update verification was not sent.");
  await fetchOk(emailCodes.at(-1).oobLink);
  await customer.reload();
  await callFunction("syncUserAuthState", customer, {});
  assert.equal(
    (await db.collection("users").doc(customer.uid).get()).data()?.email,
    "acceptance.account.changed@feasta.test",
  );
  assert.equal(
    (await db.collection("customers").doc(customer.uid).get()).data()?.email,
    "acceptance.account.changed@feasta.test",
  );
  await signOut(auth);
  const changedPassword = await signInWithEmailAndPassword(
    auth,
    "acceptance.account.changed@feasta.test",
    `${password}Changed`,
  );
  assert.equal(changedPassword.user.uid, customer.uid);
  await signOut(auth);

  const deactivatedCustomer = await createCustomer(
    "acceptance.account.deactivate-customer@feasta.test",
  );
  await callFunction("deactivateCustomerAccount", deactivatedCustomer, {
    reason: "Acceptance test",
  });
  assert.equal(
    (await db.collection("users").doc(deactivatedCustomer.uid).get()).data()
      ?.accountStatus,
    "pending_deletion",
  );
  await signOut(auth);

  const provider = await createUser(
    "acceptance.account.provider@feasta.test",
  );
  await writeUserProfile(provider.uid, "provider");
  await db.collection("users").doc(provider.uid).update({
    providerId: "acceptance-account-provider",
    firstName: "Provider",
    lastName: "Owner",
  });
  await db.collection("providers").doc("acceptance-account-provider").set({
    ownerId: provider.uid,
    ownerFirstName: "Provider",
    ownerLastName: "Owner",
    businessName: "Original Account Catering",
    businessEmail: "original-account@feasta.test",
    businessPhone: "+639171111111",
    description: "Original provider description for account acceptance.",
    address: "Original address",
    city: "Ormoc City",
    province: "Leyte",
    providerServiceType: "catering",
    providerCategory: "full_service",
    verificationStatus: "draft",
    isActive: false,
    isSuspended: false,
  });
  await db.collection("providerVerifications")
    .doc("acceptance-account-provider-verification")
    .set({
      providerId: "acceptance-account-provider",
      ownerId: provider.uid,
      businessName: "Original Account Catering",
      status: "draft",
    });
  await callFunction("updateRoleAccountProfile", provider, {
    ownerFirstName: "Updated",
    ownerLastName: "Provider",
    businessName: "Updated Account Catering",
    businessEmail: "updated-account@feasta.test",
    businessPhone: "+639172222222",
    description: "Updated provider description for account acceptance.",
    address: "Updated address",
    city: "Ormoc City",
    province: "Leyte",
  });
  assert.equal(
    (await db.collection("providers")
      .doc("acceptance-account-provider").get()).data()?.businessName,
    "Updated Account Catering",
  );
  await db.collection("providers").doc("acceptance-account-provider").update({
    verificationStatus: "approved",
    isActive: true,
  });
  await assert.rejects(
    () => callFunction("updateRoleAccountProfile", provider, {
      ownerFirstName: "Updated",
      ownerLastName: "Provider",
      businessName: "Unreviewed Legal Name",
      businessEmail: "unreviewed@feasta.test",
      businessPhone: "+639172222222",
      description: "Updated provider description for account acceptance.",
      address: "Updated address",
      city: "Ormoc City",
      province: "Leyte",
    }),
    /failed[_-]precondition/i,
  );
  await assert.rejects(
    () => callFunction("updateRoleAccountProfile", provider, {
      ownerFirstName: "Updated",
      ownerLastName: "Provider",
      businessName: "Updated Account Catering",
      businessEmail: "updated-account@feasta.test",
      businessPhone: "+639172222222",
      description: "An unreviewed public profile change through Account Settings.",
      address: "Updated address",
      city: "Ormoc City",
      province: "Leyte",
    }),
    /failed[_-]precondition/i,
  );
  await db.collection("providerRequests").doc("active-account-obligation").set({
    providerId: "acceptance-account-provider",
    customerId: "customer-obligation",
    mainEventId: "event-obligation",
    status: "confirmed",
    createdAt: new Date(),
  });
  await assert.rejects(
    () => callFunction("deactivateProviderAccount", provider, {
      reason: "Should be blocked",
    }),
    /failed[_-]precondition/i,
  );
  await db.collection("providerRequests")
    .doc("active-account-obligation")
    .update({status: "completed"});
  await callFunction("deactivateProviderAccount", provider, {
    reason: "No active obligations",
  });
  assert.equal(
    (await db.collection("providers")
      .doc("acceptance-account-provider").get()).data()?.isActive,
    false,
  );
  await signOut(auth);

  const admin = await createUser("acceptance.account.admin@feasta.test");
  await writeUserProfile(admin.uid, "admin");
  await callFunction("updateRoleAccountProfile", admin, {
    firstName: "Updated",
    lastName: "Administrator",
  });
  assert.equal(
    (await db.collection("users").doc(admin.uid).get()).data()?.firstName,
    "Updated",
  );
  await assert.rejects(
    () => callFunction("updateRoleAccountProfile", admin, {
      firstName: "Unsafe",
      lastName: "Admin",
      role: "super_admin",
    }),
    /invalid[_-]argument/i,
  );
  await assert.rejects(
    () => callFunction("deactivateProviderAccount", admin, {}),
    /permission[_-]denied/i,
  );
  const adminSession = await createWebSession(
    await admin.getIdToken(true),
    "/admin/account",
    "admin",
  );
  await callFunction("revokeAllAccountSessions", admin, {});
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const revokedAccess = await webGet("/admin/account", adminSession.cookie);
  assert.equal(revokedAccess.status, 307);
  await assertInvalidSessionIsCleared(revokedAccess, adminSession.cookie);
  await signOut(auth);
}

async function testWebSessionsAndRoles() {
  const anonymousAdmin = await webGet("/admin", "");
  assert.equal(anonymousAdmin.status, 307);
  assert.match(
    anonymousAdmin.headers.get("location") ?? "",
    /\/admin-login\?next=%2Fadmin$/,
  );
  const anonymousProvider = await webGet("/provider", "");
  assert.equal(anonymousProvider.status, 307);
  assert.match(
    anonymousProvider.headers.get("location") ?? "",
    /\/provider-login\?next=%2Fprovider$/,
  );
  assert.equal((await webGet("/provider-login", "")).status, 200);
  assert.equal((await webGet("/provider-register", "")).status, 200);
  assert.equal((await webGet("/admin-login", "")).status, 200);
  assert.notEqual((await webGet("/admin-register", "")).status, 200);
  assert.equal((await webGet("/register", "")).status, 200);
  assert.equal((await webGet("/forgot-password", "")).status, 200);

  const unverified = await createCustomer("acceptance.web.unverified@feasta.test");
  const unverifiedSession = await createWebSession(await unverified.getIdToken(true));
  const verificationGate = await webGet("/customer", unverifiedSession.cookie);
  assert.equal(verificationGate.status, 307);
  assert.match(verificationGate.headers.get("location") ?? "", /\/verify-email$/);
  await signOut(auth);

  const customer = await createVerifiedCustomer("acceptance.web.customer@feasta.test");
  const customerSession = await createWebSession(
    await customer.getIdToken(true),
    "/customer/bookings",
    "customer",
  );
  assert.match(customerSession.cookie, /feasta_session=/);
  assert.match(customerSession.cookie, /HttpOnly/i);
  assert.match(customerSession.cookie, /SameSite=Lax/i);
  assert.equal(customerSession.body.destination, "/customer/bookings");
  assert.equal((await webGet("/customer", customerSession.cookie)).status, 200);
  assert.equal((await webGet("/customer/account", customerSession.cookie)).status, 200);
  const customerAtProviderPortal = await postSession(
    await customer.getIdToken(true),
    await getCsrf(),
    "/provider",
    "provider",
  );
  assert.equal(customerAtProviderPortal.status, 403);
  assert.equal(
    (await customerAtProviderPortal.json()).reason,
    "unauthorized_role",
  );
  assert.equal((await webGet("/admin", customerSession.cookie)).status, 307);
  const customerAtAdminPortal = await postSession(
    await customer.getIdToken(true),
    await getCsrf(),
    "/admin",
    "admin",
  );
  assert.equal(customerAtAdminPortal.status, 403);
  assert.equal(
    (await customerAtAdminPortal.json()).reason,
    "unauthorized_role",
  );
  const wrongRole = await webGet("/provider", customerSession.cookie);
  assert.equal(wrongRole.status, 307);
  assert.match(wrongRole.headers.get("location") ?? "", /\/unauthorized$/);

  const logout = await fetch(`${webUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      cookie: customerSession.cookie,
      origin: webUrl,
      "x-feasta-csrf": customerSession.csrf.token,
    },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  assert.equal((await webGet("/customer", customerSession.cookie)).status, 307);
  await signOut(auth);

  const throttledEmail = "acceptance.web.throttled-admin@feasta.test";
  const adminAttemptCsrf = await getCsrf();
  let adminRateLimited;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await postAdminAttempt(throttledEmail, adminAttemptCsrf);
    if (response.status === 429) {
      adminRateLimited = response;
      break;
    }
    assert.equal(response.status, 204);
  }
  assert.ok(adminRateLimited, "Admin account rate limit was not enforced.");
  assert.ok(Number(adminRateLimited.headers.get("retry-after")) > 0);
  await clearAdminLoginRateLimits();
  assert.equal(
    (await postAdminAttempt(throttledEmail, await getCsrf())).status,
    204,
    "Admin login should recover after the temporary throttle window clears.",
  );

  const adminUser = await createUser("acceptance.web.admin@feasta.test");
  await writeUserProfile(adminUser.uid, "admin");
  const adminSession = await createWebSession(
    await adminUser.getIdToken(true),
    "https://evil.example/steal",
    "admin",
  );
  assert.equal(adminSession.body.destination, "/admin");
  assert.equal((await webGet("/admin", adminSession.cookie)).status, 200);
  assert.equal((await webGet("/admin/account", adminSession.cookie)).status, 200);
  assert.equal((await webGet("/customer", adminSession.cookie)).status, 307);
  const adminLogout = await fetch(`${webUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      cookie: adminSession.cookie,
      origin: webUrl,
      "x-feasta-csrf": adminSession.csrf.token,
    },
  });
  assert.equal(adminLogout.status, 200);
  assert.match(adminLogout.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  await signOut(auth);

  await assertRejectedAdminState("blocked", {
    isBlocked: true,
    accountStatus: "blocked",
  });
  await assertRejectedAdminState("deactivated", {
    isActive: false,
    accountStatus: "pending_deletion",
  });
  const disabledAdmin = await createUser(
    "acceptance.web.admin.disabled@feasta.test",
  );
  await writeUserProfile(disabledAdmin.uid, "admin");
  const disabledAdminSession = await createWebSession(
    await disabledAdmin.getIdToken(true),
    "/admin",
    "admin",
  );
  await adminAuth.updateUser(disabledAdmin.uid, {disabled: true});
  const disabledAdminAccess = await webGet(
    "/admin",
    disabledAdminSession.cookie,
  );
  assert.equal(disabledAdminAccess.status, 307);
  await assertInvalidSessionIsCleared(
    disabledAdminAccess,
    disabledAdminSession.cookie,
  );
  await signOut(auth);
  const revokedAdmin = await createUser(
    "acceptance.web.admin.revoked@feasta.test",
  );
  await writeUserProfile(revokedAdmin.uid, "admin");
  const revokedAdminSession = await createWebSession(
    await revokedAdmin.getIdToken(true),
    "/admin",
    "admin",
  );
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await adminAuth.revokeRefreshTokens(revokedAdmin.uid);
  const revokedAdminAccess = await webGet(
    "/admin",
    revokedAdminSession.cookie,
  );
  assert.equal(revokedAdminAccess.status, 307);
  await assertInvalidSessionIsCleared(
    revokedAdminAccess,
    revokedAdminSession.cookie,
  );
  await signOut(auth);
  await clearWebSessionRateLimits();

  const setupProvider = await createUser("acceptance.web.provider.setup@feasta.test");
  await writeUserProfile(setupProvider.uid, "provider");
  await adminAuth.updateUser(setupProvider.uid, {emailVerified: true});
  await setupProvider.reload();
  const setupSession = await createWebSession(
    await setupProvider.getIdToken(true),
    "/provider",
    "provider",
  );
  const setupRedirect = await webGet("/provider", setupSession.cookie);
  assert.equal(setupRedirect.status, 307);
  assert.match(
    setupRedirect.headers.get("location") ?? "",
    /\/provider-verify-phone$/,
  );
  const onboardingRedirect = await webGet(
    "/provider/onboarding",
    setupSession.cookie,
  );
  assert.equal(onboardingRedirect.status, 307);
  assert.match(
    onboardingRedirect.headers.get("location") ?? "",
    /\/provider-verify-phone$/,
  );
  assert.equal(
    (
      await webGet(
        "/provider/onboarding/owner",
        setupSession.cookie,
      )
    ).status,
    307,
  );
  assert.equal((await webGet("/provider/account", setupSession.cookie)).status, 307);
  await signOut(auth);

  const providerUser = await createUser("acceptance.web.provider@feasta.test");
  await writeUserProfile(providerUser.uid, "provider");
  await db.collection("users").doc(providerUser.uid).update({
    providerId: "acceptance-provider",
  });
  await db.collection("providers").doc("acceptance-provider").set({
    ownerId: providerUser.uid,
    providerServiceType: "catering",
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
  });
  await db.collection("providerVerifications").doc("acceptance-provider-verification").set({
    providerId: "acceptance-provider",
    ownerId: providerUser.uid,
    status: "approved",
    remarks: null,
    rejectionReason: null,
    resubmissionReason: null,
    suspensionReason: null,
  });
  const unverifiedProviderSession = await createWebSession(
    await providerUser.getIdToken(true),
    "/provider",
    "provider",
  );
  const unverifiedProviderAccess = await webGet(
    "/provider",
    unverifiedProviderSession.cookie,
  );
  assert.equal(unverifiedProviderAccess.status, 307);
  assert.match(
    unverifiedProviderAccess.headers.get("location") ?? "",
    /\/provider-verify-email$/,
  );
  const providerPhone = "+639000008877";
  await adminAuth.updateUser(providerUser.uid, {
    emailVerified: true,
    phoneNumber: providerPhone,
  });
  await db.collection("users").doc(providerUser.uid).update({
    isPhoneVerified: true,
    phoneNumber: providerPhone,
  });
  await providerUser.reload();
  const providerSession = await createWebSession(
    await providerUser.getIdToken(true),
    "/provider",
    "provider",
  );
  assert.equal((await webGet("/provider", providerSession.cookie)).status, 200);
  assert.equal((await webGet("/provider/account", providerSession.cookie)).status, 200);
  assert.equal((await webGet("/provider/packages", providerSession.cookie)).status, 200);
  assert.equal((await webGet("/admin", providerSession.cookie)).status, 307);

  await assertProviderState(
    "draft",
    {isActive: false, isSuspended: false},
    providerSession.cookie,
    "/provider/verification",
  );
  await assertProviderState(
    "submitted",
    {isActive: false, isSuspended: false},
    providerSession.cookie,
    "/provider/status",
  );
  await assertProviderState(
    "under_review",
    {isActive: false, isSuspended: false},
    providerSession.cookie,
    "/provider/status",
  );
  await assertProviderState(
    "resubmission_required",
    {isActive: false, isSuspended: false},
    providerSession.cookie,
    "/provider/verification",
  );
  await assertProviderState(
    "rejected",
    {isActive: false, isSuspended: false},
    providerSession.cookie,
    "/provider/status",
  );
  await assertProviderState(
    "suspended",
    {isActive: false, isSuspended: true},
    providerSession.cookie,
    "/provider/status",
  );
  await db.collection("providers").doc("acceptance-provider").update({
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
  });
  await db.collection("providerVerifications")
    .doc("acceptance-provider-verification")
    .update({status: "approved"});
  await signOut(auth);
  await clearWebSessionRateLimits();

  const blocked = await createCustomer("acceptance.web.blocked@feasta.test");
  const blockedToken = await blocked.getIdToken(true);
  await db.collection("users").doc(blocked.uid).update({isBlocked: true});
  const blockedResponse = await postSession(blockedToken, await getCsrf());
  assert.equal(blockedResponse.status, 403);
  assert.equal((await blockedResponse.json()).reason, "account_blocked");
  await signOut(auth);

  const disabled = await createCustomer("acceptance.web.disabled@feasta.test");
  const disabledSession = await createWebSession(await disabled.getIdToken(true));
  await adminAuth.updateUser(disabled.uid, {disabled: true});
  const disabledAccess = await webGet("/customer", disabledSession.cookie);
  assert.equal(disabledAccess.status, 307);
  await assertInvalidSessionIsCleared(disabledAccess, disabledSession.cookie);

  const missingProfile = await createUser("acceptance.web.missing@feasta.test");
  assert.equal((await postSession(
    await missingProfile.getIdToken(true),
    await getCsrf(),
  )).status, 403);
  await signOut(auth);

  const deactivated = await createCustomer("acceptance.web.deactivated@feasta.test");
  const deactivatedToken = await deactivated.getIdToken(true);
  await db.collection("users").doc(deactivated.uid).update({
    accountStatus: "pending_deletion",
    isActive: false,
  });
  const deactivatedResponse = await postSession(
    deactivatedToken,
    await getCsrf(),
  );
  assert.equal(deactivatedResponse.status, 403);
  assert.equal((await deactivatedResponse.json()).reason, "account_disabled");
  await signOut(auth);

  const revoked = await createCustomer("acceptance.web.revoked@feasta.test");
  const revokedSession = await createWebSession(await revoked.getIdToken(true));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await adminAuth.revokeRefreshTokens(revoked.uid);
  const revokedAccess = await webGet("/customer", revokedSession.cookie);
  assert.equal(revokedAccess.status, 307);
  await assertInvalidSessionIsCleared(revokedAccess, revokedSession.cookie);

  const malformedCookie = "feasta_session=malformed";
  const malformedAccess = await webGet("/customer", malformedCookie);
  assert.equal(malformedAccess.status, 307);
  await assertInvalidSessionIsCleared(malformedAccess, malformedCookie);

  const csrf = await getCsrf();
  const invalidCsrf = await fetch(`${webUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: webUrl,
      cookie: csrf.cookie,
      "x-feasta-csrf": "invalid",
    },
    body: JSON.stringify({idToken: blockedToken}),
  });
  assert.equal(invalidCsrf.status, 403);
  const badOrigin = await fetch(`${webUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      cookie: csrf.cookie,
      "x-feasta-csrf": csrf.token,
    },
  });
  assert.equal(badOrigin.status, 403);

  const authAttemptCsrf = await getCsrf();
  const crossOriginAttempt = await fetch(`${webUrl}/api/auth/attempt`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
      cookie: authAttemptCsrf.cookie,
      "x-feasta-csrf": authAttemptCsrf.token,
    },
    body: JSON.stringify({
      action: "password_reset",
      identifier: "acceptance.customer@feasta.test",
    }),
  });
  assert.equal(crossOriginAttempt.status, 403);

  const blockedAttempt = await postAuthAttempt(
    {
      action: "email_verification_resend",
      idToken: blockedToken,
    },
    authAttemptCsrf,
  );
  assert.equal(blockedAttempt.status, 401);

  let resetRateLimited;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const response = await postAuthAttempt(
      {
        action: "password_reset",
        identifier: "rapid-reset@feasta.test",
      },
      authAttemptCsrf,
    );
    if (response.status === 429) {
      resetRateLimited = response;
      break;
    }
    assert.equal(response.status, 204);
  }
  assert.ok(resetRateLimited, "Password-reset preflight was not rate limited.");
  assert.ok(Number(resetRateLimited.headers.get("retry-after")) > 0);

  const resendUser = await createCustomer(
    "acceptance.web.rapid-resend@feasta.test",
  );
  const resendToken = await resendUser.getIdToken(true);
  let resendRateLimited;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const response = await postAuthAttempt(
      {
        action: "email_verification_resend",
        idToken: resendToken,
      },
      authAttemptCsrf,
    );
    if (response.status === 429) {
      resendRateLimited = response;
      break;
    }
    assert.equal(response.status, 204);
  }
  assert.ok(
    resendRateLimited,
    "Verification-email preflight was not rate limited.",
  );
  await signOut(auth);

  const rateLimitCsrf = await getCsrf();
  let rateLimitedResponse;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await postSession("x".repeat(120), rateLimitCsrf);
    if (response.status === 429) {
      rateLimitedResponse = response;
      break;
    }
    assert.equal(response.status, 401);
  }
  assert.ok(rateLimitedResponse, "Session creation rate limit was not enforced.");
  assert.ok(Number(rateLimitedResponse.headers.get("retry-after")) > 0);
}

async function postAuthAttempt(body, csrf) {
  return fetch(`${webUrl}/api/auth/attempt`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: webUrl,
      cookie: csrf.cookie,
      "x-feasta-csrf": csrf.token,
    },
    body: JSON.stringify(body),
  });
}

async function assertInvalidSessionIsCleared(response, cookie) {
  const location = response.headers.get("location") ?? "";
  assert.match(location, /\/api\/auth\/session\/invalid/u);
  const invalidUrl = new URL(location, webUrl);
  const cleared = await fetch(invalidUrl, {
    headers: {cookie},
    redirect: "manual",
  });
  assert.equal(cleared.status, 307);
  assert.match(cleared.headers.get("set-cookie") ?? "", /Max-Age=0/i);
}

async function createCustomer(email) {
  const user = await createUser(email);
  await callFunction("ensureUserProfile", user, customerConsent);
  return user;
}

async function createVerifiedCustomer(email) {
  const user = await createCustomer(email);
  await adminAuth.updateUser(user.uid, {emailVerified: true});
  await user.reload();
  return user;
}

async function createUser(email) {
  return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

async function writeUserProfile(uid, role) {
  const now = new Date();
  await db.collection("users").doc(uid).set({
    uid, role, accountStatus: "active", isActive: true, isBlocked: false,
    providerId: null, createdAt: now, updatedAt: now,
  });
}

async function callFunction(name, user, data) {
  const token = await user.getIdToken(true);
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/${name}`,
    {method: "POST", headers: {"content-type": "application/json", authorization: `Bearer ${token}`}, body: JSON.stringify({data})},
  );
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`${body.error?.status ?? response.status}: ${body.error?.message ?? "Callable failed"}`);
  }
  return body.result;
}

async function oobCodes(email, requestType) {
  const response = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/oobCodes`);
  const body = await response.json();
  return (body.oobCodes ?? []).filter((item) => item.email === email && item.requestType === requestType);
}

async function signInWithEmulatorPhone(phoneNumber) {
  const sendResponse = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=fake-api-key`,
    {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({phoneNumber, recaptchaToken: "emulator-test"}),
    },
  );
  const sendBody = await sendResponse.json();
  assert.equal(sendResponse.status, 200, JSON.stringify(sendBody));
  assert.ok(sendBody.sessionInfo);

  const codesResponse = await fetch(
    `http://${authHost}/emulator/v1/projects/${projectId}/verificationCodes`,
  );
  const codesBody = await codesResponse.json();
  const verification = (codesBody.verificationCodes ?? []).find(
    (candidate) => candidate.sessionInfo === sendBody.sessionInfo,
  );
  assert.ok(verification?.code, "Auth Emulator did not expose the SMS code.");

  const signInResponse = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=fake-api-key`,
    {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        sessionInfo: sendBody.sessionInfo,
        code: verification.code,
      }),
    },
  );
  const signInBody = await signInResponse.json();
  assert.equal(signInResponse.status, 200, JSON.stringify(signInBody));
  return signInBody;
}

async function emailChangeCodes(newEmail) {
  const response = await fetch(
    `http://${authHost}/emulator/v1/projects/${projectId}/oobCodes`,
  );
  const body = await response.json();
  return (body.oobCodes ?? []).filter(
    (item) =>
      item.requestType === "VERIFY_AND_CHANGE_EMAIL" &&
      item.newEmail === newEmail,
  );
}

async function createWebSession(idToken, returnTo, expectedRole) {
  const csrf = await getCsrf();
  const response = await postSession(idToken, csrf, returnTo, expectedRole);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText);
  return {
    cookie: `${csrf.cookie}; ${response.headers.get("set-cookie") ?? ""}`,
    csrf,
    body,
  };
}

function postSession(idToken, csrf, returnTo, expectedRole) {
  return fetch(`${webUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: webUrl,
      cookie: csrf.cookie,
      "x-feasta-csrf": csrf.token,
    },
    body: JSON.stringify({idToken, returnTo, expectedRole}),
  });
}

function postAdminAttempt(email, csrf) {
  return fetch(`${webUrl}/api/auth/admin/attempt`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: webUrl,
      cookie: csrf.cookie,
      "x-feasta-csrf": csrf.token,
    },
    body: JSON.stringify({email}),
  });
}

async function assertProviderState(
  status,
  providerFlags,
  cookie,
  expectedLocation,
) {
  await db.collection("providers").doc("acceptance-provider").update({
    verificationStatus: status,
    ...providerFlags,
  });
  await db.collection("providerVerifications")
    .doc("acceptance-provider-verification")
    .update({status});
  const dashboard = await webGet("/provider", cookie);
  assert.equal(dashboard.status, 307);
  assert.match(
    dashboard.headers.get("location") ?? "",
    new RegExp(`${expectedLocation}$`),
  );
  assert.equal((await webGet(expectedLocation, cookie)).status, 200);
  const packages = await webGet("/provider/packages", cookie);
  assert.equal(packages.status, 200);
}

async function clearWebSessionRateLimits() {
  const snapshot = await db.collection("rateLimits")
    .where("scope", "==", "web.session.create")
    .get();
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

async function clearPhoneRegistrationRateLimits() {
  const snapshot = await db.collection("rateLimits").get();
  const batch = db.batch();
  snapshot.docs
    .filter((document) =>
      String(document.data().scope).startsWith(
        "web.auth.provider_phone_",
      ),
    )
    .forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

async function clearAdminLoginRateLimits() {
  const snapshot = await db.collection("rateLimits").get();
  const batch = db.batch();
  snapshot.docs
    .filter((document) =>
      String(document.data().scope).startsWith("web.admin.login."),
    )
    .forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

async function assertRejectedAdminState(label, profileChanges) {
  const user = await createUser(`acceptance.web.admin.${label}@feasta.test`);
  await writeUserProfile(user.uid, "admin");
  const session = await createWebSession(
    await user.getIdToken(true),
    "/admin",
    "admin",
  );
  await db.collection("users").doc(user.uid).update(profileChanges);
  const access = await webGet("/admin", session.cookie);
  assert.equal(access.status, 307);
  await assertInvalidSessionIsCleared(access, session.cookie);
  await signOut(auth);
}

async function getCsrf() {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${webUrl}/api/auth/csrf`);
    lastStatus = response.status;
    if (response.status === 200) {
      const body = await response.json();
      return {
        token: body.token,
        cookie: response.headers.get("set-cookie") ?? "",
      };
    }
    if (response.status !== 404 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(lastStatus, 200, "CSRF endpoint did not become ready.");
  throw new Error("CSRF endpoint did not return a token.");
}

function webGet(path, cookie) {
  return fetch(`${webUrl}${path}`, {headers: {cookie}, redirect: "manual"});
}

async function fetchOk(url) {
  const response = await fetch(url);
  assert.ok(response.ok, `${url} returned ${response.status}`);
}

async function waitForWeb() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const response = await fetch(`${webUrl}/login`);
      if (response.ok) return;
    } catch {
      // Next.js is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js test server did not become ready.");
}
