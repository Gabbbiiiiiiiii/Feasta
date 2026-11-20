"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const candidates = [
  "../lib/bookings/multi-provider-transaction-reader.js",
  "../lib/src/bookings/multi-provider-transaction-reader.js",
  "../dist/bookings/multi-provider-transaction-reader.js",
  "../dist/src/bookings/multi-provider-transaction-reader.js",
];

const compiled = candidates
  .map((candidate) => path.resolve(__dirname, candidate))
  .find((candidate) => fs.existsSync(candidate));

assert.ok(compiled, "Compiled transaction reader missing.");

// Initialize an isolated local Firebase Admin app before importing
// backend modules that call getFirestore() at module load time.
//
// The transaction object used by these tests is fully mocked.
// No production project, emulator, or network connection is used.
const {initializeApp, getApps} = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp({
    projectId: "demo-feasta-multi-provider-unit-test",
  });
}

const {
  readTrustedMultiProviderPackages,
} = require(compiled);

assert.equal(typeof readTrustedMultiProviderPackages, "function");

function envelope() {
  const event = {
    eventType: "wedding",
    eventDate: "2026-12-20",
    eventTime: "10:00",
    eventEndTime: "18:00",
    guestCount: 100,
    eventLocation: "Ormoc City",
    eventAddress: "Ormoc City, Leyte",
    specialRequest: "",
  };

  function selection(providerId, packageId) {
    return {
      providerId,
      packageId,
      configuration: {
        event: {...event},
        selectedFoods: [],
        selectedDecorations: [],
        selectedFurniture: [],
        foodChoiceSelections: [],
        selectedEventServices: [],
        selectedAddOns: [],
      },
    };
  }

  return {
    schemaVersion: 1,
    clientRequestId: "feasta_request_001",
    event,
    selections: [
      selection("provider_001", "package_001"),
      selection("provider_002", "package_002"),
    ],
  };
}

function mockFirestore(records = {}) {
  const calls = [];

  const firestore = {
    collection(name) {
      return {
        doc(id) {
          return {path: `${name}/${id}`};
        },
      };
    },
  };

  const transaction = {
    async get(reference) {
      calls.push(reference.path);
      const exists = Object.prototype.hasOwnProperty.call(
        records, reference.path,
      );

      return {
        id: reference.path.split("/").pop(),
        exists,
        data: () => exists ? records[reference.path] : undefined,
      };
    },
    set() {
      throw new Error("Unexpected Firestore write");
    },
    create() {
      throw new Error("Unexpected Firestore write");
    },
    update() {
      throw new Error("Unexpected Firestore write");
    },
    delete() {
      throw new Error("Unexpected Firestore write");
    },
  };

  return {firestore, transaction, calls};
}

function availableRecords() {
  return {
    "providers/provider_001": {},
    "providers/provider_002": {},
    "packages/package_001": {},
    "packages/package_002": {},
  };
}

async function mustReject(operation, message) {
  await assert.rejects(operation, (error) => {
    assert.match(error.message, message);
    return true;
  });
}

test("rejects a missing provider", async () => {
  const records = availableRecords();
  delete records["providers/provider_002"];
  const mock = mockFirestore(records);

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: envelope(),
    }),
    /provider or package is unavailable/i,
  );

  assert.ok(mock.calls.includes("providers/provider_002"));
});

test("rejects a missing package", async () => {
  const records = availableRecords();
  delete records["packages/package_001"];
  const mock = mockFirestore(records);

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: envelope(),
    }),
    /provider or package is unavailable/i,
  );

  assert.ok(mock.calls.includes("packages/package_001"));
});

test("rejects a provider lacking operational approval", async () => {
  const mock = mockFirestore(availableRecords());

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: envelope(),
    }),
    /selected provider is unavailable/i,
  );

  assert.ok(mock.calls.includes("providers/provider_001"));
});

test("rejects duplicate provider IDs before Firestore reads", async () => {
  const payload = envelope();
  payload.selections[1].providerId =
    payload.selections[0].providerId;

  const mock = mockFirestore(availableRecords());

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: payload,
    }),
    /duplicate provider/i,
  );

  assert.equal(mock.calls.length, 0);
});

test("rejects a single provider before Firestore reads", async () => {
  const payload = envelope();
  payload.selections.pop();

  const mock = mockFirestore(availableRecords());

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: payload,
    }),
    /multi-provider submission is invalid/i,
  );

  assert.equal(mock.calls.length, 0);
});

