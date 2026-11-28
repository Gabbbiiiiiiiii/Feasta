"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Only a dummy project identifier is permitted in this test process.
const projectId = "demo-feasta-multi-provider-v2-test";
process.env.GCLOUD_PROJECT = projectId;
process.env.GCP_PROJECT = projectId;

const {initializeApp, getApps} = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp({projectId});
}

const candidates = [
  "../lib/bookings/multi-provider-transaction-reader.js",
  "../lib/src/bookings/multi-provider-transaction-reader.js",
  "../dist/bookings/multi-provider-transaction-reader.js",
  "../dist/src/bookings/multi-provider-transaction-reader.js",
];

const compiled = candidates
  .map((relative) => path.resolve(__dirname, relative))
  .find((candidate) => fs.existsSync(candidate));

assert.ok(compiled, "Compiled transaction reader not found.");

const {
  readTrustedMultiProviderPackages,
} = require(compiled);

function makeEnvelope() {
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

  return {
    schemaVersion: 1,
    clientRequestId: "feasta_v2_success_001",
    event,
    selections: [1, 2].map((index) => ({
      providerId: `provider_00${index}`,
      packageId: `package_00${index}`,
      configuration: {
        event: {...event},
        sharedContractVersion: 2,
        expectedPackageRevision: 3,
        serviceTier: "drop_off",
        packageThemeId: null,
        selectedFoods: [],
        selectedDecorations: [],
        selectedFurniture: [],
        foodChoiceSelections: [],
        selectedEventServices: [],
        selectedAddOns: [],
      },
    })),
  };
}

function makeRecords() {
  const records = Object.create(null);

  records["contractPolicies/providerPackageV2"] = {
    revision: 1,
    effectiveEnvironment: projectId,
    maxSpecificOccasions: 10,
    maxThemeImages: 4,
    featureGates: {
      packageDraftWrites: true,
      packagePublication: true,
      customerDiscovery: true,
      customerBooking: true,
    },
  };

  records["maintenanceControls/intake"] = {
    schemaVersion: 1,
    revision: 1,
    intake: false,
    publication: false,
  };

  records["appSettings/platform"] = {
    minimumDepositRateBps: 2000,
    maximumDepositRateBps: 8000,
  };

  records["occasionCatalog/current"] = {
    revision: 7,
    activationState: "stable",
  };

  records["serviceCategories/catering_service"] = {
    code: "catering_service",
    name: "Catering",
    serviceType: "catering",
    status: "active",
  };

  records["occasions/wedding"] = {
    id: "wedding",
    label: "Wedding",
    active: true,
    moderationState: "approved",
    sortOrder: 0,
    revision: 1,
    applicableServiceCategoryCodes: ["catering_service"],
  };

  for (const index of [1, 2]) {
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
      isBlocked: false,
      publiclyVisible: true,
      businessName: `Provider ${index}`,
      description: "Professional catering for celebrations.",
      address: "Ormoc City",
      city: "Ormoc",
      province: "Leyte",
      providerServiceType: "catering",
      serviceCategories: ["catering_service"],
      operatingDays: [
        "monday", "tuesday", "wednesday", "thursday",
        "friday", "saturday", "sunday",
      ],
      bookingLeadTimeDays: 0,
      minGuestsPerEvent: 1,
      maxGuestsPerEvent: 200,
      eventTypesSupported: ["wedding"],
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
      name: `Wedding Catering ${index}`,
      description: "A complete catering package for weddings.",
      serviceCategoryCode: "catering_service",
      eventType: "wedding",
      eventTypes: ["wedding"],
      sharedContractVersion: 2,
      occasionSchemaVersion: 2,
      offerSchemaVersion: 2,
      offerStructure: "fixed",
      packageStyle: "Wedding Catering",
      pricingModel: "per_bundle",
      occasionScope: "specific",
      occasionIds: ["wedding"],
      occasionMatchIds: ["wedding"],
      occasionCatalogRevision: 7,
      providerEligibilityRevision: 1,
      occasionEligibilityState: "valid",
      revision: 3,
      status: "published",
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
      isDeleted: false,
      publishedAt: "2026-11-01T08:00:00.000Z",
      price: 15000,
      serviceOptions: {
        drop_off: {
          price: 15000,
          includedServices: ["Delivery"],
          decorInclusions: [],
          furnitureInclusions: [],
          equipmentInclusions: [],
        },
      },
      themeOptions: [],
      foodChoiceGroups: [],
      foodInclusions: ["Rice"],
      serviceInclusions: [],
      decorInclusions: [],
      furnitureInclusions: [],
      equipmentInclusions: [],
      minimumGuests: 25,
      maximumGuests: 150,
      imageUrl: "",
      imageUrls: [],
      paymentTermsSchemaVersion: 2,
      paymentPolicy: "full_payment",
      depositPercentage: 100,
      balanceDueDaysBeforeEvent: null,
      balanceDueHoursBeforeEvent: null,
    };
  }

  return records;
}

