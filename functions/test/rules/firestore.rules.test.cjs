const {after, before, beforeEach, test} = require("node:test");
const {
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  deleteDoc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} = require("firebase/firestore");

const {
  authenticated,
  createRulesTestEnvironment,
  seedDocuments,
  userData,
} = require("./rules-test-helpers.cjs");

let testEnv;

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
  await assertFails(updateDoc(customerRef, {accountStatus: "disabled"}));
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
});

test("provider visibility and lifecycle fields follow trusted ownership", async () => {
  await seedDocuments(testEnv, {
    "users/provider-owner": userData("provider-owner", "provider", {
      providerId: "provider-draft",
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
      ownerId: "provider-owner",
      businessName: "Approved",
      verificationStatus: "approved",
      isActive: true,
      isFeatured: false,
      isSuspended: false,
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
    "users/provider-other": userData("provider-other", "provider", {
      providerId: "provider-two",
    }),
    "users/admin-one": userData("admin-one", "admin"),
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

test("canonical payments are readable by participants and never client-written", async () => {
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
    "payments/payment-one": {
      customerId: "customer-one",
      providerId: "provider-one",
      status: "pending",
      amount: 1000,
    },
  });
  const customer = authenticated(testEnv, "customer-one", "customer")
    .firestore();
  const provider = authenticated(testEnv, "provider-owner", "provider")
    .firestore();
  const unrelated = authenticated(testEnv, "customer-other", "customer")
    .firestore();

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