test("rejects more than four selections before Firestore reads", async () => {
  const payload = envelope();

  for (let index = 3; index <= 5; index++) {
    payload.selections.push({
      ...payload.selections[0],
      providerId: `provider_00${index}`,
      packageId: `package_00${index}`,
    });
  }

  const mock = mockFirestore(availableRecords());

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: payload,
    }),
    /multi-provider submission is invalid/i,
  );

  assert.equal(mock.calls.length, 0);
});

test("rejects a missing provider owner", async () => {
  const records = availableRecords();

  records["providers/provider_001"] = {
    ownerId: "owner_001",
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  };

  records["providers/provider_002"] = {
    ownerId: "owner_002",
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  };

  const mock = mockFirestore(records);

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: envelope(),
    }),
    /provider or owner is unavailable/i,
  );

  assert.ok(mock.calls.includes("users/owner_001"));
  assert.ok(mock.calls.includes("users/owner_002"));
});

test("rejects a blocked provider owner", async () => {
  const records = availableRecords();

  for (let index = 1; index <= 2; index++) {
    const suffix = `00${index}`;

    records[`providers/provider_${suffix}`] = {
      ownerId: `owner_${suffix}`,
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
      isDeleted: false,
      businessName: "FEASTA Test Provider",
      description: "Event services",
      address: "Ormoc City",
      city: "Ormoc",
      province: "Leyte",
      providerServiceType: "catering",
    };

    records[`users/owner_${suffix}`] = {
      role: "provider",
      providerId: `provider_${suffix}`,
      accountStatus: "active",
      isActive: true,
      isBlocked: index === 1,
    };
  }

  const mock = mockFirestore(records);

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: envelope(),
    }),
    /provider or owner is unavailable/i,
  );

  assert.ok(mock.calls.includes("users/owner_001"));
});

function approvedPackageRecords() {
  const records = availableRecords();

  for (let index = 1; index <= 2; index++) {
    const suffix = `00${index}`;
    const providerId = `provider_${suffix}`;
    const ownerId = `owner_${suffix}`;
    const packageId = `package_${suffix}`;

    records[`providers/${providerId}`] = {
      ownerId,
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
      isDeleted: false,
      publiclyVisible: true,
      businessName: `Provider ${index}`,
      description: "Event catering services",
      address: "Ormoc City",
      city: "Ormoc",
      province: "Leyte",
      providerServiceType: "catering",
    };

    records[`users/${ownerId}`] = {
      role: "provider",
      providerId,
      accountStatus: "active",
      isActive: true,
      isBlocked: false,
    };

    records[`packages/${packageId}`] = {
      providerId,
      name: `Wedding Package ${index}`,
      status: "published",
      isPublished: true,
      isActive: true,
      isDeleted: false,
      providerPubliclyVisible: true,
      eventType: "wedding",
      eventTypes: ["wedding"],
      minimumGuests: 25,
      maximumGuests: 200,
      price: 15000,
      foodInclusions: ["Rice"],
      decorInclusions: ["Backdrop"],
      furnitureInclusions: ["Tables"],
      serviceInclusions: [],
      themeOptions: [],
    };
  }

  return records;
}

test("accepts two approved providers with published packages", async () => {
  const mock = mockFirestore(approvedPackageRecords());

  const result = await readTrustedMultiProviderPackages({
    ...mock,
    envelope: envelope(),
  });

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((item) => item.providerId),
    ["provider_001", "provider_002"],
  );
  assert.deepEqual(
    result.map((item) => item.providerOwnerId),
    ["owner_001", "owner_002"],
  );
  assert.deepEqual(
    result.map((item) => item.resolved.basePrice),
    [15000, 15000],
  );

  for (const id of ["owner_001", "owner_002"]) {
    assert.ok(mock.calls.includes(`users/${id}`));
  }

  assert.equal(mock.calls.length, 6);
});

test("rejects mismatched provider owner linkage", async () => {
  const records = approvedPackageRecords();

  records["users/owner_002"].providerId = "provider_001";

  const mock = mockFirestore(records);

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: envelope(),
    }),
    /provider or owner is unavailable/i,
  );
});

test("rejects a package owned by a different provider", async () => {
  const records = approvedPackageRecords();

  records["packages/package_002"].providerId = "provider_001";

  const mock = mockFirestore(records);

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: envelope(),
    }),
    /package cannot be booked|package is unavailable/i,
  );
});

