const {after, before, beforeEach, test} = require("node:test");
const assert = require("node:assert/strict");
const {
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} = require("firebase/firestore");

const {
  authenticated,
  createRulesTestEnvironment,
  seedDocuments,
  userData,
} = require("./rules-test-helpers.cjs");

let testEnv;

function publicProviderData(ownerId, overrides = {}) {
  return {
    ownerId,
    businessName: "Public FEASTA Provider",
    description: "Complete public provider profile.",
    address: "123 Event Street",
    city: "Ormoc City",
    province: "Leyte",
    providerServiceType: "catering",
    verificationStatus: "approved",
    publiclyVisible: true,
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    ...overrides,
  };
}

before(async () => {
  testEnv = await createRulesTestEnvironment();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test("users bootstrap only their claimed customer or provider role", async () => {
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const provider = authenticated(testEnv, "provider-one", "provider")
    .firestore();
  const fakeAdmin = authenticated(testEnv, "fake-admin", "admin")
    .firestore();
  const phoneBootstrap = authenticated(
    testEnv,
    "customer-phone-bootstrap",
    "customer",
  ).firestore();
  const roleEscalation = authenticated(
    testEnv,
    "customer-role-escalation",
    "customer",
  ).firestore();

  await assertSucceeds(setDoc(
    doc(customer, "users/customer-one"),
    userData("customer-one", "customer"),
  ));
  await assertSucceeds(setDoc(
    doc(provider, "users/provider-one"),
    userData("provider-one", "provider", {providerId: null}),
  ));
  await assertFails(setDoc(
    doc(fakeAdmin, "users/fake-admin"),
    userData("fake-admin", "admin"),
  ));
  await assertFails(setDoc(
    doc(roleEscalation, "users/customer-role-escalation"),
    userData("customer-role-escalation", "admin"),
  ));
  await assertFails(setDoc(
    doc(phoneBootstrap, "users/customer-phone-bootstrap"),
    userData("customer-phone-bootstrap", "customer", {
      phoneNumber: "+639171234567",
    }),
  ));
});

test("users cannot change trusted fields and admin has bounded controls", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/admin-one": userData("admin-one", "admin"),
  });
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();
  const customerRef = doc(customer, "users/customer-one");

  await assertFails(updateDoc(customerRef, {role: "admin"}));
  await assertFails(updateDoc(customerRef, {providerId: "provider-one"}));
  await assertFails(updateDoc(customerRef, {isBlocked: true}));
  await assertFails(updateDoc(customerRef, {isEmailVerified: false}));
  await assertFails(updateDoc(customerRef, {isPhoneVerified: true}));
  await assertFails(updateDoc(customerRef, {accountStatus: "disabled"}));
  await assertFails(updateDoc(customerRef, {accountStatus: "pending_deletion"}));
  await assertFails(updateDoc(customerRef, {marketingConsent: true}));
  await assertFails(updateDoc(customerRef, {preferencesUpdatedAt: new Date()}));
  await assertFails(updateDoc(customerRef, {email: "attacker@example.test"}));
  await assertFails(updateDoc(customerRef, {phoneNumber: "+639179999999"}));
  await assertFails(updateDoc(customerRef, {adminNotes: "self-assigned"}));
  await assertSucceeds(updateDoc(customerRef, {
    firstName: "Updated",
    updatedAt: new Date(),
  }));
  await assertSucceeds(updateDoc(
    doc(admin, "users/customer-one"),
    {isBlocked: true, accountStatus: "blocked", updatedAt: new Date()},
  ));
  await assertFails(updateDoc(
    doc(admin, "users/customer-one"),
    {role: "admin"},
  ));
});

test("customer user and customer profile can be created atomically", async () => {
  const customer = authenticated(testEnv, "customer-batch", "customer")
    .firestore();
  const batch = writeBatch(customer);
  batch.set(
    doc(customer, "users/customer-batch"),
    userData("customer-batch", "customer"),
  );
  batch.set(doc(customer, "customers/customer-batch"), {
    userId: "customer-batch",
    email: "customer-batch@example.test",
    firstName: "Customer",
    createdAt: new Date(),
  });
  await assertSucceeds(batch.commit());
});

test("customer profiles are private and retain immutable userId", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/customer-two": userData("customer-two", "customer"),
    "customers/customer-one": {
      userId: "customer-one",
      email: "customer-one@example.test",
      firstName: "One",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  });
  const owner = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const other = authenticated(testEnv, "customer-two", "customer")
    .firestore();

  await assertSucceeds(getDoc(doc(owner, "customers/customer-one")));
  await assertFails(getDoc(doc(other, "customers/customer-one")));
  await assertFails(setDoc(doc(other, "customers/customer-one-copy"), {
    userId: "customer-one",
    email: "customer-one@example.test",
    createdAt: new Date(),
  }));
  await assertFails(updateDoc(
    doc(owner, "customers/customer-one"),
    {userId: "customer-two"},
  ));
  await assertFails(updateDoc(
    doc(owner, "customers/customer-one"),
    {email: "unverified@example.test"},
  ));
  await assertFails(updateDoc(
    doc(owner, "customers/customer-one"),
    {phoneNumber: "+639179999999"},
  ));
  await assertSucceeds(updateDoc(
    doc(owner, "customers/customer-one"),
    {address: "Main Street", city: "Ormoc", province: "Leyte"},
  ));
});

