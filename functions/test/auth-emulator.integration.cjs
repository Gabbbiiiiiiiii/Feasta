const assert = require("node:assert/strict");
const {getApps, initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

const projectId = "feasta-catering-system";
const authBase = "http://127.0.0.1:39099";
const functionsBase =
  `http://127.0.0.1:35001/${projectId}/asia-southeast1`;

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:39099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:38080";

const app = getApps()[0] ?? initializeApp({projectId});
const db = getFirestore(app);

async function googleSignIn(subject) {
  const fakeIdToken = JSON.stringify({
    sub: subject,
    email: `${subject}@example.test`,
    email_verified: true,
    name: "Google Customer",
  });
  const response = await fetch(
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-key`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        requestUri: "http://localhost",
        postBody:
          `id_token=${encodeURIComponent(fakeIdToken)}` +
          "&providerId=google.com",
        returnSecureToken: true,
      }),
    },
  );
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  assert.equal(typeof body.idToken, "string");
  assert.equal(typeof body.localId, "string");
  return {idToken: body.idToken, uid: body.localId};
}

async function callEnsure(idToken, data = {}) {
  const response = await fetch(`${functionsBase}/ensureUserProfile`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({data}),
  });
  return {response, body: await response.json()};
}

async function attemptClientRoleChange(idToken, uid) {
  return fetch(
    "http://127.0.0.1:38080/v1/projects/" +
      `${projectId}/databases/(default)/documents/users/${uid}` +
      "?updateMask.fieldPaths=role",
    {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({fields: {role: {stringValue: "admin"}}}),
    },
  );
}

async function main() {
  const google = await googleSignIn("google-customer-idempotent");
  const first = await callEnsure(google.idToken, {
    firstName: "Google",
    lastName: "Customer",
  });
  assert.equal(first.response.ok, true, JSON.stringify(first.body));

  const userRef = db.collection("users").doc(google.uid);
  const customerRef = db.collection("customers").doc(google.uid);
  const firstUser = await userRef.get();
  const firstCustomer = await customerRef.get();
  assert.equal(firstUser.exists, true);
  assert.equal(firstCustomer.exists, true);
  assert.equal(firstUser.data().role, "customer");
  assert.equal(firstUser.data().accountStatus, "active");
  assert.equal(firstUser.data().providerId, null);
  const createdAt = firstUser.data().createdAt.toMillis();

  const second = await callEnsure(google.idToken);
  assert.equal(second.response.ok, true, JSON.stringify(second.body));
  assert.equal((await userRef.get()).data().createdAt.toMillis(), createdAt);

  const trustedWrite = await attemptClientRoleChange(
    google.idToken,
    google.uid,
  );
  assert.equal(trustedWrite.ok, false, "client changed its trusted role");

  await userRef.update({role: "provider"});
  const wrongRole = await callEnsure(google.idToken);
  assert.equal(wrongRole.response.ok, false);

  const blocked = await googleSignIn("google-customer-blocked");
  assert.equal((await callEnsure(blocked.idToken)).response.ok, true);
  await db.collection("users").doc(blocked.uid).update({isBlocked: true});
  assert.equal((await callEnsure(blocked.idToken)).response.ok, false);

  const disabled = await googleSignIn("google-customer-disabled");
  assert.equal((await callEnsure(disabled.idToken)).response.ok, true);
  await db.collection("users").doc(disabled.uid).update({
    accountStatus: "disabled",
    isActive: false,
  });
  assert.equal((await callEnsure(disabled.idToken)).response.ok, false);

  console.log("Auth emulator integration assertions passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
