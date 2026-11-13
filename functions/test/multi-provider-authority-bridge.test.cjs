"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Initialize Firebase Admin before loading the bridge's
// transitive Firestore imports. This does not connect to
// Firebase or run an emulator.
const {initializeApp, getApps} = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp({projectId: "feasta-task3-offline-tests"});
}

const bridge = require(
  "../lib/bookings/multi-provider-authority-bridge.js",
);

const {
  prepareTrustedMultiProviderSubmission,
} = bridge;

function baseInput(overrides = {}) {
  return {
    transaction: {
      get: async () => {
        throw new Error("Not expected for rejected input");
      },
    },
    firestore: {collection() {}},
    customerId: "customer_001",
    bookingId: "a".repeat(40),
    envelope: {
      schemaVersion: 1,
      clientRequestId: "request_20261112_001",
      event: {
        eventType: "birthday",
        eventDate: "2026-12-20",
        eventTime: "10:00",
        eventEndTime: "18:00",
        guestCount: 100,
        eventLocation: "Ormoc",
        eventAddress: "Ormoc City",
        specialRequest: "",
      },
      selections: [
        {providerId: "provider_001", packageId: "package_001", configuration: {}},
        {providerId: "provider_002", packageId: "package_002", configuration: {}},
      ],
    },
    submissionTime: new Date("2026-12-15T00:00:00Z"),
    loadRefundRollout: async () => ({
      exists: false,
      data: undefined,
    }),
    classifyTrustedRequest: () => ({
      type: "catering",
      services: [],
    }),
    ...overrides,
  };
}

test("rejects invalid server submission time before reads", async () => {
  await assert.rejects(
    prepareTrustedMultiProviderSubmission(
      baseInput({submissionTime: new Date(NaN)}),
    ),
    {code: "failed-precondition"},
  );
});

test("rejects malformed shared event date before reads", async () => {
  const input = baseInput();
  input.envelope.event.eventDate = "2026-02-30";

  await assert.rejects(
    prepareTrustedMultiProviderSubmission(input),
    {code: "failed-precondition"},
  );
});

test("rejects invalid customer or booking identity before reads", async () => {
  for (const override of [
    {customerId: "invalid customer"},
    {bookingId: "incorrect"},
  ]) {
    await assert.rejects(
      prepareTrustedMultiProviderSubmission(
        baseInput(override),
      ),
      {code: "failed-precondition"},
    );
  }
});

test("rejects unsupported provider counts before reads", async () => {
  for (const count of [1, 5]) {
    const input = baseInput();

    input.envelope.selections = Array.from(
      {length: count},
      (_, index) => ({
        providerId: `provider_00${index}`,
        packageId: `package_00${index}`,
        configuration: {},
      }),
    );

    await assert.rejects(
      prepareTrustedMultiProviderSubmission(input),
      {code: "failed-precondition"},
    );
  }
});