test("provider visibility and lifecycle fields follow trusted ownership", async () => {
  await seedDocuments(testEnv, {
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-approved",
    }),
    "users/provider-other": userData("provider-other", "provider", {
      providerId: "provider-other",
    }),
    "providers/provider-draft": {
      ownerId: "provider-owner",
      businessName: "Draft",
      verificationStatus: "draft",
      isActive: false,
      isFeatured: false,
      isSuspended: false,
      createdAt: new Date(),
    },
    "providers/provider-approved": {
      ...publicProviderData("provider-owner"),
      businessName: "Approved",
      isFeatured: false,
      createdAt: new Date(),
    },
    "providers/provider-other": {
      ownerId: "provider-other",
      businessName: "Other",
      verificationStatus: "draft",
      isActive: false,
      isFeatured: false,
      isSuspended: false,
      createdAt: new Date(),
    },
  });
  const publicDb = testEnv.unauthenticatedContext().firestore();
  const owner = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const other = authenticated(testEnv, "provider-other", "provider")
    .firestore();

  await assertSucceeds(getDoc(doc(publicDb, "providers/provider-approved")));
  await assertFails(getDoc(doc(publicDb, "providers/provider-draft")));
  await assertSucceeds(getDoc(doc(owner, "providers/provider-draft")));
  await assertFails(updateDoc(
    doc(owner, "providers/provider-draft"),
    {businessName: "Updated Draft"},
  ));
  await assertFails(updateDoc(
    doc(other, "providers/provider-draft"),
    {businessName: "Hijacked"},
  ));
  await assertFails(updateDoc(
    doc(owner, "providers/provider-draft"),
    {verificationStatus: "approved"},
  ));
  await assertFails(updateDoc(
    doc(owner, "providers/provider-draft"),
    {isActive: true},
  ));
  await assertFails(updateDoc(
    doc(owner, "providers/provider-approved"),
    {providerServiceType: "both"},
  ));
  await assertFails(updateDoc(
    doc(owner, "providers/provider-approved"),
    {serviceCategories: ["catering_service", "photographer"]},
  ));
});

test("refund policy fields are readable with their catalog but callable-only to mutate", async () => {
  const refundPolicy = {
    schemaVersion: 1,
    policyVersion: 1,
    rules: [
      {stage: "preparation_not_started", refundBasisPoints: 10000},
      {stage: "preparation_started", refundBasisPoints: 5000},
      {stage: "service_started", refundBasisPoints: 0},
    ],
    terms: null,
    effectiveAt: new Date(),
  };

  await seedDocuments(testEnv, {
    "users/provider-policy-owner": userData(
      "provider-policy-owner",
      "provider",
      {providerId: "provider-policy"},
    ),
    "users/admin-policy": userData("admin-policy", "admin"),
    "providers/provider-policy": publicProviderData(
      "provider-policy-owner",
      {refundPolicy},
    ),
    "packages/package-policy": {
      providerId: "provider-policy",
      name: "Policy package",
      status: "published",
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
      publishedAt: new Date(),
      isDeleted: false,
      refundPolicyOverride: refundPolicy,
      refundPolicyOverrideVersion: 1,
    },
  });

  const owner = authenticated(
    testEnv,
    "provider-policy-owner",
    "provider",
  ).firestore();
  const admin = authenticated(
    testEnv,
    "admin-policy",
    "admin",
  ).firestore();
  const publicDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(
    publicDb,
    "providers/provider-policy",
  )));
  await assertSucceeds(getDoc(doc(
    publicDb,
    "packages/package-policy",
  )));

  await assertFails(updateDoc(doc(
    owner,
    "providers/provider-policy",
  ), {refundPolicy: {...refundPolicy, policyVersion: 99}}));
  await assertFails(updateDoc(doc(
    admin,
    "providers/provider-policy",
  ), {refundPolicy: {...refundPolicy, policyVersion: 99}}));
  await assertFails(updateDoc(doc(
    owner,
    "packages/package-policy",
  ), {refundPolicyOverride: null}));
  await assertFails(updateDoc(doc(
    admin,
    "packages/package-policy",
  ), {refundPolicyOverride: null}));
});

test("catalog reads remain available while every direct client mutation is denied", async () => {
  await seedDocuments(testEnv, {
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-approved",
    }),
    "users/provider-other": userData("provider-other", "provider", {
      providerId: "provider-other",
    }),
    "users/customer-one": userData("customer-one", "customer"),
    "providers/provider-approved": publicProviderData("provider-owner"),
    "providers/provider-other": publicProviderData("provider-other", {
      businessName: "Other provider",
    }),
    "packages/private-package": {
      providerId: "provider-approved",
      name: "Private draft",
      status: "draft",
      isActive: false,
      isPublished: false,
      providerPubliclyVisible: false,
      publishedAt: null,
      isDeleted: false,
      createdAt: new Date(),
    },
    "packages/public-package": {
      providerId: "provider-approved",
      name: "Published package",
      status: "published",
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
      publishedAt: new Date(),
      isDeleted: false,
      createdAt: new Date(),
    },
    "menuItems/private-menu-item": {
      providerId: "provider-approved",
      name: "Private menu item",
      status: "draft",
      isActive: false,
      isAvailable: false,
      isPublished: false,
      providerPubliclyVisible: false,
      publishedAt: null,
      isDeleted: false,
      createdAt: new Date(),
    },
    "menuItems/public-menu-item": {
      providerId: "provider-approved",
      name: "Published menu item",
      status: "published",
      isActive: true,
      isAvailable: true,
      isPublished: true,
      providerPubliclyVisible: true,
      publishedAt: new Date(),
      isDeleted: false,
      createdAt: new Date(),
    },
    "addons/private-addon": {
      providerId: "provider-approved",
      name: "Private service",
      status: "draft",
      isActive: false,
      isAvailable: false,
      isPublished: false,
      isDeleted: false,
      createdAt: new Date(),
    },
    "addons/public-addon": {
      providerId: "provider-approved",
      name: "Published service",
      status: "published",
      isActive: true,
      isAvailable: true,
      isPublished: true,
      isDeleted: false,
      createdAt: new Date(),
    },
  });
  const owner = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const otherProvider = authenticated(
    testEnv,
    "provider-other",
    "provider",
  ).firestore();
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const publicDb = testEnv.unauthenticatedContext().firestore();

  const packageInput = {
    providerId: "provider-approved",
    name: "Client-created package",
    status: "draft",
    isActive: false,
    isPublished: false,
    providerPubliclyVisible: false,
    publishedAt: null,
    isDeleted: false,
    createdAt: new Date(),
  };
  const menuItemInput = {
    providerId: "provider-approved",
    name: "Client-created menu item",
    status: "draft",
    isActive: false,
    isAvailable: false,
    isDeleted: false,
    createdAt: new Date(),
  };
  const addonInput = {
    providerId: "provider-approved",
    name: "Client-created service",
    status: "draft",
    isActive: false,
    isAvailable: false,
    isDeleted: false,
    createdAt: new Date(),
  };

  await assertFails(setDoc(doc(owner, "packages/client-created"), packageInput));
  await assertFails(updateDoc(
    doc(owner, "packages/private-package"),
    {name: "Client-updated package"},
  ));
  await assertFails(deleteDoc(doc(owner, "packages/private-package")));
  await assertFails(setDoc(
    doc(owner, "menuItems/client-created"),
    menuItemInput,
  ));
  await assertFails(updateDoc(
    doc(owner, "menuItems/private-menu-item"),
    {name: "Client-updated menu item"},
  ));
  await assertFails(deleteDoc(doc(owner, "menuItems/private-menu-item")));
  await assertFails(setDoc(doc(owner, "addons/client-created"), addonInput));
  await assertFails(updateDoc(
    doc(owner, "addons/private-addon"),
    {name: "Client-updated service"},
  ));
  await assertFails(deleteDoc(doc(owner, "addons/private-addon")));

  for (const path of [
    "packages/private-package",
    "menuItems/private-menu-item",
    "addons/private-addon",
  ]) {
    await assertFails(updateDoc(doc(otherProvider, path), {name: "Hijacked"}));
    await assertFails(updateDoc(doc(customer, path), {name: "Tampered"}));
    await assertFails(updateDoc(doc(publicDb, path), {name: "Anonymous"}));
  }

  await assertSucceeds(getDoc(doc(owner, "packages/private-package")));
  await assertSucceeds(getDoc(doc(owner, "menuItems/private-menu-item")));
  await assertSucceeds(getDoc(doc(owner, "addons/private-addon")));
  await assertFails(getDoc(doc(publicDb, "packages/private-package")));
  await assertFails(getDoc(doc(publicDb, "menuItems/private-menu-item")));
  await assertFails(getDoc(doc(publicDb, "addons/private-addon")));
  await assertSucceeds(getDoc(doc(publicDb, "packages/public-package")));
  await assertSucceeds(getDoc(doc(publicDb, "menuItems/public-menu-item")));
  await assertSucceeds(getDoc(doc(publicDb, "addons/public-addon")));

  const publicPackages = query(
    collection(publicDb, "packages"),
    where("providerId", "==", "provider-approved"),
    where("status", "==", "published"),
    where("isActive", "==", true),
    where("isPublished", "==", true),
    where("providerPubliclyVisible", "==", true),
    where("isDeleted", "==", false),
  );
  assert.equal((await assertSucceeds(getDocs(publicPackages))).size, 1);
  await assertFails(getDocs(query(
    collection(publicDb, "packages"),
    where("providerId", "==", "provider-approved"),
  )));
});

