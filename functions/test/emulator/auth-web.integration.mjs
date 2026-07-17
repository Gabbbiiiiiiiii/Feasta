import assert from "node:assert/strict";

import {deleteApp as deleteAdminApp, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getAuth as getAdminAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {deleteApp, initializeApp} from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST;
const webUrl = process.env.PHASE3_WEB_URL;
assert.ok(authHost && functionsHost && webUrl, "Acceptance emulator hosts are required.");

const password = "FeastaTest!2026";
const clientApp = initializeApp({apiKey: "fake-api-key", projectId}, `acceptance-${Date.now()}`);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${authHost}`, {disableWarnings: true});
const adminApp = initializeAdminApp({projectId}, `acceptance-admin-${Date.now()}`);
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);

try {
  await waitForWeb();
  await testEmailCustomerFlow();
  await testGoogleCustomerFlow();
  await testBlockedAndDisabledAccounts();
  await testWebSessionsAndRoles();
  console.log("Auth/web acceptance passed.");
} finally {
  await signOut(auth).catch(() => undefined);
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}

async function testEmailCustomerFlow() {
  const email = "acceptance.customer@feasta.test";
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const first = await callFunction("ensureUserProfile", credential.user, {
    firstName: "Acceptance", lastName: "Customer", phoneNumber: "+639171111111",
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
  const first = await callFunction("ensureUserProfile", signedIn.user, {});
  const replay = await callFunction("ensureUserProfile", signedIn.user, {});
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  const ref = db.collection("users").doc(signedIn.user.uid);
  const user = (await ref.get()).data();
  assert.equal(user?.role, "customer");
  assert.equal(user?.providerId, null);
  assert.equal(user?.authProvider, "google.com");

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

async function testWebSessionsAndRoles() {
  const customer = await createCustomer("acceptance.web.customer@feasta.test");
  const customerSession = await createWebSession(await customer.getIdToken(true));
  assert.match(customerSession.cookie, /__session=/);
  assert.match(customerSession.cookie, /HttpOnly/i);
  assert.match(customerSession.cookie, /SameSite=Lax/i);
  assert.equal((await webGet("/customer", customerSession.cookie)).status, 200);
  const wrongRole = await webGet("/provider", customerSession.cookie);
  assert.equal(wrongRole.status, 307);
  assert.match(wrongRole.headers.get("location") ?? "", /\/unauthorized$/);

  const logout = await fetch(`${webUrl}/api/auth/logout`, {
    method: "POST", headers: {cookie: customerSession.cookie},
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  assert.equal((await webGet("/customer", customerSession.cookie)).status, 307);
  await signOut(auth);

  const adminUser = await createUser("acceptance.web.admin@feasta.test");
  await writeUserProfile(adminUser.uid, "admin");
  const adminSession = await createWebSession(await adminUser.getIdToken(true));
  assert.equal((await webGet("/admin", adminSession.cookie)).status, 200);
  assert.equal((await webGet("/customer", adminSession.cookie)).status, 307);
  await signOut(auth);

  const blocked = await createCustomer("acceptance.web.blocked@feasta.test");
  const blockedToken = await blocked.getIdToken(true);
  await db.collection("users").doc(blocked.uid).update({isBlocked: true});
  assert.equal((await postSession(blockedToken)).status, 401);
  await signOut(auth);
}

async function createCustomer(email) {
  const user = await createUser(email);
  await callFunction("ensureUserProfile", user, {});
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

async function createWebSession(idToken) {
  const response = await postSession(idToken);
  assert.equal(response.status, 200, await response.text());
  return {cookie: response.headers.get("set-cookie") ?? ""};
}

function postSession(idToken) {
  return fetch(`${webUrl}/api/auth/session`, {
    method: "POST",
    headers: {"content-type": "application/json", origin: webUrl},
    body: JSON.stringify({idToken}),
  });
}

function webGet(path, cookie) {
  return fetch(`${webUrl}${path}`, {headers: {cookie}, redirect: "manual"});
}

async function fetchOk(url) {
  const response = await fetch(url);
  assert.ok(response.ok, `${url} returned ${response.status}`);
}

async function waitForWeb() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
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
