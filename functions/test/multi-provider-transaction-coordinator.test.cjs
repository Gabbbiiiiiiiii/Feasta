"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");

const {HttpsError} = require("firebase-functions/v2/https");

const {
  bookingOutcomeId,
} = require("../lib/bookings/submission-outcome.js");

const {
  coordinateMultiProviderSubmission,
} = require("../lib/bookings/multi-provider-transaction-coordinator.js");

const customerId = "customer_001";
const clientRequestId = "submission_20261112_001";
const fingerprint = "a".repeat(64);

function reference(collection, id) {
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

function plan(bookingId, count = 2) {
  const requests = Array.from({length: count}, (_, index) => {
    const providerId = `provider_00${index + 1}`;
    const type = index === 0 ? "catering" : "addon";
    const id = requestId(bookingId, type, providerId);

    return {
      providerId,
      type,
      reference: reference("providerRequests", id),
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
      reference: reference("mainEvents", bookingId),
      data: {
        bookingId,
        mainEventId: bookingId,
        customerId,
        clientRequestId,
        submissionFingerprint: fingerprint,
        status: "pending_provider_approval",
        paymentStatus: "unpaid",
        providerRequestIds: requests.map((r) => r.reference.id),
        providerRequestCount: count,
        pendingProviderRequestCount: count,
        confirmedProviderRequestCount: 0,
        rejectedProviderRequestCount: 0,
        completedProviderRequestCount: 0,
      },
    },
    requests,
  };
}

function firestore() {
  const documents = new Map();
  const readPaths = [];
  let commitCount = 0;

  const db = {
    collection(collection) {
      return {
        doc(id) {
          return reference(collection, id);
        },
      };
    },

    async runTransaction(callback) {
      const pending = [];

      const transaction = {
        async get(ref) {
          readPaths.push(ref.path);

          const exists = documents.has(ref.path);

          return {
            exists,
            data: () => documents.get(ref.path),
          };
        },

        create(ref, data) {
          pending.push({ref, data});
        },
      };

      // A thrown error aborts the simulated transaction.
      const result = await callback(transaction);

      // Stage validation before committing ANY document.
      const paths = new Set();

      for (const item of pending) {
        if (
          paths.has(item.ref.path) ||
          documents.has(item.ref.path)
        ) {
          throw new Error("transaction conflict");
        }

        paths.add(item.ref.path);
      }

      for (const item of pending) {
        documents.set(item.ref.path, item.data);
      }

      commitCount++;
      return result;
    },
  };

  return {
    db,
    documents,
    readPaths,
    get commitCount() {
      return commitCount;
    },
  };
}

function input(db, overrides = {}) {
  return {
    firestore: db,
    customerId,
    clientRequestId,
    submissionFingerprint: fingerprint,

    prepare: async (_transaction, bookingId) => ({
      plan: plan(bookingId),
      validateRefundAcknowledgements() {},
      validatePaymentAgreements() {},
    }),

    ...overrides,
  };
}

test("creates one event and two requests together", async () => {
  const mock = firestore();

  const result = await coordinateMultiProviderSubmission(
    input(mock.db),
  );

  assert.equal(result.created, true);
  assert.equal(result.providerRequestIds.length, 2);
  assert.equal(mock.documents.size, 3);

  const parent = mock.documents.get(
    `mainEvents/${result.bookingId}`,
  );

  assert.deepEqual(
    parent.providerRequestIds,
    result.providerRequestIds,
  );
});

test("supports four linked provider requests", async () => {
  const mock = firestore();

  const result = await coordinateMultiProviderSubmission(
    input(mock.db, {
      prepare: async (_transaction, bookingId) => ({
        plan: plan(bookingId, 4),
        validateRefundAcknowledgements() {},
        validatePaymentAgreements() {},
      }),
    }),
  );

  assert.equal(result.providerRequestIds.length, 4);
  assert.equal(mock.documents.size, 5);
});

test("identical retry returns the original booking", async () => {
  const mock = firestore();

  const first = await coordinateMultiProviderSubmission(
    input(mock.db),
  );

  const replay = await coordinateMultiProviderSubmission(
    input(mock.db, {
      prepare: async () => {
        throw new Error("Replay must not prepare again");
      },
    }),
  );

  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.bookingId, first.bookingId);
  assert.equal(mock.documents.size, 3);
});

test("changed fingerprint cannot reuse request identity", async () => {
  const mock = firestore();

  await coordinateMultiProviderSubmission(input(mock.db));

  await assert.rejects(
    () => coordinateMultiProviderSubmission(
      input(mock.db, {
        submissionFingerprint: "b".repeat(64),
      }),
    ),
    {code: "already-exists"},
  );

  assert.equal(mock.documents.size, 3);
});

test("invalid prepared identity queues no writes", async () => {
  const mock = firestore();

  await assert.rejects(
    () => coordinateMultiProviderSubmission(
      input(mock.db, {
        prepare: async (_transaction, bookingId) => {
          const prepared = plan(bookingId);
          prepared.customerId = "other_customer";

          return {
            plan: prepared,
            validateRefundAcknowledgements() {},
            validatePaymentAgreements() {},
          };
        },
      }),
    ),
  );

  assert.equal(mock.documents.size, 0);
});

test("unexpected validation failure rolls back", async () => {
  const mock = firestore();

  await assert.rejects(
    () => coordinateMultiProviderSubmission(
      input(mock.db, {
        prepare: async () => {
          throw new Error("Package changed");
        },
      }),
    ),
    /Package changed/,
  );

  assert.equal(mock.documents.size, 0);
});

test("recognized refund rejection commits terminal receipt", async () => {
  const mock = firestore();

  await assert.rejects(
    () => coordinateMultiProviderSubmission(
      input(mock.db, {
        prepare: async (_transaction, bookingId) => ({
          plan: plan(bookingId),
          validateRefundAcknowledgements() {
            throw new HttpsError(
              "failed-precondition",
              "Refund acknowledgement required.",
              {
                reason: "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED",
              },
            );
          },
          validatePaymentAgreements() {},
        }),
      }),
    ),
    {code: "failed-precondition"},
  );

  const bookingId = bookingOutcomeId(
    customerId,
    clientRequestId,
  );

  assert.equal(mock.documents.size, 1);
  assert.ok(
    mock.documents.has(
      `bookingSubmissionOutcomes/${bookingId}`,
    ),
  );
  assert.equal(
    mock.documents.get(
      `bookingSubmissionOutcomes/${bookingId}`
    ).outcome,
    "confirmed_rejected",
  );
});

test("recognized agreement rejection commits terminal receipt", async () => {
  const mock = firestore();

  await assert.rejects(
    () => coordinateMultiProviderSubmission(
      input(mock.db, {
        prepare: async (_transaction, bookingId) => ({
          plan: plan(bookingId),
          validateRefundAcknowledgements() {},
          validatePaymentAgreements() {
            throw new HttpsError(
              "failed-precondition",
              "Payment agreement changed.",
              {
                reason: "BOOKING_PAYMENT_AGREEMENT_CHANGED",
              },
            );
          },
        }),
      }),
    ),
    {code: "failed-precondition"},
  );

  assert.equal(mock.documents.size, 1);
});

test("terminal rejection cannot be replayed as creation", async () => {
  const mock = firestore();

  const bookingId = bookingOutcomeId(
    customerId,
    clientRequestId,
  );

  mock.documents.set(
    `bookingSubmissionOutcomes/${bookingId}`,
    {
      schemaVersion: 1,
      outcome: "confirmed_rejected",
      customerId,
      clientRequestId,
      submissionFingerprint: fingerprint,
      reason: "acknowledgement_rejected",
      rejectedAt: {},
    },
  );

  // Malformed receipt must fail closed rather than create.
  await assert.rejects(
    () => coordinateMultiProviderSubmission(input(mock.db)),
    {code: "failed-precondition"},
  );

  assert.equal(mock.documents.size, 1);
});

test("incorrect parent linkage fails before commit", async () => {
  const mock = firestore();

  await assert.rejects(
    () => coordinateMultiProviderSubmission(
      input(mock.db, {
        prepare: async (_transaction, bookingId) => {
          const prepared = plan(bookingId);

          prepared.booking.data.providerRequestIds.reverse();

          return {
            plan: prepared,
            validateRefundAcknowledgements() {},
            validatePaymentAgreements() {},
          };
        },
      }),
    ),
  );

  assert.equal(mock.documents.size, 0);
});