test("public provider list queries constrain every visibility field", async () => {
  await seedDocuments(testEnv, {
    "users/owner-one": userData("owner-one", "provider", {
      providerId: "provider-approved",
    }),
    "users/owner-two": userData("owner-two", "provider", {
      providerId: "provider-suspended",
    }),
    "providers/provider-approved": publicProviderData("owner-one"),
    "providers/provider-suspended": publicProviderData("owner-two", {
      isSuspended: true,
      publiclyVisible: false,
    }),
  });
  const publicDb = testEnv.unauthenticatedContext().firestore();
  const safeQuery = query(
    collection(publicDb, "providers"),
    where("verificationStatus", "==", "approved"),
    where("publiclyVisible", "==", true),
    where("isActive", "==", true),
    where("isSuspended", "==", false),
    where("isDeleted", "==", false),
  );
  const snapshot = await assertSucceeds(getDocs(safeQuery));
  assert.equal(snapshot.size, 1);
  assert.equal(snapshot.docs[0].id, "provider-approved");
});

test("blocked and deactivated provider projections remain non-public", async () => {
  await seedDocuments(testEnv, {
    "users/provider-active": userData("provider-active", "provider", {
      providerId: "provider-active",
    }),
    "users/provider-blocked": userData("provider-blocked", "provider", {
      providerId: "provider-blocked",
      isBlocked: true,
    }),
    "users/provider-deactivated": userData(
      "provider-deactivated",
      "provider",
      {
        providerId: "provider-deactivated",
        accountStatus: "pending_deletion",
        isActive: false,
      },
    ),
    "providers/provider-active": publicProviderData("provider-active"),
    "providers/provider-blocked": publicProviderData("provider-blocked", {
      publiclyVisible: false,
    }),
    "providers/provider-deactivated": publicProviderData(
      "provider-deactivated",
      {publiclyVisible: false, isActive: false},
    ),
  });
  const publicDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb, "providers/provider-active")));
  await assertFails(getDoc(doc(publicDb, "providers/provider-blocked")));
  await assertFails(getDoc(doc(publicDb, "providers/provider-deactivated")));
});

test("verification history is immutable and visible only to owner and admin", async () => {
  await seedDocuments(testEnv, {
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "users/provider-other": userData("provider-other", "provider", {
      providerId: "provider-other",
    }),
    "users/admin-one": userData("admin-one", "admin"),
    "providers/provider-one": {
      ownerId: "provider-owner",
      verificationStatus: "submitted",
      isActive: false,
    },
    "providerVerifications/verification-one": {
      providerId: "provider-one",
      ownerId: "provider-owner",
      status: "submitted",
    },
    "providerVerifications/verification-one/history/history-one": {
      providerId: "provider-one",
      verificationId: "verification-one",
      eventType: "verification_submitted",
      actorId: "provider-owner",
      actorRole: "provider",
      auditLogId: "audit-one",
      createdAt: new Date(),
    },
  });
  const owner = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const other = authenticated(testEnv, "provider-other", "provider")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();
  const historyPath =
    "providerVerifications/verification-one/history/history-one";
  await assertSucceeds(getDoc(doc(owner, historyPath)));
  await assertSucceeds(getDoc(doc(admin, historyPath)));
  await assertFails(getDoc(doc(other, historyPath)));
  await assertFails(updateDoc(doc(owner, historyPath), {remarks: "forged"}));
  await assertFails(setDoc(
    doc(owner, "providerVerifications/verification-one/history/forged"),
    {eventType: "verification_approved"},
  ));
});

