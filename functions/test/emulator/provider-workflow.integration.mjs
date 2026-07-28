import assert from "node:assert/strict";

import {deleteApp as deleteAdminApp, initializeApp as initializeAdminApp} from "firebase-admin/app";
import {getAuth as getAdminAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {deleteApp, initializeApp} from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  getDocs,
  getFirestore as getClientFirestore,
  query,
  where,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getBytes,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-feasta-phase3";
const authHost = requiredEnv("FIREBASE_AUTH_EMULATOR_HOST");
const functionsHost = requiredEnv("FIREBASE_FUNCTIONS_EMULATOR_HOST");
const storageHost = requiredEnv("FIREBASE_STORAGE_EMULATOR_HOST");
const firestoreHost = requiredEnv("FIRESTORE_EMULATOR_HOST");
const password = "FeastaTest!2026";

const clientApp = initializeApp({
  apiKey: "fake-api-key",
  projectId,
  storageBucket: `${projectId}.appspot.com`,
}, `provider-acceptance-${Date.now()}`);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${authHost}`, {disableWarnings: true});
const storage = getStorage(clientApp);
const [storageHostname, storagePort] = storageHost.split(":");
connectStorageEmulator(storage, storageHostname, Number(storagePort));
const clientDb = getClientFirestore(clientApp);
const [firestoreHostname, firestorePort] = firestoreHost.split(":");
connectFirestoreEmulator(
  clientDb,
  firestoreHostname,
  Number(firestorePort),
);

const adminApp = initializeAdminApp({projectId}, `provider-admin-${Date.now()}`);
const db = getFirestore(adminApp);

try {
  await testHealthCheck();
  const workflow = await registerAndSubmitProvider();
  await reviewAndApproveProvider(workflow);
  await verifyStoragePrivacy(workflow);
  await verifyPublicVisibilityAndSuspension(workflow);
  await verifyRejectionAndResubmissionPaths();
  console.log("Provider/Storage acceptance passed.");
} finally {
  await signOut(auth).catch(() => undefined);
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}

async function testHealthCheck() {
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/healthCheck`,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.service, "feasta-functions");
}

