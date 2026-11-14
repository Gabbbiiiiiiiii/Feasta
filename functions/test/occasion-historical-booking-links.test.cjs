const test = require("node:test");
const assert = require("node:assert/strict");

const {
  verifyHistoricalBookingLinks,
} = require("../lib/admin/occasion-historical-booking-links.js");

function booking(id = "booking_1", requestIds = ["request_1"]) {
  return {
    id,
    data: {
      bookingId: id,
      mainEventId: id,
      bookingCode: "BK-ABC1234567",
      submissionFingerprint: "a".repeat(64),
      submittedAt: "2026-10-01T10:00:00Z",
      status: "pending",
      eventType: "birthday",
      providerRequestIds: requestIds,
      providerRequestCount: requestIds.length,
    },
  };
}

function request(id = "request_1", mainEventId = "booking_1") {
  return {
    id,
    data: {
      mainEventId,
      eventType: "birthday",
      status: "pending",
    },
  };
}

test("valid submitted booking relationship is verified", () => {
  const result = verifyHistoricalBookingLinks({
    mainEvents: [booking()],
    providerRequests: [request()],
  });

  assert.deepEqual(result.verifiedBookingIds, ["booking_1"]);
  assert.deepEqual(result.unresolvedBookingIds, []);
  assert.deepEqual(result.orphanRequestIds, []);
  assert.equal(result.coverageVerified, false);
});

test("valid multi-provider booking is verified", () => {
  const result = verifyHistoricalBookingLinks({
    mainEvents: [booking("booking_1", ["request_1", "request_2"])],
    providerRequests: [request("request_1"), request("request_2")],
  });

  assert.deepEqual(result.verifiedBookingIds, ["booking_1"]);
  assert.deepEqual(result.orphanRequestIds, []);
});

test("missing provider request blocks verification", () => {
  const result = verifyHistoricalBookingLinks({
    mainEvents: [booking()],
    providerRequests: [],
  });

  assert.deepEqual(result.verifiedBookingIds, []);
  assert.deepEqual(result.unresolvedBookingIds, ["booking_1"]);
});

test("mismatched occasion blocks verification", () => {
  const result = verifyHistoricalBookingLinks({
    mainEvents: [booking()],
    providerRequests: [{
      ...request(),
      data: {...request().data, eventType: "wedding"},
    }],
  });

  assert.deepEqual(result.verifiedBookingIds, []);
  assert.deepEqual(result.unresolvedBookingIds, ["booking_1"]);
  assert.deepEqual(result.orphanRequestIds, ["request_1"]);
});

test("orphan provider request is identified", () => {
  const result = verifyHistoricalBookingLinks({
    mainEvents: [],
    providerRequests: [request()],
  });

  assert.deepEqual(result.orphanRequestIds, ["request_1"]);
  assert.equal(result.coverageVerified, false);
});

test("duplicate booking IDs are rejected", () => {
  assert.throws(
    () => verifyHistoricalBookingLinks({
      mainEvents: [booking(), booking()],
      providerRequests: [],
    }),
    /INVALID_HISTORICAL_BOOKING_INVENTORY/,
  );
});

test("duplicate provider request IDs are rejected", () => {
  assert.throws(
    () => verifyHistoricalBookingLinks({
      mainEvents: [],
      providerRequests: [request(), request()],
    }),
    /INVALID_HISTORICAL_REQUEST_INVENTORY/,
  );
});

test("customer planning draft is not a submitted booking", () => {
  const result = verifyHistoricalBookingLinks({
    mainEvents: [{
      id: "draft_1",
      data: {
        customerId: "customer_1",
        status: "draft",
        eventType: "birthday",
      },
    }],
    providerRequests: [],
  });

  assert.deepEqual(result.verifiedBookingIds, []);
  assert.deepEqual(result.unresolvedBookingIds, []);
  assert.equal(result.coverageVerified, false);
});