function makeTransaction(records) {
  const reads = [];
  const allowed = new Set(Object.keys(records));

  const firestore = {
    collection(collectionName) {
      return {
        doc(id) {
          return {path: `${collectionName}/${id}`, id};
        },
      };
    },
  };

  const transaction = {
    async get(reference) {
      // Firestore document references expose .path, but collection
      // Query objects use internal query options. Recognize only
      // the specific occasions query required by V2 admission.
      const isOccasionsQuery =
        reference?.path === undefined &&
        reference?._queryOptions?.collectionId === "occasions";

      const refPath = isOccasionsQuery
        ? "occasions"
        : reference?.path;

      assert.equal(
        typeof refPath,
        "string",
        "Unexpected Firestore reference or query",
      );

      reads.push(refPath);

      if (isOccasionsQuery) {
        assert.equal(
          reference._queryOptions.limit,
          1001,
          "Unexpected occasions query limit",
        );
        const docs = Object.entries(records)
          .filter(([key, value]) =>
            key.startsWith("occasions/") &&
            !key.slice("occasions/".length).includes("/") &&
            value.active === true,
          )
          .map(([key, value]) => ({
            id: key.slice("occasions/".length),
            exists: true,
            data: () => value,
          }));

        assert.ok(docs.length <= 1000);

        return {
          docs,
          size: docs.length,
          empty: docs.length === 0,
        };
      }

      assert.ok(
        allowed.has(refPath),
        `Unexpected transaction read: ${refPath}`,
      );

      const record = records[refPath];

      return {
        id: refPath.split("/").pop(),
        exists: record !== undefined,
        data: () => record,
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

  return {transaction, firestore, reads};
}

test("accepts two fully eligible V2 packages", async () => {
  const records = makeRecords();
  const mock = makeTransaction(records);

  const result = await readTrustedMultiProviderPackages({
    ...mock,
    envelope: makeEnvelope(),
  });

  assert.equal(result.length, 2);

  assert.deepEqual(
    result.map((row) => row.providerId),
    ["provider_001", "provider_002"],
  );

  assert.deepEqual(
    result.map((row) => row.providerOwnerId),
    ["owner_001", "owner_002"],
  );

  assert.deepEqual(
    result.map((row) => row.resolved.verifiedV2),
    [true, true],
  );

  assert.deepEqual(
    result.map((row) => row.resolved.basePrice),
    [15000, 15000],
  );

  for (const requiredRead of [
    "contractPolicies/providerPackageV2",
    "maintenanceControls/intake",
    "appSettings/platform",
    "occasionCatalog/current",
    "serviceCategories/catering_service",
    "occasions",
  ]) {
    assert.ok(
      mock.reads.includes(requiredRead),
      `Missing authoritative read: ${requiredRead}`,
    );
  }
});

test("rejects a stale V2 package revision", async () => {
  const records = makeRecords();
  const payload = makeEnvelope();
  const mock = makeTransaction(records);

  payload.selections[0].configuration.expectedPackageRevision = 2;

  await assert.rejects(
    () => readTrustedMultiProviderPackages({
      ...mock,
      envelope: payload,
    }),
    (error) => {
      assert.ok(error.code, "Expected a structured booking error");
      return true;
    },
  );
});