async function registerAndSubmitProvider() {
  const email = "acceptance.provider@feasta.test";
  const providerUser = (await createUserWithEmailAndPassword(auth, email, password)).user;
  await getAdminAuth(adminApp).updateUser(providerUser.uid, {
    emailVerified: true,
  });
  await providerUser.getIdToken(true);
  const identity = await callFunction("ensureProviderIdentity", providerUser, {
    firstName: "Acceptance",
    lastName: "Provider",
    phoneNumber: "+639172222222",
  });
  assert.equal(identity.role, "provider");

  const registrationInput = {
    businessName: "Acceptance Catering Services",
    businessEmail: "  ACCEPTANCE.PROVIDER@FEASTA.TEST  ",
    businessPhone: "+639172222222",
    ownerFirstName: "Acceptance",
    ownerLastName: "Provider",
    description: "A complete provider profile used by the Phase 3 emulator acceptance workflow.",
    address: "123 Acceptance Street",
    city: "Ormoc City",
    province: "Leyte",
    providerServiceType: "catering",
    providerCategory: "catering_service",
    serviceCategories: ["catering_service"],
    serviceAreas: ["Ormoc City"],
    eventTypesSupported: ["wedding", "birthday"],
    minGuestsPerEvent: 10,
    maxGuestsPerEvent: 250,
    acceptsMultipleEventsPerDay: false,
    maxEventsPerDay: 1,
    availableStaffCount: 12,
    availableEquipmentCount: 30,
    operatingDays: ["monday", "tuesday", "wednesday"],
    bookingLeadTimeDays: 3,
    idempotencyKey: "provider-registration-primary",
  };
  await uploadProviderAssets(providerUser.uid);
  await completeOnboarding(providerUser, registrationInput);
  const created = await callFunction("registerProvider", providerUser, registrationInput);
  assert.equal(created.created, true);
  assert.equal(created.idempotentReplay, false);
  const replay = await callFunction("registerProvider", providerUser, registrationInput);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.providerId, created.providerId);
  const existing = await callFunction("registerProvider", providerUser, {
    ...registrationInput,
    idempotencyKey: "provider-registration-existing",
  });
  assert.equal(existing.created, false);
  assert.equal(existing.providerId, created.providerId);

  const providerRef = db.collection("providers").doc(created.providerId);
  const verificationRef = db.collection("providerVerifications").doc(created.verificationId);
  const provider = (await providerRef.get()).data();
  const verification = (await verificationRef.get()).data();
  const user = (await db.collection("users").doc(providerUser.uid).get()).data();
  assert.equal(user?.role, "provider");
  assert.equal(user?.providerId, created.providerId);
  assert.equal(provider?.ownerId, providerUser.uid);
  assert.equal(provider?.businessEmail, "acceptance.provider@feasta.test");
  assert.equal(provider?.verificationStatus, "draft");
  assert.equal(provider?.isActive, false);
  assert.equal(provider?.publiclyVisible, false);
  assert.equal(provider?.isFeatured, false);
  assert.equal(provider?.isSuspended, false);
  assert.equal(verification?.status, "draft");
  assert.equal(typeof provider?.createdAt?.toDate, "function");
  assert.equal(typeof provider?.updatedAt?.toDate, "function");
  assert.equal(typeof verification?.createdAt?.toDate, "function");
  assert.equal(typeof verification?.updatedAt?.toDate, "function");

  for (const documentType of [
    "business_permit",
    "dti_registration",
    "bir_registration",
    "valid_id",
    "sanitary_permit",
  ]) {
    const fileName = `${documentType}-${Date.now()}.pdf`;
    const storagePath = `providers/${created.providerId}/verification/${documentType}/${fileName}`;
    const object = ref(storage, storagePath);
    await uploadBytes(object, new Uint8Array([37, 80, 68, 70, 45, 49]), {
      contentType: "application/pdf",
    });
    assert.ok((await getBytes(object)).byteLength > 0);
    const registered = await callFunction("registerVerificationDocument", providerUser, {
      verificationId: created.verificationId,
      documentType,
      displayName: documentType.replaceAll("_", " "),
      storagePath,
      originalFileName: fileName,
    });
    assert.equal(registered.providerId, created.providerId);
    assert.equal(registered.isRequired, true);
  }

  const optionalPath =
    `providers/${created.providerId}/verification/other/optional-${Date.now()}.pdf`;
  const optionalObject = ref(storage, optionalPath);
  await uploadBytes(optionalObject, new Uint8Array([37, 80, 68, 70]), {
    contentType: "application/pdf",
  });
  await callFunction("registerVerificationDocument", providerUser, {
    verificationId: created.verificationId,
    documentType: "other",
    displayName: "Other supporting document",
    storagePath: optionalPath,
    originalFileName: "optional.pdf",
  });
  const removed = await callFunction(
    "removeVerificationDocument",
    providerUser,
    {
      verificationId: created.verificationId,
      documentType: "other",
    },
  );
  assert.equal(removed.removed, true);
  assert.equal((await verificationRef.collection("documents").doc("other")
    .get()).exists, false);
  await assert.rejects(() => getBytes(optionalObject), /object-not-found/i);

  const submitInput = {
    providerId: created.providerId,
    idempotencyKey: "verification-submit-primary",
  };
  const submitted = await callFunction("submitProviderVerification", providerUser, submitInput);
  assert.equal(submitted.status, "submitted");
  const submitReplay = await callFunction("submitProviderVerification", providerUser, submitInput);
  assert.equal(submitReplay.idempotentReplay, true);
  assert.equal((await providerRef.get()).data()?.isActive, false);
  await assert.rejects(
    () => callFunction("removeVerificationDocument", providerUser, {
      verificationId: created.verificationId,
      documentType: "valid_id",
    }),
    /FAILED_PRECONDITION/i,
  );

  const alternateReplay = await callFunction(
    "submitProviderVerification",
    providerUser,
    {
      providerId: created.providerId,
      idempotencyKey: "verification-submit-alternate-replay",
    },
  );
  assert.equal(alternateReplay.status, "submitted");

  return {
    providerUser,
    providerId: created.providerId,
    verificationId: created.verificationId,
    verificationPath: `providers/${created.providerId}/verification/valid_id`,
  };
}