test("sparse account data and inconsistent suspended providers fail safely", async () => {
  await seedDocuments(testEnv, {
    "users/sparse-provider": {
      uid: "sparse-provider",
      role: "provider",
    },
    "providers/sparse-provider-record": {
      ownerId: "sparse-provider",
      verificationStatus: "draft",
      isActive: false,
    },
    "providers/inconsistent-suspended": {
      ownerId: "legacy-owner",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: true,
      isDeleted: false,
    },
  });
  const sparseProvider = authenticated(
    testEnv,
    "sparse-provider",
    "provider",
  ).firestore();
  const publicDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(
    sparseProvider,
    "providers/sparse-provider-record",
  )));
  await assertFails(getDoc(doc(
    publicDb,
    "providers/inconsistent-suspended",
  )));
});

test("soft-deleted providers are retained but hidden from public access", async () => {
  await seedDocuments(testEnv, {
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-approved",
    }),
    "providers/provider-approved": {
      ownerId: "provider-owner",
      businessName: "Approved",
      verificationStatus: "approved",
      isActive: true,
      isFeatured: false,
      isSuspended: false,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deletionReason: null,
      createdAt: new Date(),
    },
  });
  const publicDb = testEnv.unauthenticatedContext().firestore();
  const owner = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const providerRef = doc(owner, "providers/provider-approved");

  await assertFails(updateDoc(providerRef, {
    isDeleted: true,
    isActive: false,
  }));
  await assertSucceeds(updateDoc(providerRef, {
    isDeleted: true,
    isActive: false,
    deletedAt: serverTimestamp(),
    deletedBy: "provider-owner",
    deletionReason: "Business closed",
    updatedAt: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(publicDb, "providers/provider-approved")));
  await assertSucceeds(getDoc(providerRef));
  await assertFails(deleteDoc(providerRef));
});

test("provider verification is private and review mutations are callable-only", async () => {
  await seedDocuments(testEnv, {
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "users/admin-one": userData("admin-one", "admin"),
    "users/provider-other": userData("provider-other", "provider", {
      providerId: "provider-two",
    }),
    "providers/provider-one": {
      ownerId: "provider-owner",
      verificationStatus: "draft",
      isActive: false,
    },
    "providers/provider-two": {
      ownerId: "provider-other",
      verificationStatus: "draft",
      isActive: false,
    },
    "providerVerifications/verification-one": {
      providerId: "provider-one",
      ownerId: "provider-owner",
      status: "draft",
    },
    "providerVerifications/verification-one/documents/valid_id": {
      providerId: "provider-one",
      documentType: "valid_id",
      status: "pending",
    },
  });
  const owner = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const other = authenticated(testEnv, "provider-other", "provider")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();

  await assertSucceeds(getDoc(doc(
    owner,
    "providerVerifications/verification-one",
  )));
  await assertSucceeds(getDoc(doc(
    owner,
    "providerVerifications/verification-one/documents/valid_id",
  )));
  await assertFails(getDoc(doc(
    other,
    "providerVerifications/verification-one",
  )));
  await assertFails(getDoc(doc(
    other,
    "providerVerifications/verification-one/documents/valid_id",
  )));
  await assertFails(updateDoc(
    doc(owner, "providerVerifications/verification-one"),
    {status: "approved"},
  ));
  await assertSucceeds(getDoc(doc(
    admin,
    "providerVerifications/verification-one",
  )));
  await assertFails(updateDoc(
    doc(admin, "providerVerifications/verification-one"),
    {status: "approved"},
  ));
});

test("booking, event, and provider-request reads require participation", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/customer-other": userData("customer-other", "customer"),
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "providers/provider-one": {
      ownerId: "provider-owner",
      verificationStatus: "approved",
      isActive: true,
    },
    "bookings/booking-one": {
      customerId: "customer-one",
      providerId: "provider-one",
      status: "pending",
      paymentStatus: "unpaid",
      createdAt: new Date(),
    },
    "mainEvents/event-one": {
      customerId: "customer-one",
      status: "draft",
      createdAt: new Date(),
    },
    "providerRequests/request-one": {
      customerId: "customer-one",
      providerId: "provider-one",
      mainEventId: "event-one",
      status: "pending",
      createdAt: new Date(),
    },
  });
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const provider = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const unrelated = authenticated(testEnv, "customer-other", "customer")
    .firestore();

  await assertSucceeds(getDoc(doc(customer, "bookings/booking-one")));
  await assertSucceeds(getDoc(doc(provider, "bookings/booking-one")));
  await assertFails(getDoc(doc(unrelated, "bookings/booking-one")));
  await assertSucceeds(getDoc(doc(customer, "mainEvents/event-one")));
  await assertFails(getDoc(doc(provider, "mainEvents/event-one")));
  await assertSucceeds(getDoc(doc(provider, "providerRequests/request-one")));
  await assertFails(getDoc(doc(unrelated, "providerRequests/request-one")));
  await assertFails(updateDoc(
    doc(customer, "bookings/booking-one"),
    {status: "confirmed"},
  ));
  await assertFails(updateDoc(
    doc(customer, "mainEvents/event-one"),
    {status: "completed"},
  ));
  await assertFails(updateDoc(
    doc(provider, "providerRequests/request-one"),
    {status: "accepted"},
  ));
});

