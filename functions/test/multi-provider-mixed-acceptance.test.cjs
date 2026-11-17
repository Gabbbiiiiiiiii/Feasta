"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {Timestamp} = require("firebase-admin/firestore");

const {
  validateAcceptanceProviderRequest,
} = require("../lib/provider-requests/provider-request-integrity.js");

const EVENT_ID = "event_mixed_001";
const CUSTOMER_ID = "customer_mixed_001";
const CATERING_ID = "provider_catering_001";
const PHOTOGRAPHY_ID = "provider_photography_001";
const CATERING_REQUEST = "request_catering_001";
const PHOTOGRAPHY_REQUEST = "request_photography_001";
const PACKAGE_ID = "package_catering_001";
const SERVICE_ID = "service_photography_001";

const EVENT_DATE = Timestamp.fromDate(
  new Date("2027-06-18T00:00:00+08:00"),
);

const NOW = new Date("2027-06-17T12:00:00+08:00");

const packagePaymentTerms = {
  schemaVersion: 1,
  source: "canonical_package",
  paymentPolicy: "deposit_then_balance",
  depositRateBps: 3000,
  balanceDueDaysBeforeEvent: 7,
  usesLegacyPaymentTerms: false,
};

function common() {
  return {
    bookingId: EVENT_ID,
    mainEventId: EVENT_ID,
    customerId: CUSTOMER_ID,
    eventDate: EVENT_DATE,
    eventTime: "10:00",
    eventEndTime: "18:00",
    eventType: "Wedding",
    guestCount: 100,
    eventLocation: "Ormoc City",
    eventAddress: "Ormoc City, Leyte",
  };
}

function cateringRequest() {
  return {
    ...common(),
    providerRequestId: CATERING_REQUEST,
    providerId: CATERING_ID,
    type: "catering",
    status: "pending",
    assignmentKind: "independent_package",
    packageId: PACKAGE_ID,
    packageName: "Wedding Buffet",
    packageRevision: 1,
    packagePaymentTerms,
    services: [{
      serviceId: PACKAGE_ID,
      name: "Wedding Buffet",
      category: "catering_package",
      price: 10000,
      downPaymentPercentage: 30,
      downPaymentAmount: 3000,
    }],
    amount: 10000,
    downPaymentPercentage: 30,
    downPaymentAmount: 3000,
    remainingBalance: 7000,
  };
}

function photographyRequest() {
  return {
    ...common(),
    providerRequestId: PHOTOGRAPHY_REQUEST,
    providerId: PHOTOGRAPHY_ID,
    type: "addon",
    status: "pending",
    assignmentKind: "independent_marketplace_service",
    packageId: null,
    packageName: null,
    packagePaymentTerms: null,
    services: [{
      serviceId: SERVICE_ID,
      name: "Wedding Photography",
      category: "photographer",
      price: 12000,
      downPaymentPercentage: 100,
      downPaymentAmount: 12000,
    }],
    amount: 12000,
    downPaymentPercentage: 100,
    downPaymentAmount: 12000,
    remainingBalance: 0,
  };
}

function photographySelection() {
  return {
    addonId: SERVICE_ID,
    providerId: PHOTOGRAPHY_ID,
    ownerId: "owner_photography_001",
    name: "Wedding Photography",
    category: "photographer",
    price: 12000,
    downPaymentPercentage: 100,
    source: "marketplace",
  };
}