async function completeOnboarding(providerUser, input) {
  const steps = [
    {
      ownerFirstName: input.ownerFirstName,
      ownerLastName: input.ownerLastName,
      ownerPhone: input.businessPhone,
    },
    {
      businessName: input.businessName,
      businessEmail: input.businessEmail.trim(),
      businessPhone: input.businessPhone,
      description: input.description,
      logoStoragePath: `providers/${providerUser.uid}/logo/logo.png`,
      coverStoragePath: `providers/${providerUser.uid}/cover/cover.webp`,
    },
    {
      providerServiceType: input.providerServiceType,
      providerCategory: input.providerCategory,
      serviceCategories: input.serviceCategories,
      eventTypesSupported: input.eventTypesSupported,
    },
    {
      address: input.address,
      city: input.city,
      province: input.province,
      serviceAreas: input.serviceAreas,
      maxServiceDistanceKm: 50,
    },
    {
      minGuestsPerEvent: input.minGuestsPerEvent,
      maxGuestsPerEvent: input.maxGuestsPerEvent,
      acceptsMultipleEventsPerDay: input.acceptsMultipleEventsPerDay,
      maxEventsPerDay: input.maxEventsPerDay,
      availableStaffCount: input.availableStaffCount,
      availableEquipmentCount: input.availableEquipmentCount,
      operatingDays: input.operatingDays,
      bookingLeadTimeDays: input.bookingLeadTimeDays,
      unavailableDates: [],
    },
    {
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsPolicyVersion: "phase7-test-terms",
      privacyPolicyVersion: "phase7-test-privacy",
    },
  ];
  for (const [index, data] of steps.entries()) {
    const result = await callFunction(
      "saveProviderOnboardingDraft",
      providerUser,
      {step: index + 1, data},
    );
    assert.equal(result.success, true);
  }
}

async function uploadProviderAssets(providerId) {
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  await uploadBytes(ref(storage, `providers/${providerId}/logo/logo.png`), image, {contentType: "image/png"});
  await uploadBytes(ref(storage, `providers/${providerId}/cover/cover.webp`), image, {contentType: "image/webp"});
  await assert.rejects(
    () => uploadBytes(ref(storage, `providers/${providerId}/verification/valid_id/invalid.txt`), image, {contentType: "text/plain"}),
    /storage\/unauthorized/i,
  );
  await assert.rejects(
    () => uploadBytes(ref(storage, `providers/${providerId}/verification/valid_id/oversized.pdf`), new Uint8Array(10 * 1024 * 1024 + 1), {contentType: "application/pdf"}),
    /storage\/unauthorized/i,
  );
}