test("canonical provider requests are server-created and main-event trust fields are immutable", async () => {
  const eventId = "event-security-one";
  const requestId = "request-security-one";
  const eventDate = new Date("2027-06-18T00:00:00+08:00");
  const mainEvent = {
    bookingId: eventId,
    mainEventId: eventId,
    bookingCode: "FEASTA-SECURITY-ONE",
    clientRequestId: "client-security-one",
    submissionFingerprint: "fingerprint-security-one",
    customerId: "customer-one",
    providerId: "provider-one",
    currentProviderId: "provider-one",
    originalProviderId: "provider-one",
    providerBusinessName: "Public FEASTA Provider",
    packageId: "package-one",
    packageName: "Trusted Package",
    packagePrice: 10000,
    selectedAddOns: [],
    eventType: "Wedding",
    eventDate,
    eventTime: "10:00",
    eventEndTime: "14:00",
    guestCount: 100,
    eventLocation: "Ormoc City",
    eventAddress: "123 Trusted Street",
    cateringAddOnsTotal: 0,
    marketplaceAddOnsTotal: 0,
    cateringSubtotal: 10000,
    estimatedEventTotal: 10000,
    addOnsTotal: 0,
    totalAmount: 10000,
    downPaymentPercentage: 20,
    downPaymentAmount: 2000,
    remainingBalance: 8000,
    status: "pending_provider_approval",
    paymentStatus: "unpaid",
    recoveryStatus: "none",
    cancellationStatus: "none",
    refundStatus: "none",
    refundAmount: 0,
    providerRequestIds: [requestId],
    providerRequestCount: 1,
    pendingProviderRequestCount: 1,
    confirmedProviderRequestCount: 0,
    rejectedProviderRequestCount: 0,
    completedProviderRequestCount: 0,
    rejectedByProviderIds: [],
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const providerRequest = {
    providerRequestId: requestId,
    bookingId: eventId,
    mainEventId: eventId,
    customerId: "customer-one",
    providerId: "provider-one",
    type: "catering",
    status: "pending",
    eventType: mainEvent.eventType,
    eventDate,
    eventTime: mainEvent.eventTime,
    eventEndTime: mainEvent.eventEndTime,
    guestCount: mainEvent.guestCount,
    eventLocation: mainEvent.eventLocation,
    eventAddress: mainEvent.eventAddress,
    packageId: mainEvent.packageId,
    packageName: mainEvent.packageName,
    services: [{
      serviceId: mainEvent.packageId,
      name: mainEvent.packageName,
      category: "catering",
      price: 10000,
      downPaymentPercentage: 20,
      downPaymentAmount: 2000,
    }],
    amount: 10000,
    downPaymentPercentage: 20,
    downPaymentAmount: 2000,
    remainingBalance: 8000,
    providerNotes: null,
    adminNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "users/admin-one": userData("admin-one", "admin"),
    "providers/provider-one": publicProviderData("provider-owner"),
    [`mainEvents/${eventId}`]: mainEvent,
    [`providerRequests/${requestId}`]: providerRequest,
  });

  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const provider = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();

  await assertFails(setDoc(
    doc(customer, "providerRequests/forged-canonical-request"),
    {
      ...providerRequest,
      providerRequestId: "forged-canonical-request",
    },
  ));
  await assertFails(setDoc(
    doc(customer, "mainEvents/forged-trusted-draft"),
    {
      customerId: "customer-one",
      status: "draft",
      bookingId: "forged-trusted-draft",
      mainEventId: "forged-trusted-draft",
      clientRequestId: "forged-client-request",
      submissionFingerprint: "forged-fingerprint",
      providerRequestIds: ["forged-canonical-request"],
      providerRequestCount: 1,
      recoveryStatus: "none",
      rejectedByProviderIds: [],
      createdAt: new Date(),
    },
  ));

  await assertSucceeds(getDoc(doc(customer, `providerRequests/${requestId}`)));
  await assertSucceeds(getDoc(doc(provider, `providerRequests/${requestId}`)));
  await assertSucceeds(getDoc(doc(admin, `providerRequests/${requestId}`)));
  await assertSucceeds(updateDoc(doc(provider, `providerRequests/${requestId}`), {
    providerNotes: "Available for this event.",
    updatedAt: new Date(),
  }));
  await assertSucceeds(updateDoc(doc(admin, `providerRequests/${requestId}`), {
    adminNotes: "Reviewed by operations.",
    updatedAt: new Date(),
  }));

  await assertSucceeds(updateDoc(doc(customer, `mainEvents/${eventId}`), {
    eventAddress: "456 Customer Editable Street",
    updatedAt: new Date(),
  }));
  await assertFails(updateDoc(doc(customer, `mainEvents/${eventId}`), {
    providerRequestIds: [requestId, "forged-request"],
  }));
  await assertFails(updateDoc(doc(customer, `mainEvents/${eventId}`), {
    providerRequestCount: 99,
    pendingProviderRequestCount: 99,
  }));
  await assertFails(updateDoc(doc(customer, `mainEvents/${eventId}`), {
    recoveryStatus: "replacement_pending",
    rejectedByProviderIds: ["provider-one"],
    selectedRecoveryOfferId: "forged-recovery-offer",
    recoveryOpenedAt: new Date(),
  }));
  await assertFails(updateDoc(doc(customer, `mainEvents/${eventId}`), {
    bookingId: "forged-booking",
    mainEventId: "forged-event",
    clientRequestId: "forged-client-request",
    submissionFingerprint: "forged-fingerprint",
  }));
});

test("only verified customers create main events", async () => {
  await seedDocuments(testEnv, {
    "users/unverified-customer": userData("unverified-customer", "customer"),
    "users/verified-customer": userData("verified-customer", "customer", {
      isPhoneVerified: true,
    }),
  });
  const unverified = authenticated(
    testEnv,
    "unverified-customer",
    "customer",
  ).firestore();
  const verified = authenticated(
    testEnv,
    "verified-customer",
    "customer",
  ).firestore();

  await assertFails(setDoc(doc(unverified, "mainEvents/unverified-event"), {
    customerId: "unverified-customer",
    status: "draft",
    createdAt: new Date(),
  }));
  await assertSucceeds(setDoc(doc(verified, "mainEvents/verified-event"), {
    customerId: "verified-customer",
    status: "draft",
    createdAt: new Date(),
  }));
  await assertFails(setDoc(doc(unverified, "mainEvents/unverified-submit"), {
    customerId: "unverified-customer",
    status: "pending",
    createdAt: new Date(),
  }));
  await assertFails(setDoc(doc(verified, "mainEvents/client-submit"), {
    customerId: "verified-customer",
    status: "pending",
    createdAt: new Date(),
  }));
});

