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
  areAllAssignedProvidersAccepted,
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

test("payment readiness requires every assigned Provider to accept", () => {
  const blockedStatuses = [
    "pending",
    "rejected",
    "cancelled",
    "expired",
  ];

  for (const blockedStatus of blockedStatuses) {
    const summary = calculateMainEventRequestSummary([
      queryDocument(
        "request_one",
        "waiting_for_down_payment",
      ),
      queryDocument(
        "request_two",
        blockedStatus,
      ),
    ], "waiting_for_down_payment");

    assert.equal(
      areAllAssignedProvidersAccepted(summary),
      false,
      blockedStatus,
    );
  }
});

test("payment readiness accepts all post-acceptance lifecycle states", () => {
  const summary = calculateMainEventRequestSummary([
    queryDocument(
      "request_accepted",
      "accepted",
    ),
    queryDocument(
      "request_waiting",
      "waiting_for_down_payment",
    ),
    queryDocument(
      "request_processing",
      "payment_processing",
    ),
    queryDocument(
      "request_confirmed",
      "confirmed",
    ),
    queryDocument(
      "request_progress",
      "in_progress",
    ),
    queryDocument(
      "request_completed",
      "completed",
    ),
  ], "waiting_for_down_payment");

  assert.equal(
    areAllAssignedProvidersAccepted(summary),
    true,
  );
});

test("payment readiness rejects an event without assigned Providers", () => {
  const summary =
    calculateMainEventRequestSummary(
      [],
      "pending_provider_approval",
    );

  assert.equal(
    areAllAssignedProvidersAccepted(summary),
    false,
  );
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
    assert.match(
    source,
    /areAllAssignedProvidersAccepted/u,
  );
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


test("cancelled, completed and already-started requests cannot transition to service start", () => {
  for (const status of ["cancelled", "completed", "in_progress"]) {
    assert.throws(() => assertLifecycleTransition(status, "confirmed", "in_progress"), {code: "failed-precondition"});
  }
});


test("Start Event callable enforces every guard against isolated in-memory records", async () => {
  const auth = require("../lib/shared/auth.js");
  const roles = require("../lib/shared/authorization.js");
  const rate = require("../lib/shared/rate-limit.js");
  const {db} = require("../lib/shared/firestore.js");
  const {markProviderBookingInProgress} = require("../lib/provider-requests/update-provider-booking-lifecycle.js");
  const saved = [auth.requireAuth, roles.requireRole, rate.enforceCallableRateLimit, db.collection, db.runTransaction];
  let actor = "owner_test", records, writes;
  auth.requireAuth = () => ({uid: actor});
  roles.requireRole = async () => {};
  rate.enforceCallableRateLimit = async () => {};
  const snapshot = (name, id) => ({id, exists: Boolean(records[name + "/" + id]), data: () => records[name + "/" + id]});
  db.collection = (name) => ({
    doc: (id) => ({name, id, get: async () => snapshot(name, id)}),
    where: () => ({query: true}),
  });
  db.runTransaction = async (callback) => callback({
    get: async (ref) => ref.query ? {size: 1, docs: [snapshot("providerRequests", "request_test")]} : snapshot(ref.name, ref.id),
    update: () => {writes++; throw Error("unexpected write");},
    create: () => {writes++; throw Error("unexpected write");},
  });
  try {
    for (const kind of ["future", "outstanding", "not_fully_settled", "malformed", "locked", "unauthorized", "cancelled", "completed", "in_progress"]) {
      actor = kind === "unauthorized" ? "another_owner" : "owner_test";
      writes = 0;
      const request = {
        providerRequestId: "request_test", mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test",
        providerId: "provider_test", type: "catering", status: "confirmed", amount: 5000, downPaymentAmount: 2500, guestCount: 50,
        eventDate: {toDate: () => new Date(kind === "future" ? "2099-10-16T00:00:00+08:00" : "2020-10-16T00:00:00+08:00")}, eventTime: "07:21",
        settlementSchemaVersion: 1, settlementStatus: "fully_settled", grossSettledAmountInCentavos: 500000, outstandingAmountInCentavos: 0,
        initialPaymentChoice: "full", initialPaymentId: "payment_test",
        financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 500000, remainingBalanceInCentavos: 0},
      };
      if (kind === "outstanding") Object.assign(request, {settlementStatus: "deposit_settled", grossSettledAmountInCentavos: 250000, outstandingAmountInCentavos: 250000});
      if (kind === "not_fully_settled") request.settlementStatus = "deposit_settled";
      if (kind === "malformed") request.settlementSchemaVersion = 2;
      if (kind === "locked") request.activeCancellationRequestId = "cancellation_" + "a".repeat(40);
      if (["cancelled", "completed", "in_progress"].includes(kind)) request.status = kind;
      records = {
        "providerRequests/request_test": request,
        "providers/provider_test": {ownerId: "owner_test", verificationStatus: "approved", isActive: true, isSuspended: false, isDeleted: false},
        "mainEvents/event_test": {mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test", providerRequestIds: ["request_test"], status: "confirmed"},
      };
      const message = {future: /has not been reached/, outstanding: /remaining payment/, not_fully_settled: /fully settled/,
        malformed: /fully settled/, locked: /locked by cancellation/, unauthorized: /do not own/,
        cancelled: /every assigned provider has accepted/, completed: /confirmed provider booking/, in_progress: /already in progress/}[kind];
      await assert.rejects(markProviderBookingInProgress.run({data: {providerRequestId: "request_test"}}), message, kind);
      assert.equal(writes, 0, kind);
    }
  } finally {
    [auth.requireAuth, roles.requireRole, rate.enforceCallableRateLimit, db.collection, db.runTransaction] = saved;
  }
});
