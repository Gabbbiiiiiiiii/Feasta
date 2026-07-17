const assert = require("node:assert/strict");
const {getApps, initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");

const projectId = "feasta-catering-system";
const bucket = `${projectId}.firebasestorage.app`;
const authBase = "http://127.0.0.1:39099";
const firestoreBase = "http://127.0.0.1:38080";
const functionsBase =
  `http://127.0.0.1:35001/${projectId}/asia-southeast1`;

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:39099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:38080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:39199";

const app = getApps()[0] ?? initializeApp({projectId, storageBucket: bucket});
const db = getFirestore(app);

async function signUp(label) {
  const response = await fetch(
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        email: `${label}@example.test`,
        password: "ProviderPassword123!",
        returnSecureToken: true,
      }),
    },
  );
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return {idToken: body.idToken, uid: body.localId};
}

async function call(name, idToken, data) {
  const response = await fetch(`${functionsBase}/${name}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({data}),
  });
  return {response, body: await response.json()};
}

async function upload(path) {
  const bytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  await getStorage(app).bucket(bucket).file(path).save(bytes, {
    metadata: {contentType: "image/png"},
  });
}

async function attemptDirectDocumentWrite(idToken, verificationId) {
  return fetch(
    `${firestoreBase}/v1/projects/${projectId}/databases/(default)/documents/` +
      `providerVerifications/${verificationId}/documents/valid_id`,
    {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          documentType: {stringValue: "valid_id"},
          status: {stringValue: "pending"},
        },
      }),
    },
  );
}

async function main() {
  const provider = await signUp("provider-flow");
  const identity = await call("ensureProviderIdentity", provider.idToken, {
    firstName: "Pat",
    lastName: "Provider",
    phoneNumber: "+639171234567",
  });
  assert.equal(identity.response.ok, true, JSON.stringify(identity.body));

  const registrationData = {
    ownerFirstName: "Pat",
    ownerLastName: "Provider",
    businessName: "Pat's Test Catering",
    businessEmail: "  PAT.CATERING@EXAMPLE.TEST ",
    businessPhone: "+639171234567",
    description: "A complete test catering business description.",
    address: "123 Test Street",
    city: "Ormoc City",
    province: "Leyte",
    providerServiceType: "catering",
    providerCategory: "Caterer",
    serviceAreas: ["Ormoc City"],
    eventTypesSupported: ["Wedding"],
  };
  const first = await call("registerProvider", provider.idToken, registrationData);
  assert.equal(first.response.ok, true, JSON.stringify(first.body));
  assert.equal(first.body.result.created, true);
  assert.equal(first.body.result.providerId, provider.uid);
  assert.equal(first.body.result.verificationId, provider.uid);

  const second = await call("registerProvider", provider.idToken, registrationData);
  assert.equal(second.response.ok, true, JSON.stringify(second.body));
  assert.equal(second.body.result.created, false);

  const invalidLink = await signUp("provider-invalid-link");
  assert.equal((await call("ensureProviderIdentity", invalidLink.idToken, {
    firstName: "Invalid",
    lastName: "Link",
    phoneNumber: "+639181234567",
  })).response.ok, true);
  await db.collection("users").doc(invalidLink.uid).update({
    providerId: "provider-owned-by-someone-else",
  });
  const invalidRegistration = await call(
    "registerProvider",
    invalidLink.idToken,
    {
      ...registrationData,
      businessName: "Invalid Link Catering",
      businessEmail: "invalid-link@example.test",
    },
  );
  assert.equal(invalidRegistration.response.ok, false);
  assert.equal((await db.collection("providers").doc(invalidLink.uid).get())
    .exists, false);

  const providerRef = db.collection("providers").doc(provider.uid);
  const verificationRef = db.collection("providerVerifications").doc(provider.uid);
  assert.equal((await providerRef.get()).data().businessEmail,
    "pat.catering@example.test");
  assert.equal((await providerRef.get()).data().verificationStatus, "draft");
  assert.equal((await providerRef.get()).data().isActive, false);

  const incomplete = await signUp("provider-incomplete-documents");
  assert.equal((await call("ensureProviderIdentity", incomplete.idToken, {
    firstName: "Incomplete",
    lastName: "Documents",
    phoneNumber: "+639191234567",
  })).response.ok, true);
  const incompleteRegistration = await call(
    "registerProvider",
    incomplete.idToken,
    {
      ...registrationData,
      ownerFirstName: "Incomplete",
      ownerLastName: "Documents",
      businessName: "Incomplete Documents Catering",
      businessEmail: "incomplete-documents@example.test",
    },
  );
  assert.equal(incompleteRegistration.response.ok, true,
    JSON.stringify(incompleteRegistration.body));
  const incompletePath =
    `providers/${incomplete.uid}/verification/business_permit/test.png`;
  await upload(incompletePath);
  const incompleteDocument = await call(
    "registerVerificationDocument",
    incomplete.idToken,
    {
      verificationId: incomplete.uid,
      documentType: "business_permit",
      displayName: "Business permit",
      storagePath: incompletePath,
      originalFileName: "test.png",
    },
  );
  assert.equal(incompleteDocument.response.ok, true,
    JSON.stringify(incompleteDocument.body));
  const incompleteSubmission = await call(
    "submitProviderVerification",
    incomplete.idToken,
    {providerId: incomplete.uid},
  );
  assert.equal(incompleteSubmission.response.ok, false);
  assert.deepEqual(
    incompleteSubmission.body.error.details.missingDocumentTypes,
    ["valid_id"],
  );
  assert.equal((await db.collection("users").doc(provider.uid).get())
    .data().providerId, provider.uid);

  const denied = await attemptDirectDocumentWrite(
    provider.idToken,
    provider.uid,
  );
  assert.equal(denied.ok, false, "client wrote trusted document metadata");

  for (const documentType of ["business_permit", "valid_id"]) {
    const storagePath =
      `providers/${provider.uid}/verification/${documentType}/test.png`;
    await upload(storagePath);
    const registered = await call(
      "registerVerificationDocument",
      provider.idToken,
      {
        verificationId: provider.uid,
        documentType,
        displayName: documentType,
        storagePath,
        originalFileName: "test.png",
      },
    );
    assert.equal(registered.response.ok, true, JSON.stringify(registered.body));
    assert.equal(registered.body.result.isRequired, true);
  }

  const submitted = await call(
    "submitProviderVerification",
    provider.idToken,
    {providerId: provider.uid},
  );
  assert.equal(submitted.response.ok, true, JSON.stringify(submitted.body));
  assert.equal((await verificationRef.get()).data().status, "submitted");
  assert.equal((await providerRef.get()).data().isActive, false);

  const admin = await signUp("provider-admin");
  await db.collection("users").doc(admin.uid).set({
    uid: admin.uid,
    role: "admin",
    accountStatus: "active",
    isActive: true,
    isBlocked: false,
  });

  const underReview = await call(
    "reviewProviderVerification",
    admin.idToken,
    {verificationId: provider.uid, action: "start_review"},
  );
  assert.equal(underReview.response.ok, true, JSON.stringify(underReview.body));

  const approved = await call(
    "reviewProviderVerification",
    admin.idToken,
    {verificationId: provider.uid, action: "approve", reason: "Complete."},
  );
  assert.equal(approved.response.ok, true, JSON.stringify(approved.body));
  assert.equal((await providerRef.get()).data().isActive, true);
  assert.equal((await providerRef.get()).data().isSuspended, false);

  const suspended = await call(
    "reviewProviderVerification",
    admin.idToken,
    {
      verificationId: provider.uid,
      action: "suspend",
      reason: "Compliance hold.",
    },
  );
  assert.equal(suspended.response.ok, true, JSON.stringify(suspended.body));
  assert.equal((await providerRef.get()).data().verificationStatus, "suspended");
  assert.equal((await providerRef.get()).data().isActive, false);
  assert.equal((await providerRef.get()).data().isSuspended, true);

  const notifications = await db.collection("notifications")
    .where("userId", "==", provider.uid).get();
  assert.equal(notifications.size, 3);
  const audits = await db.collection("adminLogs")
    .where("actorId", "==", provider.uid).get();
  assert.equal(audits.size >= 4, true);

  console.log("Provider emulator integration assertions passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