test("canonical payments are readable by participants and never client-written", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/customer-other": userData("customer-other", "customer"),
    "users/admin-one": userData("admin-one", "admin"),
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "providers/provider-one": {
      ownerId: "provider-owner",
      verificationStatus: "approved",
      isActive: true,
    },
    "payments/payment-one": {
      customerId: "customer-one",
      providerId: "provider-one",
      status: "pending",
      amount: 1000,
    },
    "paymentWebhookEvents/event-one": {
      eventId: "event-one",
      paymentId: "payment-one",
      status: "processed",
    },
  });
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const provider = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const unrelated = authenticated(testEnv, "customer-other", "customer")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();

  await assertSucceeds(getDoc(doc(customer, "payments/payment-one")));
  await assertSucceeds(getDoc(doc(provider, "payments/payment-one")));
  await assertFails(getDoc(doc(unrelated, "payments/payment-one")));
  await assertFails(setDoc(doc(customer, "payments/client-payment"), {
    customerId: "customer-one",
    status: "paid",
  }));
  await assertFails(updateDoc(
    doc(customer, "payments/payment-one"),
    {status: "paid"},
  ));
  await assertFails(updateDoc(
    doc(provider, "payments/payment-one"),
    {status: "paid", paidAt: new Date()},
  ));
  await assertFails(updateDoc(
    doc(customer, "payments/payment-one"),
    {amount: 1, currency: "PHP"},
  ));
  await assertFails(updateDoc(
    doc(admin, "payments/payment-one"),
    {status: "refunded", refundedAt: new Date()},
  ));
  await assertFails(getDoc(doc(customer, "paymentWebhookEvents/event-one")));
  await assertSucceeds(getDoc(doc(admin, "paymentWebhookEvents/event-one")));
  await assertFails(setDoc(doc(admin, "paymentWebhookEvents/forged"), {
    eventId: "forged",
    status: "processed",
  }));
});

test("admin logs are admin-readable and immutable to all clients", async () => {
  await seedDocuments(testEnv, {
    "users/admin-one": userData("admin-one", "admin"),
    "users/customer-one": userData("customer-one", "customer"),
    "adminLogs/log-one": {action: "test", actorId: "system"},
  });
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();

  await assertSucceeds(getDoc(doc(admin, "adminLogs/log-one")));
  await assertFails(getDoc(doc(customer, "adminLogs/log-one")));
  await assertFails(setDoc(doc(admin, "adminLogs/client-log"), {
    action: "forged",
  }));
});

test("notifications expose only owner reads and read-state updates", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/customer-other": userData("customer-other", "customer"),
    "notifications/notification-one": {
      userId: "customer-one",
      title: "Test",
      isRead: false,
      readAt: null,
    },
  });
  const owner = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const other = authenticated(testEnv, "customer-other", "customer")
    .firestore();

  await assertSucceeds(getDoc(doc(owner, "notifications/notification-one")));
  await assertFails(getDoc(doc(other, "notifications/notification-one")));
  await assertSucceeds(updateDoc(
    doc(owner, "notifications/notification-one"),
    {isRead: true, readAt: new Date()},
  ));
  await assertFails(updateDoc(
    doc(owner, "notifications/notification-one"),
    {userId: "customer-other"},
  ));
  await assertFails(setDoc(doc(owner, "notifications/forged"), {
    userId: "customer-other",
    title: "System notice",
    message: "Forged",
    type: "admin",
    isRead: false,
    createdAt: new Date(),
  }));
});

test("blocked and disabled users cannot perform protected actions", async () => {
  await seedDocuments(testEnv, {
    "users/blocked-customer": userData("blocked-customer", "customer", {
      accountStatus: "blocked",
      isActive: false,
      isBlocked: true,
    }),
    "users/blocked-provider": userData("blocked-provider", "provider", {
      providerId: "provider-blocked",
      accountStatus: "blocked",
      isActive: false,
      isBlocked: true,
    }),
    "users/disabled-customer": userData("disabled-customer", "customer", {
      accountStatus: "disabled",
      isActive: false,
      isBlocked: false,
    }),
    "users/deactivated-customer": userData("deactivated-customer", "customer", {
      accountStatus: "pending_deletion",
      isActive: false,
      isBlocked: false,
    }),
    "providers/provider-blocked": {
      ownerId: "blocked-provider",
      businessName: "Blocked Provider",
      verificationStatus: "approved",
      isActive: true,
      isFeatured: false,
      isSuspended: false,
      createdAt: new Date(),
    },
    "mainEvents/disabled-event": {
      customerId: "disabled-customer",
      status: "draft",
      createdAt: new Date(),
    },
    "mainEvents/deactivated-event": {
      customerId: "deactivated-customer",
      status: "draft",
      createdAt: new Date(),
    },
  });
  const customer = authenticated(
    testEnv,
    "blocked-customer",
    "customer",
  ).firestore();
  const provider = authenticated(
    testEnv,
    "blocked-provider",
    "provider",
  ).firestore();
  const disabled = authenticated(
    testEnv,
    "disabled-customer",
    "customer",
  ).firestore();
  const deactivated = authenticated(
    testEnv,
    "deactivated-customer",
    "customer",
  ).firestore();

  await assertFails(setDoc(doc(customer, "mainEvents/blocked-event"), {
    customerId: "blocked-customer",
    status: "draft",
    createdAt: new Date(),
  }));
  await assertFails(setDoc(doc(customer, "bookings/blocked-booking"), {
    customerId: "blocked-customer",
    status: "pending",
    paymentStatus: "unpaid",
    createdAt: new Date(),
  }));
  await assertFails(updateDoc(
    doc(provider, "providers/provider-blocked"),
    {businessName: "Still blocked"},
  ));
  await assertFails(getDoc(doc(disabled, "mainEvents/disabled-event")));
  await assertFails(updateDoc(doc(disabled, "users/disabled-customer"), {
    firstName: "Still disabled",
    updatedAt: new Date(),
  }));
  await assertFails(getDoc(doc(
    deactivated,
    "mainEvents/deactivated-event",
  )));
});

test("event and legacy add-on payment state is backend-only", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "providers/provider-one": {
      ownerId: "provider-owner",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
    },
    "mainEvents/event-one": {
      customerId: "customer-one",
      status: "draft",
      paymentStatus: "unpaid",
      totalAmount: 5000,
      createdAt: new Date(),
    },
    "addonRequests/addon-one": {
      customerId: "customer-one",
      addonProviderId: "provider-one",
      status: "accepted",
      paymentStatus: "waiting_payment",
      price: 1000,
      createdAt: new Date(),
    },
  });
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const provider = authenticated(testEnv, "provider-owner", "provider")
    .firestore();

  await assertFails(updateDoc(doc(customer, "mainEvents/event-one"), {
    paymentStatus: "paid",
    paidAt: new Date(),
  }));
  await assertFails(updateDoc(doc(customer, "mainEvents/event-one"), {
    totalAmount: 1,
  }));
  await assertFails(updateDoc(doc(customer, "addonRequests/addon-one"), {
    paymentStatus: "paid",
    paymentId: "forged",
  }));
  await assertFails(updateDoc(doc(provider, "addonRequests/addon-one"), {
    price: 1,
    status: "completed",
  }));
});

