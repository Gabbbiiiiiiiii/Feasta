const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");
const {
  getApps,
  initializeApp,
} = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp({
    projectId: "demo-feasta-provider-bookings",
  });
}

const {
  authorizeProviderRequest,
} = require(
  "../lib/provider-requests/provider-request-authorization.js",
);
const {
  calculateMainEventRequestSummary,
} = require(
  "../lib/provider-requests/recalculate-main-event-status.js",
);
const {
  assertLifecycleTransition,
} = require(
  "../lib/provider-requests/update-provider-booking-lifecycle.js",
);

test("provider ownership and approval are required", () => {
  const request = document("request_owned", {
    providerRequestId: "request_owned",
    mainEventId: "event_owned",
    customerId: "customer_owned",
    providerId: "provider_owned",
    type: "catering",
    status: "confirmed",
    amount: 1000,
    downPaymentAmount: 200,
    eventDate: new Date(),
    eventTime: "10:00",
    eventEndTime: "14:00",
    guestCount: 50,
  });
  const approvedProvider = document("provider_owned", {
    ownerId: "provider_owner",
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  });

  assert.equal(
    authorizeProviderRequest({
      actorUid: "provider_owner",
      providerRequestSnapshot: request,
      providerSnapshot: approvedProvider,
    }).providerId,
    "provider_owned",
  );
  assert.throws(
    () => authorizeProviderRequest({
      actorUid: "different_owner",
      providerRequestSnapshot: request,
      providerSnapshot: approvedProvider,
    }),
    (error) => error.code === "permission-denied",
  );
  assert.throws(
    () => authorizeProviderRequest({
      actorUid: "provider_owner",
      providerRequestSnapshot: request,
      providerSnapshot: document("provider_owned", {
        ...approvedProvider.data(),
        verificationStatus: "under_review",
        isActive: false,
      }),
    }),
    (error) => error.code === "failed-precondition",
  );
});

test("only canonical lifecycle transitions are accepted", () => {
  assert.doesNotThrow(() =>
    assertLifecycleTransition(
      "confirmed",
      "confirmed",
      "in_progress",
    ),
  );
  assert.doesNotThrow(() =>
    assertLifecycleTransition(
      "in_progress",
      "in_progress",
      "completed",
    ),
  );
  assert.throws(
    () => assertLifecycleTransition(
      "pending",
      "pending_provider_approval",
      "in_progress",
    ),
    (error) => error.code === "failed-precondition",
  );
  assert.throws(
    () => assertLifecycleTransition(
      "confirmed",
      "confirmed",
      "completed",
    ),
    (error) => error.code === "failed-precondition",
  );
});

test("partial completion keeps the main event in progress", () => {
  const requests = [
    queryDocument("request_one", "in_progress"),
    queryDocument("request_two", "confirmed"),
  ];
  const summary = calculateMainEventRequestSummary(
    requests,
    "in_progress",
    [{
      providerRequestId: "request_one",
      status: "completed",
    }],
  );

  assert.equal(summary.status, "in_progress");
  assert.equal(summary.completedProviderRequestCount, 1);
  assert.equal(summary.confirmedProviderRequestCount, 1);
});

test("all completed requests complete the main event", () => {
  const requests = [
    queryDocument("request_one", "in_progress"),
    queryDocument("request_two", "completed"),
  ];
  const summary = calculateMainEventRequestSummary(
    requests,
    "in_progress",
    [{
      providerRequestId: "request_one",
      status: "completed",
    }],
  );

  assert.equal(summary.status, "completed");
  assert.equal(summary.completedProviderRequestCount, 2);
});

test("Customer cancellation is isolated from active sibling Providers", () => {
  const active = calculateMainEventRequestSummary([
    queryDocument("request_a", "cancelled"),
    queryDocument("request_b", "confirmed"),
    queryDocument("request_c", "confirmed"),
  ], "confirmed");
  assert.equal(active.status, "confirmed");
  assert.equal(active.cancelledProviderRequestCount, 1);

  const completed = calculateMainEventRequestSummary([
    queryDocument("request_a", "cancelled"),
    queryDocument("request_b", "completed"),
    queryDocument("request_c", "completed"),
  ], "in_progress");
  assert.equal(completed.status, "completed");

  const cancelled = calculateMainEventRequestSummary([
    queryDocument("request_a", "cancelled"),
    queryDocument("request_b", "cancelled"),
    queryDocument("request_c", "cancelled"),
  ], "confirmed");
  assert.equal(cancelled.status, "cancelled");
});

test("lifecycle callables preserve atomic side effects", () => {
  const source = readFileSync(
    join(
      __dirname,
      "../src/provider-requests/update-provider-booking-lifecycle.ts",
    ),
    "utf8",
  );

  assert.match(source, /requireAuth\(request\)/u);
  assert.match(source, /requireRole\(actor\.uid/u);
  assert.match(source, /authorizeProviderRequest\(/u);
  assert.match(source, /db\.runTransaction\(/u);
  assert.match(source, /\.collection\("timeline"\)/u);
  assert.match(source, /writeAuditLogInTransaction\(/u);
  assert.match(source, /createNotificationInTransaction\(/u);
  assert.match(source, /assertRefundEligibilityUnlocked/u);
  assert.match(source, /activeCancellationRequestId/u);
  assert.match(source, /legacyActiveCancellationRequestId/u);
  assert.match(source, /service_started/u);
  assert.match(source, /refund_eligibility\.stage_advanced/u);
  assert.match(source, /providerRequestIds/u);
  assert.doesNotMatch(source, /collection\("bookings"\)/u);
});

function document(id, data) {
  return {
    id,
    exists: true,
    data: () => data,
  };
}

function queryDocument(id, status) {
  return {
    id,
    data: () => ({status}),
  };
}
