const assert = require("node:assert/strict");

const {
  deleteApp: deleteAdminApp,
  initializeApp: initializeAdminApp,
} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {deleteApp, initializeApp} = require("firebase/app");
const {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} = require("firebase/auth");

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-provider-business-profile";
const authHost = requiredEnv("FIREBASE_AUTH_EMULATOR_HOST");
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:35001";
const clientApp = initializeApp(
  {apiKey: "fake-api-key", projectId},
  `provider-business-profile-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${authHost}`, {disableWarnings: true});
const adminApp = initializeAdminApp(
  {projectId},
  `provider-business-profile-admin-${Date.now()}`,
);
const db = getFirestore(adminApp);

void run();

async function run() {
  try {
    await assert.rejects(
      () => callFunction("updateProviderBusinessProfile", null, {
        description: "An unauthenticated update must never be accepted.",
      }),
      /UNAUTHENTICATED/u,
    );

    const owner = (
      await createUserWithEmailAndPassword(
        auth,
        "provider.business-profile.owner@feasta.test",
        "FeastaTest!2026",
      )
    ).user;
    const providerId = "provider_business_profile_owner";

    await Promise.all([
      db.collection("users").doc(owner.uid).set({
        uid: owner.uid,
        role: "provider",
        providerId,
        accountStatus: "active",
        isActive: true,
        isBlocked: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
      db.collection("providers").doc(providerId).set({
        ownerId: owner.uid,
        businessName: "Original Business",
        businessEmail: "business@example.test",
        businessPhone: "+639171111111",
        description: "Original approved public provider description.",
        address: "Original Street",
        city: "Ormoc City",
        province: "Leyte",
        location: "Ormoc City, Leyte",
        providerServiceType: "addon",
        providerCategory: "photographer",
        serviceCategories: ["photographer"],
        serviceAreas: ["Ormoc City"],
        eventTypesSupported: ["wedding"],
        verificationStatus: "approved",
        isActive: true,
        isSuspended: false,
        isDeleted: false,
        publiclyVisible: true,
        searchTokens: ["original"],
        logoUrl: null,
        logoPublicId: null,
        coverImageUrl: null,
        coverPublicId: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    ]);

    const payload = {
      businessPhone: "0917 222 3333",
      description: "Updated public provider description for event customers.",
      address: "Updated Event Street",
      city: "Ormoc City",
      province: "Leyte",
    };
    const first = await callFunction("updateProviderBusinessProfile", owner, payload);
    assert.equal(first.updated, true);
    assert.deepEqual(first.updatedFields.sort(), [
      "address",
      "businessPhone",
      "description",
    ]);

    const provider = (
      await db.collection("providers").doc(providerId).get()
    ).data();
    assert.equal(provider.businessPhone, "+639172223333");
    assert.equal(provider.description, payload.description);
    assert.equal(provider.address, payload.address);
    assert.equal(provider.businessName, "Original Business");
    assert.equal(provider.providerServiceType, "addon");
    assert.deepEqual(provider.serviceCategories, ["photographer"]);
    assert.equal(provider.verificationStatus, "approved");
    assert.equal(provider.publiclyVisible, true);

    const attacker = (
      await createUserWithEmailAndPassword(
        auth,
        "provider.business-profile.attacker@feasta.test",
        "FeastaTest!2026",
      )
    ).user;
    await db.collection("users").doc(attacker.uid).set({
      uid: attacker.uid,
      role: "provider",
      providerId,
      accountStatus: "active",
      isActive: true,
      isBlocked: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await assert.rejects(
      () => callFunction("updateProviderBusinessProfile", attacker, {
        description: "A different provider must not update this profile.",
      }),
      /PERMISSION_DENIED/u,
    );
    assert.equal(
      (await db.collection("providers").doc(providerId).get()).data()
        ?.description,
      payload.description,
    );

    const replay = await callFunction(
      "updateProviderBusinessProfile",
      owner,
      payload,
    );
    assert.equal(replay.updated, false);
    assert.deepEqual(replay.updatedFields, []);

    await assert.rejects(
      () => callFunction("updateProviderBusinessProfile", owner, {
        providerId: "provider_other",
        description: "Attempted cross-provider update description.",
      }),
      /INVALID_ARGUMENT/u,
    );
    await assert.rejects(
      () => callFunction("updateProviderBusinessProfile", owner, {
        verificationStatus: "approved",
      }),
      /INVALID_ARGUMENT/u,
    );
    await assert.rejects(
      () => callFunction("updateProviderBusinessProfile", owner, {
        ownerId: owner.uid,
      }),
      /INVALID_ARGUMENT/u,
    );
    await assert.rejects(
      () => callFunction("updateProviderBusinessProfile", owner, {
        providerServiceType: "both",
        serviceCategories: ["photographer", "catering_service"],
      }),
      /INVALID_ARGUMENT/u,
    );
    await assert.rejects(
      () => callFunction("updateRoleAccountProfile", owner, {
        ownerFirstName: "Provider",
        ownerLastName: "Owner",
        businessName: "Original Business",
        businessEmail: "business@example.test",
        businessPhone: "+639172223333",
        description: "An approved public profile bypass through Account Settings.",
        address: "Updated Event Street",
        city: "Ormoc City",
        province: "Leyte",
      }),
      /FAILED_PRECONDITION/u,
    );
    const ownerAccountUpdate = await callFunction(
      "updateRoleAccountProfile",
      owner,
      {
        ownerFirstName: "Updated",
        ownerLastName: "Owner",
        businessName: "Original Business",
        businessEmail: "business@example.test",
        businessPhone: "+639172223333",
        description: payload.description,
        address: "Updated Event Street",
        city: "Ormoc City",
        province: "Leyte",
      },
    );
    assert.equal(ownerAccountUpdate.success, true);
    const providerAfterAccountUpdate = (
      await db.collection("providers").doc(providerId).get()
    ).data();
    assert.equal(providerAfterAccountUpdate.ownerFirstName, "Updated");
    assert.equal(providerAfterAccountUpdate.description, payload.description);

    await db.collection("providers").doc(providerId).update({
      verificationStatus: "under_review",
      isActive: false,
      publiclyVisible: false,
    });
    await assert.rejects(
      () => callFunction("updateProviderBusinessProfile", owner, {
        description: "This update must not pass while under review.",
      }),
      /FAILED_PRECONDITION/u,
    );

    const audit = await db.collection("adminLogs")
      .where("targetId", "==", providerId)
      .where("action", "==", "provider.business_profile_updated")
      .get();
    assert.equal(audit.size, 1);
    console.log("Provider business profile integration passed.");
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(clientApp);
    await deleteAdminApp(adminApp);
  }
}

async function callFunction(name, user, data) {
  const headers = {
    "content-type": "application/json",
  };
  if (user) {
    headers.authorization = `Bearer ${await user.getIdToken(true)}`;
  }
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/${name}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({data}),
    },
  );
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(
      `${body.error?.status ?? response.status}: ` +
      `${body.error?.message ?? "Callable failed"}`,
    );
  }
  return body.result;
}

function requiredEnv(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required.`);
  return value;
}
