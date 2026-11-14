"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Support the repository's TypeScript output directory without
// modifying its existing build configuration.
const candidates = [
  "../lib/bookings/multi-provider-submission-contract.js",
  "../lib/src/bookings/multi-provider-submission-contract.js",
  "../dist/bookings/multi-provider-submission-contract.js",
  "../dist/src/bookings/multi-provider-submission-contract.js",
];

const compiled = candidates
  .map((item) => path.resolve(__dirname, item))
  .find((item) => fs.existsSync(item));

assert.ok(
  compiled,
  "Compiled contract not found. Run the Functions build first.",
);

const {
  parseMultiProviderSubmissionEnvelope,
} = require(compiled);

assert.equal(
  typeof parseMultiProviderSubmissionEnvelope,
  "function",
  "Expected submission parser export.",
);

function validEnvelope() {
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

function mustReject(value) {
  assert.throws(
    () => parseMultiProviderSubmissionEnvelope(value),
    "Invalid submission must be rejected.",
  );
}

test("accepts a consistent two-provider event", () => {
  const parsed = parseMultiProviderSubmissionEnvelope(
    validEnvelope(),
  );

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.selections.length, 2);
  assert.equal(parsed.event.eventDate, "2026-12-20");
});

test("rejects duplicate provider selections", () => {
  const payload = validEnvelope();
  payload.selections[1].providerId =
    payload.selections[0].providerId;

  mustReject(payload);
});

test("rejects conflicting provider event dates", () => {
  const payload = validEnvelope();
  payload.selections[1].configuration.event.eventDate =
    "2026-12-21";

  mustReject(payload);
});

test("rejects conflicting provider event times", () => {
  const payload = validEnvelope();
  payload.selections[1].configuration.event.eventTime =
    "11:00";

  mustReject(payload);
});

test("rejects conflicting provider guest counts", () => {
  const payload = validEnvelope();
  payload.selections[1].configuration.event.guestCount =
    120;

  mustReject(payload);
});

test("rejects missing saved event snapshot", () => {
  const payload = validEnvelope();
  delete payload.selections[0].configuration.event;

  mustReject(payload);
});

test("rejects malformed saved event snapshot", () => {
  const payload = validEnvelope();
  payload.selections[0].configuration.event = null;

  mustReject(payload);
});

test("rejects a single provider in multi-provider submission", () => {
  const payload = validEnvelope();
  payload.selections.pop();

  mustReject(payload);
});

test("rejects more than four provider selections", () => {
  const payload = validEnvelope();

  for (let i = 3; i <= 5; i++) {
    payload.selections.push({
      providerId: `provider_00${i}`,
      packageId: `package_00${i}`,
      configuration: {
        ...payload.selections[0].configuration,
        event: {...payload.event},
      },
    });
  }

  mustReject(payload);
});

test("rejects extra top-level authority fields", () => {
  const payload = validEnvelope();
  payload.totalPrice = 100;

  mustReject(payload);
});

test("rejects malformed submission identifiers", () => {
  const payload = validEnvelope();
  payload.clientRequestId = "bad id!";

  mustReject(payload);
});