async function reviewAndApproveProvider(workflow) {
  await signOut(auth);
  const adminUser = (await createUserWithEmailAndPassword(
    auth,
    "acceptance.provider.admin@feasta.test",
    password,
  )).user;
  await db.collection("users").doc(adminUser.uid).set({
    uid: adminUser.uid,
    role: "admin",
    accountStatus: "active",
    isActive: true,
    isBlocked: false,
    providerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const started = await callFunction("reviewProviderVerification", adminUser, {
    verificationId: workflow.verificationId,
    action: "start_review",
    idempotencyKey: "review-start-primary",
  });
  assert.equal(started.status, "under_review");
  const startReplay = await callFunction("reviewProviderVerification", adminUser, {
    verificationId: workflow.verificationId,
    action: "start_review",
    idempotencyKey: "review-start-primary",
  });
  assert.equal(startReplay.idempotentReplay, true);

  const approved = await callFunction("reviewProviderVerification", adminUser, {
    verificationId: workflow.verificationId,
    action: "approve",
    idempotencyKey: "review-approve-primary",
  });
  assert.equal(approved.status, "approved");
  const provider = (await db.collection("providers").doc(workflow.providerId).get()).data();
  const verification = (await db.collection("providerVerifications").doc(workflow.verificationId).get()).data();
  assert.equal(provider?.verificationStatus, "approved");
  assert.equal(provider?.isActive, true);
  assert.equal(provider?.isSuspended, false);
  assert.equal(verification?.status, "approved");
  assert.ok(verification?.approvedAt);
  const history = await db.collection("providerVerifications")
    .doc(workflow.verificationId)
    .collection("history")
    .get();
  assert.ok(history.size >= 8, "Structured verification history was not written.");
  assert.ok(history.docs.every((entry) =>
    typeof entry.data().auditLogId === "string" &&
    entry.data().auditLogId.length > 0
  ));

  const auditLogs = await db.collection("adminLogs")
    .where("targetId", "==", workflow.verificationId).get();
  const notifications = await db.collection("notifications")
    .where("userId", "==", workflow.providerUser.uid).get();
  assert.ok(auditLogs.size >= 4, "Provider workflow audit logs were not written.");
  assert.ok(notifications.size >= 2, "Provider review notifications were not written.");

  const adminFiles = await listVerificationFiles(workflow.providerId);
  assert.ok(adminFiles.length >= 2);
  for (const file of adminFiles) await getBytes(ref(storage, file));
  await signOut(auth);
}

async function verifyStoragePrivacy(workflow) {
  const customer = (await createUserWithEmailAndPassword(
    auth,
    "acceptance.storage.customer@feasta.test",
    password,
  )).user;
  await callFunction("ensureUserProfile", customer, {});
  await uploadBytes(
    ref(storage, `users/${customer.uid}/profile/avatar.png`),
    new Uint8Array([137, 80, 78, 71]),
    {contentType: "image/png"},
  );
  const verificationFiles = await listVerificationFiles(workflow.providerId);
  await assert.rejects(
    () => getBytes(ref(storage, verificationFiles[0])),
    /storage\/unauthorized/i,
  );
}

async function verifyPublicVisibilityAndSuspension(workflow) {
  console.log("Checking approved provider public discovery.");
  const publicProviders = query(
    collection(clientDb, "providers"),
    where("verificationStatus", "==", "approved"),
    where("publiclyVisible", "==", true),
    where("isActive", "==", true),
    where("isSuspended", "==", false),
    where("isDeleted", "==", false),
  );
  const publicProviderSnapshot = await getDocs(publicProviders);
  console.log("Approved provider public discovery query passed.");
  assert.equal(
    publicProviderSnapshot.docs.some(
      (document) => document.id === workflow.providerId,
    ),
    true,
    "Approved provider was not publicly discoverable.",
  );

  await db.collection("packages").doc("acceptance-published-package").set({
    providerId: workflow.providerId,
    name: "Acceptance Published Package",
    description: "Public package used by the provider visibility workflow.",
    eventType: "wedding",
    price: 25000,
    status: "published",
    isActive: true,
    isPublished: true,
    providerPubliclyVisible: true,
    publishedAt: new Date(),
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const publicPackages = query(
    collection(clientDb, "packages"),
    where("providerId", "==", workflow.providerId),
    where("isActive", "==", true),
    where("isPublished", "==", true),
    where("providerPubliclyVisible", "==", true),
    where("status", "==", "published"),
    where("isDeleted", "==", false),
  );
  console.log("Checking published package public discovery.");
  assert.equal((await getDocs(publicPackages)).size, 1);
  console.log("Published package public discovery query passed.");
  await assert.rejects(
    () => getDocs(query(
      collection(clientDb, "packages"),
      where("providerId", "==", workflow.providerId),
    )),
    /permission-denied/i,
    "A package query without publication constraints must be denied.",
  );

  await signOut(auth);
  const adminUser = await signInWithEmailAndPassword(
    auth,
    "acceptance.provider.admin@feasta.test",
    password,
  ).then((credential) => credential.user);
  const suspended = await callFunction(
    "reviewProviderVerification",
    adminUser,
    {
      verificationId: workflow.verificationId,
      action: "suspend",
      remarks: "Suspended by the acceptance visibility workflow.",
      idempotencyKey: "review-suspend-primary",
    },
  );
  assert.equal(suspended.status, "suspended");
  const provider = (await db.collection("providers")
    .doc(workflow.providerId).get()).data();
  assert.equal(provider?.publiclyVisible, false);
  assert.equal(provider?.isActive, false);

  await signOut(auth);
  await signInWithEmailAndPassword(
    auth,
    "acceptance.storage.customer@feasta.test",
    password,
  );
  assert.equal((await getDocs(publicProviders)).empty, true);
  assert.equal((await getDocs(publicPackages)).empty, true);
}

async function verifyRejectionAndResubmissionPaths() {
  await signOut(auth);
  const adminUser = await signInWithEmailAndPassword(
    auth,
    "acceptance.provider.admin@feasta.test",
    password,
  ).then((credential) => credential.user);

  for (const [suffix, action, expected] of [
    ["resubmission", "require_resubmission", "resubmission_required"],
    ["rejection", "reject", "rejected"],
  ]) {
    const ownerId = `acceptance-${suffix}-owner`;
    const providerId = `acceptance-${suffix}-provider`;
    const verificationId = `acceptance-${suffix}-verification`;
    await db.collection("users").doc(ownerId).set({
      uid: ownerId,
      role: "provider",
      accountStatus: "active",
      isActive: true,
      isBlocked: false,
      providerId,
    });
    await db.collection("providers").doc(providerId).set({
      ownerId,
      businessName: `Acceptance ${suffix} Provider`,
      description: "Complete provider profile for transition testing.",
      address: "123 Acceptance Street",
      city: "Ormoc City",
      province: "Leyte",
      providerServiceType: "catering",
      verificationStatus: "under_review",
      isActive: false,
      isSuspended: false,
      publiclyVisible: false,
      isDeleted: false,
    });
    await db.collection("providerVerifications").doc(verificationId).set({
      providerId,
      ownerId,
      status: "under_review",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await callFunction(
      "reviewProviderVerification",
      adminUser,
      {
        verificationId,
        action,
        remarks: `${suffix} requested by the acceptance workflow.`,
        idempotencyKey: `review-${suffix}-primary`,
      },
    );
    assert.equal(result.status, expected);
    const provider = (await db.collection("providers").doc(providerId).get())
      .data();
    assert.equal(provider?.publiclyVisible, false);
    assert.equal(provider?.isActive, false);
    const history = await db.collection("providerVerifications")
      .doc(verificationId)
      .collection("history")
      .get();
    assert.equal(history.size, 1);
  }
}

async function listVerificationFiles(providerId) {
  const snapshot = await db.collection("providerVerifications")
    .doc((await db.collection("providers").doc(providerId).get()).data()?.verificationId ?? "missing")
    .collection("documents").get();
  if (!snapshot.empty) return snapshot.docs.map((doc) => doc.data().storagePath);

  const verification = await db.collection("providerVerifications")
    .where("providerId", "==", providerId).limit(1).get();
  const documents = await verification.docs[0].ref.collection("documents").get();
  return documents.docs.map((doc) => doc.data().storagePath);
}

async function callFunction(name, user, data) {
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/${name}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await user.getIdToken(true)}`,
      },
      body: JSON.stringify({data}),
    },
  );
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`${body.error?.status ?? response.status}: ${body.error?.message ?? "Callable failed"}`);
  }
  return body.result;
}

function requiredEnv(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required.`);
  return value;
}
