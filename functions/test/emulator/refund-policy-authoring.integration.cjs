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
  "demo-feasta-refund-policy";
const authHost = requiredEnv("FIREBASE_AUTH_EMULATOR_HOST");
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:35001";

const clientApp = initializeApp(
  {apiKey: "fake-api-key", projectId},
  `refund-policy-client-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${authHost}`, {disableWarnings: true});

const adminApp = initializeAdminApp(
  {projectId},
  `refund-policy-admin-${Date.now()}`,
);
const db = getFirestore(adminApp);

const STAGES = [
  "preparation_not_started",
  "preparation_started",
  "service_started",
];

void run();

async function run() {
  try {
    await assert.rejects(
      () => callFunction("publishProviderRefundPolicy", null, {
        policy: policyDraft([10_000, 5_000, 0]),
        idempotencyKey: "unauthenticated-policy-attempt",
      }),
      /UNAUTHENTICATED/u,
    );

    const owner = await createUser(
      "refund.policy.owner@feasta.test",
    );
    const foreignOwner = await createUser(
      "refund.policy.foreign@feasta.test",
    );
    const customer = await createUser(
      "refund.policy.customer@feasta.test",
    );
    const blockedOwner = await createUser(
      "refund.policy.blocked@feasta.test",
    );
    const legacyOwner = await createUser(
      "refund.policy.legacy@feasta.test",
    );

    await Promise.all([
      seedUser(owner.uid, "provider", "provider_policy_owner"),
      seedUser(
        foreignOwner.uid,
        "provider",
        "provider_policy_foreign",
      ),
      seedUser(customer.uid, "customer", null),
      seedUser(
        blockedOwner.uid,
        "provider",
        "provider_policy_blocked",
        {isBlocked: true},
      ),
      seedUser(
        legacyOwner.uid,
        "provider",
        "provider_policy_legacy",
      ),
      seedProvider("provider_policy_owner", owner.uid),
      seedProvider("provider_policy_foreign", foreignOwner.uid),
      seedProvider("provider_policy_blocked", blockedOwner.uid),
      seedProvider("provider_policy_legacy", legacyOwner.uid),
      seedPackage("package_policy_owner", "provider_policy_owner"),
      seedPackage("package_policy_foreign", "provider_policy_foreign"),
      seedPackage(
        "package_policy_archived",
        "provider_policy_owner",
        "archived",
      ),
      seedPackage("package_policy_legacy", "provider_policy_legacy"),
    ]);

    await assert.rejects(
      () => callFunction("publishProviderRefundPolicy", customer, {
        policy: policyDraft([10_000, 5_000, 0]),
        idempotencyKey: "customer-policy-attempt",
      }),
      /PERMISSION_DENIED/u,
    );
    await assert.rejects(
      () => callFunction("publishProviderRefundPolicy", blockedOwner, {
        policy: policyDraft([10_000, 5_000, 0]),
        idempotencyKey: "blocked-policy-attempt",
      }),
      /PERMISSION_DENIED/u,
    );
    await assert.rejects(
      () => callFunction("publishProviderRefundPolicy", owner, {
        providerId: "provider_policy_foreign",
        policy: policyDraft([10_000, 5_000, 0]),
        idempotencyKey: "cross-provider-policy-attempt",
      }),
      /INVALID_ARGUMENT/u,
    );
    await assert.rejects(
      () => callFunction("publishProviderRefundPolicy", owner, {
        policy: {
          ...policyDraft([10_000, 5_000, 0]),
          policyVersion: 99,
        },
        idempotencyKey: "client-version-policy-attempt",
      }),
      /INVALID_ARGUMENT/u,
    );

    const initial = await callFunction(
      "publishProviderRefundPolicy",
      owner,
      {
        policy: policyDraft([10_000, 5_000, 0], "  Initial terms.  "),
        idempotencyKey: "provider-policy-version-one",
      },
    );
    assert.equal(initial.policyVersion, 1);
    assert.equal(
      initial.effectivePolicyKey,
      "provider_default:provider_policy_owner:v1",
    );
    assert.equal(initial.idempotentReplay, false);

    const replay = await callFunction(
      "publishProviderRefundPolicy",
      owner,
      {
        policy: policyDraft([10_000, 5_000, 0], "  Initial terms.  "),
        idempotencyKey: "provider-policy-version-one",
      },
    );
    assert.equal(replay.policyVersion, 1);
    assert.equal(replay.idempotentReplay, true);

    const concurrent = await Promise.all([
      callFunction("publishProviderRefundPolicy", owner, {
        policy: policyDraft([9_000, 4_000, 0]),
        idempotencyKey: "provider-policy-concurrent-a",
      }),
      callFunction("publishProviderRefundPolicy", owner, {
        policy: policyDraft([8_000, 3_000, 0]),
        idempotencyKey: "provider-policy-concurrent-b",
      }),
    ]);
    assert.deepEqual(
      concurrent.map((result) => result.policyVersion).sort(),
      [2, 3],
    );

    const providerPolicy = (
      await db.collection("providers")
        .doc("provider_policy_owner")
        .get()
    ).data().refundPolicy;
    assert.equal(providerPolicy.schemaVersion, 1);
    assert.equal(providerPolicy.policyVersion, 3);
    assert.ok(providerPolicy.effectiveAt instanceof Timestamp);
    assert.equal(providerPolicy.terms, null);

    await assert.rejects(
      () => callFunction("setPackageRefundPolicyOverride", owner, {
        packageId: "package_policy_foreign",
        override: policyDraft([7_500, 2_500, 0]),
        idempotencyKey: "foreign-package-policy-attempt",
      }),
      /PERMISSION_DENIED/u,
    );
    await assert.rejects(
      () => callFunction("setPackageRefundPolicyOverride", owner, {
        packageId: "package_policy_archived",
        override: policyDraft([7_500, 2_500, 0]),
        idempotencyKey: "archived-package-policy-attempt",
      }),
      /FAILED_PRECONDITION/u,
    );
    await assert.rejects(
      () => callFunction("setPackageRefundPolicyOverride", legacyOwner, {
        packageId: "package_policy_legacy",
        override: policyDraft([7_500, 2_500, 0]),
        idempotencyKey: "legacy-provider-policy-attempt",
      }),
      /FAILED_PRECONDITION/u,
    );

    const overrideOne = await callFunction(
      "setPackageRefundPolicyOverride",
      owner,
      {
        packageId: "package_policy_owner",
        override: policyDraft([7_500, 2_500, 0]),
        idempotencyKey: "package-policy-version-one",
      },
    );
    assert.equal(overrideOne.policyVersion, 1);
    assert.equal(
      overrideOne.effectivePolicyKey,
      "package_override:package_policy_owner:v1",
    );

    const overrideTwo = await callFunction(
      "setPackageRefundPolicyOverride",
      owner,
      {
        packageId: "package_policy_owner",
        override: policyDraft([6_500, 1_500, 0]),
        idempotencyKey: "package-policy-version-two",
      },
    );
    assert.equal(overrideTwo.policyVersion, 2);

    const removed = await callFunction(
      "setPackageRefundPolicyOverride",
      owner,
      {
        packageId: "package_policy_owner",
        override: null,
        idempotencyKey: "package-policy-remove",
      },
    );
    assert.equal(removed.overrideRemoved, true);
    assert.equal(
      removed.effectivePolicyKey,
      "provider_default:provider_policy_owner:v3",
    );

    const packageAfterRemoval = (
      await db.collection("packages")
        .doc("package_policy_owner")
        .get()
    ).data();
    assert.equal(packageAfterRemoval.refundPolicyOverride, null);
    assert.equal(packageAfterRemoval.refundPolicyOverrideVersion, 2);

    const overrideThree = await callFunction(
      "setPackageRefundPolicyOverride",
      owner,
      {
        packageId: "package_policy_owner",
        override: policyDraft([5_500, 500, 0]),
        idempotencyKey: "package-policy-version-three",
      },
    );
    assert.equal(overrideThree.policyVersion, 3);

    const audits = await db.collection("adminLogs")
      .where("metadata.providerId", "==", "provider_policy_owner")
      .get();
    const actions = audits.docs.map((snapshot) => snapshot.data().action);
    assert.equal(
      actions.filter((action) => action === "refund_policy.published").length,
      3,
    );
    assert.equal(
      actions.filter(
        (action) => action === "refund_policy.override_published",
      ).length,
      3,
    );
    assert.equal(
      actions.filter(
        (action) => action === "refund_policy.override_removed",
      ).length,
      1,
    );
    for (const snapshot of audits.docs) {
      const audit = snapshot.data();
      assert.equal(Object.hasOwn(audit.before ?? {}, "rules"), false);
      assert.equal(Object.hasOwn(audit.after ?? {}, "rules"), false);
      assert.equal(Object.hasOwn(audit.metadata ?? {}, "terms"), false);
    }

    console.log("Refund policy authoring integration passed.");
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(clientApp);
    await deleteAdminApp(adminApp);
  }
}

function policyDraft(values, terms = null) {
  return {
    rules: STAGES.map((stage, index) => ({
      stage,
      refundBasisPoints: values[index],
    })),
    terms,
  };
}

async function createUser(email) {
  return (
    await createUserWithEmailAndPassword(
      auth,
      email,
      ["local", projectId, "credential"].join("-"),
    )
  ).user;
}

async function seedUser(uid, role, providerId, overrides = {}) {
  return db.collection("users").doc(uid).set({
    uid,
    role,
    providerId,
    accountStatus: "active",
    isActive: true,
    isBlocked: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  });
}

async function seedProvider(providerId, ownerId) {
  return db.collection("providers").doc(providerId).set({
    ownerId,
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

async function seedPackage(packageId, providerId, status = "published") {
  return db.collection("packages").doc(packageId).set({
    providerId,
    status,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
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
