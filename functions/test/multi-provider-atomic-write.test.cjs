"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");

const {
  bookingOutcomeId,
} = require("../lib/bookings/submission-outcome.js");

const {
  validateMultiProviderAtomicWritePlan,
  createMultiProviderBookingAtomically,
} = require("../lib/bookings/multi-provider-atomic-write.js");

const customerId = "customer_001";
const clientRequestId = "request_20261112_001";
const fingerprint = "a".repeat(64);

function ref(collection, id) {
  return {
    id,
    path: `${collection}/${id}`,
  };
}

function requestId(bookingId, type, providerId) {
  return createHash("sha256")
    .update(`${bookingId}:${type}:${providerId}`)
    .digest("hex")
    .slice(0, 40);
}

function fixture(count = 2) {
  const bookingId = bookingOutcomeId(
    customerId,
    clientRequestId,
  );

  const requests = Array.from({length: count}, (_, index) => {
    const providerId = `provider_00${index + 1}`;
    const type = index === 0 ? "catering" : "addon";
    const id = requestId(bookingId, type, providerId);

    return {
      providerId,
      type,
      reference: ref("providerRequests", id),
      data: {
        providerRequestId: id,
        mainEventId: bookingId,
        bookingId,
        customerId,
        providerId,
        type,
        status: "pending",
        paymentStatus: "unpaid",
      },
    };
  });

  return {
    customerId,
    clientRequestId,
    submissionFingerprint: fingerprint,
    booking: {
      reference: ref("mainEvents", bookingId),
      data: {
        bookingId,
        mainEventId: bookingId,
        customerId,
        clientRequestId,
        submissionFingerprint: fingerprint,
        status: "pending_provider_approval",
        paymentStatus: "unpaid",
        providerRequestIds: requests.map(
          (request) => request.reference.id,
        ),
        providerRequestCount: count,
        pendingProviderRequestCount: count,
        confirmedProviderRequestCount: 0,
        rejectedProviderRequestCount: 0,
        completedProviderRequestCount: 0,
      },
    },
    requests,
    additionalCreates: [{
      reference: ref("occasionDependencies", "entry_001"),
      data: {kind: "submitted_booking"},
    }],
  };
}

function transaction() {
  const creates = [];

  return {
    creates,
    create(reference, data) {
      creates.push({reference, data});
    },
  };
}

test("creates one parent and two linked requests", () => {
  const plan = fixture();
  const tx = transaction();

  assert.doesNotThrow(() =>
    createMultiProviderBookingAtomically(tx, plan),
  );

  assert.equal(tx.creates.length, 4);
  assert.equal(tx.creates[0].reference.path, plan.booking.reference.path);

  for (let index = 0; index < 2; index++) {
    assert.equal(
      tx.creates[index + 1].reference.id,
      plan.booking.data.providerRequestIds[index],
    );
  }
});

test("supports four distinct provider requests", () => {
  const tx = transaction();

  createMultiProviderBookingAtomically(tx, fixture(4));

  assert.equal(tx.creates.length, 6);
});

test("rejects unsupported selection counts before writes", () => {
  for (const count of [1, 5]) {
    const tx = transaction();

    assert.throws(() =>
      createMultiProviderBookingAtomically(tx, fixture(count)),
    );

    assert.equal(tx.creates.length, 0);
  }
});

test("rejects mismatched provider request IDs before writes", () => {
  const plan = fixture();
  const tx = transaction();

  plan.requests[1].data.providerRequestId = "wrong_id";

  assert.throws(() =>
    createMultiProviderBookingAtomically(tx, plan),
  );

  assert.equal(tx.creates.length, 0);
});

test("rejects duplicate provider identities before writes", () => {
  const plan = fixture();
  const tx = transaction();

  plan.requests[1].providerId = plan.requests[0].providerId;

  assert.throws(() =>
    createMultiProviderBookingAtomically(tx, plan),
  );

  assert.equal(tx.creates.length, 0);
});

test("rejects stale parent linkage before writes", () => {
  const plan = fixture();
  const tx = transaction();

  plan.booking.data.providerRequestIds.reverse();

  assert.throws(() =>
    createMultiProviderBookingAtomically(tx, plan),
  );

  assert.equal(tx.creates.length, 0);
});

test("rejects mismatched customer or fingerprint before writes", () => {
  for (const change of [
    (plan) => {plan.booking.data.customerId = "other_customer";},
    (plan) => {plan.booking.data.submissionFingerprint = "b".repeat(64);},
  ]) {
    const plan = fixture();
    const tx = transaction();

    change(plan);

    assert.throws(() =>
      createMultiProviderBookingAtomically(tx, plan),
    );

    assert.equal(tx.creates.length, 0);
  }
});

test("rejects invalid parent status before writes", () => {
  const plan = fixture();
  const tx = transaction();

  plan.booking.data.status = "confirmed";

  assert.throws(() =>
    createMultiProviderBookingAtomically(tx, plan),
  );

  assert.equal(tx.creates.length, 0);
});

test("rejects duplicate additional document paths before writes", () => {
  const plan = fixture();
  const tx = transaction();

  plan.additionalCreates.push({
    reference: plan.booking.reference,
    data: {other: true},
  });

  assert.throws(() =>
    createMultiProviderBookingAtomically(tx, plan),
  );

  assert.equal(tx.creates.length, 0);
});

test("plan validation never writes anything", () => {
  assert.doesNotThrow(() =>
    validateMultiProviderAtomicWritePlan(fixture()),
  );
});