function fixture() {
  const food = cateringRequest();
  const photo = photographyRequest();

  const cateringAssignment = {
    kind: "catering_package",
    providerRequestId: CATERING_REQUEST,
    providerId: CATERING_ID,
    packageId: PACKAGE_ID,
    packageName: food.packageName,
    packageRevision: food.packageRevision,
    packagePaymentTerms,
    services: structuredClone(food.services),
    amount: food.amount,
    downPaymentAmount: food.downPaymentAmount,
    remainingBalance: food.remainingBalance,
    downPaymentPercentage: food.downPaymentPercentage,
  };

  const photographyAssignment = {
    kind: "marketplace_service",
    providerRequestId: PHOTOGRAPHY_REQUEST,
    providerId: PHOTOGRAPHY_ID,
    packageId: null,
    packageName: null,
    packagePaymentTerms: null,
    serviceId: SERVICE_ID,
    services: structuredClone(photo.services),
    selectedAddOns: [photographySelection()],
    amount: photo.amount,
    downPaymentAmount: photo.downPaymentAmount,
    remainingBalance: photo.remainingBalance,
    downPaymentPercentage: photo.downPaymentPercentage,
  };

  const event = {
    ...common(),
    status: "pending_provider_approval",
    packageAssignmentVersion: 2,
    providerRequestIds: [
      CATERING_REQUEST,
      PHOTOGRAPHY_REQUEST,
    ],
    providerRequestCount: 2,
    providerAssignments: [
      cateringAssignment,
      photographyAssignment,
    ],
    // Aggregate compatibility fields must never determine
    // an individual provider's financial obligations.
    totalAmount: 22000,
    downPaymentAmount: 15000,
    remainingBalance: 7000,
    downPaymentPercentage: 68.18,
    selectedAddOns: [photographySelection()],
  };

  return {event, food, photo};
}

function validate(event, data) {
  return validateAcceptanceProviderRequest({
    authorized: {
      providerRequestId: data.providerRequestId,
      mainEventId: EVENT_ID,
      customerId: CUSTOMER_ID,
      providerId: data.providerId,
      providerOwnerId:
        data.type === "catering"
          ? "owner_catering_001"
          : "owner_photography_001",
      type: data.type,
      status: "pending",
      requestData: data,
      providerData: {},
    },
    mainEventData: event,
    now: NOW,
  });
}

test("v2 Catering acceptance uses its own package amounts", () => {
  const {event, food} = fixture();
  const result = validate(event, food);

  assert.equal(result.amount, 10000);
  assert.equal(result.downPaymentAmount, 3000);
  assert.equal(result.remainingBalance, 7000);
});

test("v2 Photography accepts the existing addonId snapshot", () => {
  const {event, photo} = fixture();
  const result = validate(event, photo);

  assert.equal(result.amount, 12000);
  assert.equal(result.downPaymentAmount, 12000);
  assert.equal(result.remainingBalance, 0);
});

test("v2 rejects tampered Photography price", () => {
  const {event, photo} = fixture();
  photo.amount = 9000;

  assert.throws(
    () => validate(event, photo),
    /linkage is invalid|financial snapshot is invalid/u,
  );
});

test("v2 rejects changed Photography service identity", () => {
  const {event, photo} = fixture();
  photo.services[0].serviceId = "service_forged_001";

  assert.throws(
    () => validate(event, photo),
    /service linkage is invalid/u,
  );
});

test("v2 rejects duplicate parent provider membership", () => {
  const {event, photo} = fixture();
  event.providerAssignments[1].providerId = CATERING_ID;

  assert.throws(
    () => validate(event, photo),
    /service linkage is invalid/u,
  );
});

test("v2 rejects missing provider-request membership", () => {
  const {event, photo} = fixture();
  event.providerRequestIds[1] = "request_unrelated_001";

  assert.throws(
    () => validate(event, photo),
    /service linkage is invalid/u,
  );
});

test("v2 rejects Photography package payment terms", () => {
  const {event, photo} = fixture();
  photo.packagePaymentTerms = packagePaymentTerms;
  event.providerAssignments[1].packagePaymentTerms =
    packagePaymentTerms;

  assert.throws(
    () => validate(event, photo),
    /service linkage is invalid|package payment terms are invalid/u,
  );
});

test("v2 rejects modified Catering package terms", () => {
  const {event, food} = fixture();
  food.packagePaymentTerms = {
    ...packagePaymentTerms,
    depositRateBps: 4000,
  };

  assert.throws(
    () => validate(event, food),
    /service linkage is invalid|package payment terms are invalid/u,
  );
});

test("v2 rejects an unsupported assignment kind", () => {
  const {event, photo} = fixture();
  event.providerAssignments[1].kind = "unknown";

  assert.throws(
    () => validate(event, photo),
    /service linkage is invalid/u,
  );
});