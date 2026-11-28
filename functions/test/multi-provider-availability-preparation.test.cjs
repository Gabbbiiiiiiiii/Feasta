"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const authorityPath = require.resolve(
  "../lib/provider-availability/validate-provider-availability.js",
);

const modulePath = require.resolve(
  "../lib/bookings/multi-provider-availability-preparation.js",
);

const authority = require(authorityPath);
const original = authority.validateProviderAvailability;

const calls = [];

authority.validateProviderAvailability = (input) => {
  calls.push(input);

  if (input.providerData?.testUnavailable === true) {
    return {
      available: false,
      issues: [{
        code: "BLOCKED_DATE",
        message: "Provider is unavailable.",
      }],
    };
  }

  return {available: true, issues: []};
};

delete require.cache[modulePath];

const {
  prepareMultiProviderAvailability,
} = require(modulePath);

function candidates() {
  return [1, 2].map((index) => ({
    providerId: `provider_00${index}`,
    providerData: {testUnavailable: false},
    request: {
      providerRequestId: `request_00${index}`,
      type: "catering",
      eventDate: new Date("2026-12-20T00:00:00+08:00"),
      eventTime: "10:00",
      eventEndTime: "18:00",
      guestCount: 100,
      services: [{name: `Package ${index}`}],
    },
    existingBookings: [],
  }));
}

const now = new Date("2026-12-15T10:00:00+08:00");

test("passes every provider to the existing availability authority", () => {
  calls.length = 0;

  const input = candidates();
  const result = prepareMultiProviderAvailability({
    candidates: input,
    now,
  });

  assert.equal(result.length, 2);
  assert.ok(result.every((item) => item.result.available));
  assert.equal(calls.length, 2);
  assert.strictEqual(calls[0].now, now);
  assert.strictEqual(calls[1].now, now);
  assert.strictEqual(calls[0].existingBookings, input[0].existingBookings);
  assert.strictEqual(calls[1].existingBookings, input[1].existingBookings);
  assert.strictEqual(calls[0].providerData, input[0].providerData);
});

test("one unavailable provider rejects the entire preparation", () => {
  calls.length = 0;
  const input = candidates();

  input[1].providerData.testUnavailable = true;

  assert.throws(
    () => prepareMultiProviderAvailability({candidates: input, now}),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.equal(
        error.details?.reason,
        "multi-provider-availability-failed",
      );
      assert.equal(error.details?.providerId, "provider_002");
      assert.ok(error.details?.issueCodes.includes("BLOCKED_DATE"));
      return true;
    },
  );

  assert.equal(calls.length, 2);
});

test("duplicate provider IDs fail before validation", () => {
  calls.length = 0;
  const input = candidates();

  input[1].providerId = input[0].providerId;

  assert.throws(() =>
    prepareMultiProviderAvailability({candidates: input, now}),
  );

  assert.equal(calls.length, 0);
});

test("duplicate request IDs fail before validation", () => {
  calls.length = 0;
  const input = candidates();

  input[1].request.providerRequestId =
    input[0].request.providerRequestId;

  assert.throws(() =>
    prepareMultiProviderAvailability({candidates: input, now}),
  );

  assert.equal(calls.length, 0);
});

test("inconsistent shared dates fail before validation", () => {
  calls.length = 0;
  const input = candidates();

  input[1].request.eventDate =
    new Date("2026-12-21T00:00:00+08:00");

  assert.throws(() =>
    prepareMultiProviderAvailability({candidates: input, now}),
  );

  assert.equal(calls.length, 0);
});

test("inconsistent times and guests fail before validation", () => {
  for (const change of [
    (input) => { input[1].request.eventTime = "11:00"; },
    (input) => { input[1].request.eventEndTime = "19:00"; },
    (input) => { input[1].request.guestCount = 101; },
  ]) {
    calls.length = 0;
    const input = candidates();
    change(input);

    assert.throws(() =>
      prepareMultiProviderAvailability({candidates: input, now}),
    );

    assert.equal(calls.length, 0);
  }
});

test("invalid provider counts and server time fail closed", () => {
  for (const input of [
    candidates().slice(0, 1),
    [...candidates(), ...candidates(), ...candidates()],
  ]) {
    calls.length = 0;

    assert.throws(() =>
      prepareMultiProviderAvailability({candidates: input, now}),
    );

    assert.equal(calls.length, 0);
  }

  assert.throws(() =>
    prepareMultiProviderAvailability({
      candidates: candidates(),
      now: new Date(NaN),
    }),
  );
});

test("occupancy records are forwarded without changing their status", () => {
  calls.length = 0;

  const input = candidates();

  const occupancy = [{
    providerRequestId: "previous_001",
    status: "payment_processing",
    eventTime: "10:00",
    eventEndTime: "18:00",
    reconciliationRequired: true,
  }];

  input[0].existingBookings = occupancy;

  prepareMultiProviderAvailability({candidates: input, now});

  assert.strictEqual(calls[0].existingBookings, occupancy);
  assert.equal(
    calls[0].existingBookings[0].reconciliationRequired,
    true,
  );
});

test.after(() => {
  authority.validateProviderAvailability = original;
  delete require.cache[modulePath];
});