test("complaints are creator-owned and administratively resolvable", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/customer-other": userData("customer-other", "customer"),
    "users/admin-one": userData("admin-one", "admin"),
    "complaints/complaint-one": {
      userId: "customer-one",
      providerId: null,
      description: "A complaint",
      status: "submitted",
      createdAt: new Date(),
    },
  });
  const creator = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const other = authenticated(testEnv, "customer-other", "customer")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();

  await assertFails(setDoc(doc(creator, "complaints/client-created"), {
    userId: "customer-one",
    description: "Bypass callable",
    status: "submitted",
    createdAt: new Date(),
  }));
  await assertFails(getDoc(doc(other, "complaints/complaint-one")));
  await assertSucceeds(getDoc(doc(admin, "complaints/complaint-one")));
  await assertSucceeds(updateDoc(
    doc(admin, "complaints/complaint-one"),
    {status: "resolved", resolvedAt: new Date()},
  ));
  await assertFails(updateDoc(
    doc(admin, "complaints/complaint-one"),
    {userId: "customer-other"},
  ));
});

test("chat reads stay participant-scoped and all client mutations are denied", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/customer-other": userData("customer-other", "customer"),
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "users/provider-other": userData("provider-other", "provider", {
      providerId: "provider-two",
    }),
    "providers/provider-one": {
      ownerId: "provider-owner",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
    },
    "providers/provider-two": {
      ownerId: "provider-other",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
    },
    "chatRooms/room-one": {
      customerId: "customer-one",
      providerId: "provider-one",
      providerOwnerId: "provider-owner",
      lastMessage: "",
      isActive: true,
      createdAt: new Date(),
    },
    "chatRooms/room-one/messages/message-one": {
      chatRoomId: "room-one",
      senderId: "customer-one",
      senderRole: "customer",
      message: "Hello provider",
      messageType: "text",
      isRead: false,
      createdAt: new Date(),
    },
  });
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const unrelated = authenticated(testEnv, "customer-other", "customer")
    .firestore();
  const provider = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const otherProvider = authenticated(testEnv, "provider-other", "provider")
    .firestore();

  await assertSucceeds(getDoc(doc(customer, "chatRooms/room-one")));
  await assertSucceeds(getDoc(doc(provider, "chatRooms/room-one")));
  await assertFails(getDoc(doc(unrelated, "chatRooms/room-one")));
  await assertFails(getDoc(doc(otherProvider, "chatRooms/room-one")));
  await assertSucceeds(getDocs(query(
    collection(customer, "chatRooms"),
    where("customerId", "==", "customer-one"),
  )));
  await assertFails(getDocs(query(
    collection(unrelated, "chatRooms"),
    where("customerId", "==", "customer-one"),
  )));
  await assertSucceeds(getDocs(query(
    collection(provider, "chatRooms"),
    where("providerId", "==", "provider-one"),
  )));
  await assertFails(getDocs(query(
    collection(otherProvider, "chatRooms"),
    where("providerId", "==", "provider-one"),
  )));
  const messagePath = "chatRooms/room-one/messages/message-one";
  await assertSucceeds(getDoc(doc(customer, messagePath)));
  await assertSucceeds(getDoc(doc(provider, messagePath)));
  await assertFails(getDoc(doc(unrelated, messagePath)));
  await assertFails(getDoc(doc(otherProvider, messagePath)));
  await assertFails(setDoc(doc(customer, "chatRooms/client-created"), {
    bookingId: "event-one",
    customerId: "customer-one",
    providerId: "provider-one",
    isActive: true,
    createdAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(customer, "chatRooms/room-one"), {
    providerOwnerId: "customer-other",
  }));
  await assertFails(updateDoc(doc(customer, "chatRooms/room-one"), {
    unreadCountCustomer: 0,
  }));
  await assertFails(deleteDoc(doc(customer, "chatRooms/room-one")));
  await assertFails(deleteDoc(doc(customer, messagePath)));
  await assertFails(setDoc(
    doc(customer, "chatRooms/room-one/messages/forged"),
    {
      chatRoomId: "room-one",
      senderId: "customer-other",
      senderRole: "customer",
      message: "Forged sender",
      messageType: "text",
      isRead: false,
      createdAt: serverTimestamp(),
    },
  ));
  await assertFails(setDoc(
    doc(customer, "chatRooms/room-one/messages/valid"),
    {
      chatRoomId: "room-one",
      senderId: "customer-one",
      senderRole: "customer",
      message: "Hello",
      messageType: "text",
      isRead: false,
      createdAt: serverTimestamp(),
    },
  ));
  await assertFails(setDoc(
    doc(customer, "notifications/client-chat-notification"),
    {
      userId: "provider-owner",
      title: "Forged message notification",
      message: "Forged",
      type: "new_message",
      relatedId: "room-one",
      relatedCollection: "chatRooms",
      isRead: false,
      readAt: null,
      createdAt: serverTimestamp(),
    },
  ));
});

test("legacy review reads and replies require a valid event relationship", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-one",
    }),
    "users/admin-one": userData("admin-one", "admin"),
    "providers/provider-one": {
      ownerId: "provider-owner",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
    },
    "mainEvents/event-one": {
      customerId: "customer-one",
      providerId: "provider-one",
      status: "completed",
    },
    "reviews/review-one": {
      bookingId: "event-one",
      customerId: "customer-one",
      providerId: "provider-one",
      rating: 5,
      comment: "Excellent",
      providerReply: null,
      isVisible: true,
      isDeleted: false,
      createdAt: new Date(),
    },
  });
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const provider = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();
  const publicDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(publicDb, "reviews/review-one")));

  await assertFails(updateDoc(doc(customer, "reviews/review-one"), {
    rating: 1,
    comment: "Changed",
  }));
  await assertFails(updateDoc(doc(customer, "reviews/review-one"), {
    isDeleted: true,
    isVisible: false,
    deletedAt: serverTimestamp(),
    deletedBy: "customer-one",
    deletionReason: "No longer wanted",
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(provider, "reviews/review-one"), {
    providerReply: "Thank you",
    providerReplyAt: new Date(),
    updatedAt: new Date(),
  }));
  await assertFails(updateDoc(doc(provider, "reviews/review-one"), {
    isVisible: false,
  }));
  await assertFails(updateDoc(doc(admin, "reviews/review-one"), {
    moderationStatus: "hidden",
    isVisible: false,
    updatedAt: new Date(),
  }));
});

