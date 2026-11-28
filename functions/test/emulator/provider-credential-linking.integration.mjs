import assert from "node:assert/strict";

import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import {getAuth as getAdminAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {deleteApp, initializeApp} from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  linkWithCredential,
  sendEmailVerification,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3";
const authHost = requiredEnv("FIREBASE_AUTH_EMULATOR_HOST");
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:55001";
const authBase = `http://${authHost}`;
const functionsBase = `http://${functionsHost}/${projectId}/asia-southeast1`;
const password = "FeastaPhaseC!2026";

const clientApp = initializeApp(
  {apiKey: "fake-api-key", projectId},
  `phase-c-client-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, authBase, {disableWarnings: true});
const adminApp = initializeAdminApp(
  {projectId},
  `phase-c-admin-${Date.now()}`,
);
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);

try {
  await proveSameUidCredentialLink();
  await proveCollisionDoesNotCreateIdentity();
  console.log("Provider Phase C credential-linking emulator assertions passed.");
} finally {
  await signOut(auth).catch(() => undefined);
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}

async function proveSameUidCredentialLink() {
  const phoneNumber = "+639000006301";
  const email = "phase-c.same-uid@feasta.test";
  const signedIn = await signInWithEmulatorPhoneUser(phoneNumber);
  const originalUid = signedIn.user.uid;

  const linked = await linkWithCredential(
    signedIn.user,
    EmailAuthProvider.credential(email, password),
  );
  assert.equal(linked.user.uid, originalUid);
  assert.equal(auth.currentUser?.uid, originalUid);
  assert.ok(hasProvider(linked.user.providerData, "phone"));
  assert.ok(hasProvider(linked.user.providerData, "password"));
  assert.equal(linked.user.email, email);
  assert.equal(linked.user.emailVerified, false);

  const identityInput = {
    firstName: "Phase C",
    lastName: "Same UID",
    email,
    phoneNumber,
    acceptedTerms: true,
    acceptedPrivacy: true,
    termsPolicyVersion: "phase-c-test-terms",
    privacyPolicyVersion: "phase-c-test-privacy",
  };
  const first = await callFunction("ensureProviderIdentity", linked.user, identityInput);
  const replay = await callFunction("ensureProviderIdentity", linked.user, identityInput);
  assert.equal(first.created, true);
  assert.equal(replay.created, false);

  const authUser = await adminAuth.getUser(originalUid);
  assert.equal(authUser.uid, originalUid);
  assert.equal(authUser.phoneNumber, phoneNumber);
  assert.equal(authUser.email, email);
  assert.equal(authUser.emailVerified, false);
  assert.ok(hasProvider(authUser.providerData, "phone"));
  assert.ok(hasProvider(authUser.providerData, "password"));

  const userSnapshot = await db.collection("users").doc(originalUid).get();
  assert.equal(userSnapshot.data()?.role, "provider");
  assert.equal(userSnapshot.data()?.isPhoneVerified, true);
  assert.equal(userSnapshot.data()?.isEmailVerified, false);
  assert.equal(userSnapshot.data()?.email, email);
  assert.equal(
    (await db.collection("providers").where("ownerId", "==", originalUid).get())
      .empty,
    true,
  );

  await sendEmailVerification(linked.user);
  const verificationCodes = await oobCodes(email, "VERIFY_EMAIL");
  assert.ok(verificationCodes.length >= 1);
  await linked.user.reload();
  assert.equal(linked.user.emailVerified, false);

  const matchingAuthUsers = (await adminAuth.listUsers()).users.filter(
    (candidate) => candidate.uid === originalUid || candidate.email === email,
  );
  assert.equal(matchingAuthUsers.length, 1);
  await signOut(auth);
}

async function proveCollisionDoesNotCreateIdentity() {
  const collisionEmail = "phase-c.collision@feasta.test";
  const existing = await createUserWithEmailAndPassword(
    auth,
    collisionEmail,
    password,
  );
  const existingUid = existing.user.uid;
  await signOut(auth);

  const phoneUser = await signInWithEmulatorPhoneUser("+639000006302");
  const phoneUid = phoneUser.user.uid;
  await assert.rejects(
    () => linkWithCredential(
      phoneUser.user,
      EmailAuthProvider.credential(collisionEmail, password),
    ),
    /email-already-in-use|credential-already-in-use/iu,
  );
  assert.notEqual(phoneUid, existingUid);
  assert.equal(auth.currentUser?.uid, phoneUid);
  assert.equal(hasProvider(phoneUser.user.providerData, "password"), false);
  assert.equal((await db.collection("users").doc(phoneUid).get()).exists, false);
  assert.equal(
    (await db.collection("providers").where("ownerId", "==", phoneUid).get())
      .empty,
    true,
  );
  assert.equal((await adminAuth.getUser(existingUid)).email, collisionEmail);
}

async function signInWithEmulatorPhoneUser(phoneNumber) {
  const sendResponse = await fetch(
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=fake-api-key`,
    {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({phoneNumber, recaptchaToken: "emulator-test"}),
    },
  );
  const sendBody = await sendResponse.json();
  assert.equal(sendResponse.status, 200, JSON.stringify(sendBody));
  const codesResponse = await fetch(
    `${authBase}/emulator/v1/projects/${projectId}/verificationCodes`,
  );
  const codesBody = await codesResponse.json();
  const verification = (codesBody.verificationCodes ?? []).find(
    (candidate) => candidate.sessionInfo === sendBody.sessionInfo,
  );
  assert.ok(verification?.code, "Auth Emulator did not expose the SMS code.");
  const signInResponse = await fetch(
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=fake-api-key`,
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
  const authUser = await adminAuth.getUser(signInBody.localId);
  assert.ok(hasProvider(authUser.providerData, "phone"));
  const customToken = await adminAuth.createCustomToken(signInBody.localId);
  return signInWithCustomToken(auth, customToken);
}

async function callFunction(name, user, data) {
  const idToken = await user.getIdToken(true);
  const response = await fetch(`${functionsBase}/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({data}),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body.result;
}

async function oobCodes(email, requestType) {
  const response = await fetch(
    `${authBase}/emulator/v1/projects/${projectId}/oobCodes`,
  );
  const body = await response.json();
  return (body.oobCodes ?? []).filter(
    (item) => item.email === email && item.requestType === requestType,
  );
}

function hasProvider(providerData, providerId) {
  return providerData.some((provider) => provider.providerId === providerId);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} is required.`);
  return value;
}