function approvedPackageRecords() {
  const records = availableRecords();

  for (let index = 1; index <= 2; index++) {
    const suffix = `00${index}`;
    const providerId = `provider_${suffix}`;
    const ownerId = `owner_${suffix}`;
    const packageId = `package_${suffix}`;

    records[`providers/${providerId}`] = {
      ownerId,
      verificationStatus: "approved",
      isActive: true,
      isSuspended: false,
      isDeleted: false,
      publiclyVisible: true,
      businessName: `Provider ${index}`,
      description: "Event catering services",
      address: "Ormoc City",
      city: "Ormoc",
      province: "Leyte",
      providerServiceType: "catering",
    };

    records[`users/${ownerId}`] = {
      role: "provider",
      providerId,
      accountStatus: "active",
      isActive: true,
      isBlocked: false,
    };

    records[`packages/${packageId}`] = {
      providerId,
      name: `Wedding Package ${index}`,
      status: "published",
      isPublished: true,
      isActive: true,
      isDeleted: false,
      providerPubliclyVisible: true,
      eventType: "wedding",
      eventTypes: ["wedding"],
      minimumGuests: 25,
      maximumGuests: 200,
      price: 15000,
      foodInclusions: ["Rice"],
      decorInclusions: ["Backdrop"],
      furnitureInclusions: ["Tables"],
      serviceInclusions: [],
      themeOptions: [],
    };
  }

  return records;
}

test("rejects V2 packages with missing contract metadata", async () => {
  const records = approvedPackageRecords();

  // A V2 marker on the stored package is authoritative.
  // The client cannot make it a legacy package by omitting metadata.
  records["packages/package_001"].occasionSchemaVersion = 2;
  records["packages/package_001"].revision = 3;

  const mock = mockFirestore(records);

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: envelope(),
    }),
    /verified package metadata/i,
  );

  assert.ok(mock.calls.includes("packages/package_001"));
});

test("rejects unpublished V2 packages through actual V2 admission", async () => {
  const records = approvedPackageRecords();
  const payload = envelope();

  const stored = records["packages/package_001"];

  Object.assign(stored, {
    occasionSchemaVersion: 2,
    offerSchemaVersion: 2,
    sharedContractVersion: 2,
    revision: 3,
    status: "draft",
    isPublished: false,
    publishedAt: null,
  });

  payload.selections[0].configuration.sharedContractVersion = 2;
  payload.selections[0].configuration.expectedPackageRevision = 3;

  const mock = mockFirestore(records);

  await mustReject(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: payload,
    }),
    /package is unavailable or changed/i,
  );

  assert.ok(mock.calls.includes("packages/package_001"));
});

function v2GateFixture(customerDiscovery, customerBooking) {
  const records = approvedPackageRecords();
  const payload = envelope();

  Object.assign(records["packages/package_001"], {
    sharedContractVersion: 2,
    occasionSchemaVersion: 2,
    offerSchemaVersion: 2,
    revision: 3,
    publishedAt: "2026-11-01T08:00:00.000Z",
  });

  payload.selections[0].configuration.sharedContractVersion = 2;
  payload.selections[0].configuration.expectedPackageRevision = 3;

  records["contractPolicies/providerPackageV2"] = {
    revision: 1,
    effectiveEnvironment: "demo-feasta-multi-provider-unit-test",
    featureGates: {
      customerDiscovery,
      customerBooking,
    },
  };

  return {records, payload};
}

async function expectV2GateRejection(customerDiscovery, customerBooking) {
  const fixture = v2GateFixture(customerDiscovery, customerBooking);
  const mock = mockFirestore(fixture.records);

  // A local project identifier is used only for comparison against
  // the mocked policy. Firestore transactions remain fully mocked.
  const previous = process.env.GCLOUD_PROJECT;

  try {
    process.env.GCLOUD_PROJECT =
      "demo-feasta-multi-provider-unit-test";

    await assert.rejects(
      () => readTrustedMultiProviderPackages({
        ...mock,
        envelope: fixture.payload,
      }),
      (error) => {
        assert.equal(error.code, "failed-precondition");
        assert.equal(error.details?.reason, "PACKAGE_V2_UNAVAILABLE");
        return true;
      },
    );
  } finally {
    if (previous === undefined) {
      delete process.env.GCLOUD_PROJECT;
    } else {
      process.env.GCLOUD_PROJECT = previous;
    }
  }

  assert.ok(
    mock.calls.includes("contractPolicies/providerPackageV2"),
    "V2 booking admission must read the trusted feature gates",
  );

  assert.equal(
    mock.calls.includes("occasionCatalog/current"),
    false,
    "Disabled booking gates must reject before occasion admission",
  );
}

test("rejects V2 bookings when customer discovery is disabled", async () => {
  await expectV2GateRejection(false, true);
});

test("rejects V2 bookings when customer booking is disabled", async () => {
  await expectV2GateRejection(true, false);
});