test("canonical multi-provider reviews isolate private provider access", async () => {
  const providerRequestIds = ["request-a", "request-b"];
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/provider-owner-a": userData("provider-owner-a", "provider", {
      providerId: "provider-a",
    }),
    "users/provider-owner-b": userData("provider-owner-b", "provider", {
      providerId: "provider-b",
    }),
    "users/admin-one": userData("admin-one", "admin"),
    "providers/provider-a": {
      ownerId: "provider-owner-a",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
    },
    "providers/provider-b": {
      ownerId: "provider-owner-b",
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
    },
    "mainEvents/event-x": {
      customerId: "customer-one",
      providerRequestIds,
      status: "completed",
    },
    "providerRequests/request-a": {
      providerRequestId: "request-a",
      mainEventId: "event-x",
      customerId: "customer-one",
      providerId: "provider-a",
      status: "completed",
    },
    "providerRequests/request-b": {
      providerRequestId: "request-b",
      mainEventId: "event-x",
      customerId: "customer-one",
      providerId: "provider-b",
      status: "completed",
    },
    "reviews/review-a": {
      schemaVersion: 2,
      relationshipVersion: "provider_request_v1",
      providerRequestId: "request-a",
      mainEventId: "event-x",
      customerId: "customer-one",
      providerId: "provider-a",
      rating: 5,
      comment: "Excellent provider A",
      moderationStatus: "hidden",
      isVisible: false,
      isDeleted: false,
      createdAt: new Date(),
    },
    "reviews/review-b": {
      schemaVersion: 2,
      relationshipVersion: "provider_request_v1",
      providerRequestId: "request-b",
      mainEventId: "event-x",
      customerId: "customer-one",
      providerId: "provider-b",
      rating: 4,
      comment: "Excellent provider B",
      moderationStatus: "hidden",
      isVisible: false,
      isDeleted: false,
      createdAt: new Date(),
    },
    "reviews/malformed-review": {
      schemaVersion: 2,
      relationshipVersion: "provider_request_v1",
      providerRequestId: "request-b",
      mainEventId: "event-x",
      customerId: "customer-one",
      providerId: "provider-a",
      rating: 1,
      comment: "Forged relationship",
      moderationStatus: "published",
      isVisible: true,
      isDeleted: false,
      createdAt: new Date(),
    },
    "reviews/inconsistent-visibility": {
      schemaVersion: 2,
      relationshipVersion: "provider_request_v1",
      providerRequestId: "request-a",
      mainEventId: "event-x",
      customerId: "customer-one",
      providerId: "provider-a",
      rating: 3,
      comment: "Inconsistent moderation projection",
      moderationStatus: "hidden",
      isVisible: true,
      isDeleted: false,
      createdAt: new Date(),
    },
  });
  const providerA = authenticated(
    testEnv,
    "provider-owner-a",
    "provider",
  ).firestore();
  const providerB = authenticated(
    testEnv,
    "provider-owner-b",
    "provider",
  ).firestore();
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();
  const publicDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(providerA, "reviews/review-a")));
  await assertFails(getDoc(doc(providerA, "reviews/review-b")));
  await assertSucceeds(getDoc(doc(providerB, "reviews/review-b")));
  await assertFails(getDoc(doc(providerB, "reviews/review-a")));
  await assertSucceeds(getDoc(doc(customer, "reviews/review-a")));
  await assertSucceeds(getDoc(doc(customer, "reviews/review-b")));
  await assertFails(getDoc(doc(publicDb, "reviews/malformed-review")));
  await assertFails(getDoc(doc(admin, "reviews/malformed-review")));
  await assertFails(getDoc(doc(publicDb, "reviews/inconsistent-visibility")));
  await assertSucceeds(getDoc(doc(admin, "reviews/inconsistent-visibility")));
});

test("app settings distinguish public reads from active admin writes", async () => {
  await seedDocuments(testEnv, {
    "users/customer-one": userData("customer-one", "customer"),
    "users/admin-one": userData("admin-one", "admin"),
    "appSettings/public": {isPublic: true, value: "public"},
    "appSettings/private": {isPublic: false, value: "private"},
  });
  const publicDb = testEnv.unauthenticatedContext().firestore();
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();

  await assertSucceeds(getDoc(doc(publicDb, "appSettings/public")));
  await assertFails(getDoc(doc(customer, "appSettings/private")));
  await assertSucceeds(getDoc(doc(admin, "appSettings/private")));
  await assertFails(updateDoc(doc(customer, "appSettings/public"), {
    value: "tampered",
  }));
  await assertSucceeds(updateDoc(doc(admin, "appSettings/private"), {
    value: "updated",
  }));
});

test("provider onboarding drafts remain callable and server only", async () => {
  await seedDocuments(testEnv, {
    "users/provider-owner": userData("provider-owner", "provider"),
    "users/admin-one": userData("admin-one", "admin"),
    "providerOnboardingDrafts/provider-owner": {
      ownerId: "provider-owner",
      completedSteps: [1],
      currentStep: 2,
      ownerFirstName: "Test",
    },
  });
  const provider = authenticated(
    testEnv,
    "provider-owner",
    "provider",
  ).firestore();
  const admin = authenticated(testEnv, "admin-one", "admin").firestore();
  const draft = doc(
    provider,
    "providerOnboardingDrafts/provider-owner",
  );

  await assertFails(getDoc(draft));
  await assertFails(updateDoc(draft, {currentStep: 8}));
  await assertFails(setDoc(
    doc(provider, "providerOnboardingDrafts/other-provider"),
    {ownerId: "provider-owner", completedSteps: [1, 2, 3, 4, 5, 6]},
  ));
  await assertFails(getDoc(
    doc(admin, "providerOnboardingDrafts/provider-owner"),
  ));
});
