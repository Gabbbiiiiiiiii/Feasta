"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
} = require("../lib/provider-availability/validate-provider-availability.js");

const {
  readMultiProviderOccupancy,
} = require("../lib/bookings/multi-provider-occupancy-reader.js");

function selections() {
  return [1, 2].map((index) => ({
    providerId: `provider_00${index}`,
    providerRequestId: `request_00${index}`,
    eventDate: new Date("2026-12-20T00:00:00+08:00"),
  }));
}

function mockFirestore(records = {}) {
  const reads = [];
  const writes = [];

  const firestore = {
    collection(collection) {
      assert.equal(collection, "providerRequests");

      const filters = [];

      const query = {
        collection,
        filters,
        where(field, operator, value) {
          filters.push({field, operator, value});
          return query;
        },
      };

      return query;
    },
  };

  const transaction = {
    async get(query) {
      reads.push(query);

      const provider = query.filters.find(
        (filter) => filter.field === "providerId",
      )?.value;

      return {
        docs: (records[provider] ?? []).map((record) => ({
          id: record.id,
          data: () => record.data,
        })),
      };
    },

    create() {
      writes.push("create");
      throw new Error("Unexpected write");
    },

    set() {
      writes.push("set");
      throw new Error("Unexpected write");
    },

    update() {
      writes.push("update");
      throw new Error("Unexpected write");
    },

    delete() {
      writes.push("delete");
      throw new Error("Unexpected write");
    },
  };

  return {firestore, transaction, reads, writes};
}

async function read(mock, selected = selections()) {
  return readMultiProviderOccupancy({
    transaction: mock.transaction,
    firestore: mock.firestore,
    selections: selected,
  });
}

test("queries both providers with canonical Manila date bounds", async () => {
  const mock = mockFirestore();

  const result = await read(mock);

  assert.equal(result.size, 2);
  assert.equal(mock.reads.length, 2);
  assert.deepEqual(mock.writes, []);

  for (let index = 0; index < 2; index++) {
    const filters = mock.reads[index].filters;

    assert.deepEqual(
      filters.map((filter) => [filter.field, filter.operator]),
      [
        ["providerId", "=="],
        ["eventDate", ">="],
        ["eventDate", "<"],
        ["status", "in"],
      ],
    );

    assert.equal(filters[0].value, `provider_00${index + 1}`);
    assert.equal(
      filters[1].value.toDate().toISOString(),
      "2026-12-19T16:00:00.000Z",
    );
    assert.equal(
      filters[2].value.toDate().toISOString(),
      "2026-12-20T16:00:00.000Z",
    );

    assert.deepEqual(
      filters[3].value,
      [...AVAILABILITY_COUNTED_REQUEST_STATUSES],
    );
  }
});

test("maps occupancy documents using canonical request IDs", async () => {
  const mock = mockFirestore({
    provider_001: [{
      id: "existing_request_001",
      data: {
        status: "confirmed",
        eventTime: "10:00",
        eventEndTime: "18:00",
        providerRequestId: "untrusted_field",
      },
    }],
  });

  const result = await read(mock);
  const booking = result.get("provider_001")[0];

  assert.equal(
    booking.providerRequestId,
    "existing_request_001",
  );
  assert.equal(booking.status, "confirmed");
  assert.equal(result.get("provider_002").length, 0);
});

test("preserves unresolved payment evidence for occupancy validator", async () => {
  const mock = mockFirestore({
    provider_002: [{
      id: "existing_processing_001",
      data: {
        status: "payment_processing",
        eventTime: "10:00",
        eventEndTime: "18:00",
        reconciliationRequired: true,
        initialPaymentId: "payment_001",
        expiresAt: null,
      },
    }],
  });

  const result = await read(mock);
  const booking = result.get("provider_002")[0];

  assert.equal(booking.reconciliationRequired, true);
  assert.equal(booking.initialPaymentId, "payment_001");
  assert.equal(booking.status, "payment_processing");
});

test("rejects duplicate providers before any Firestore read", async () => {
  const mock = mockFirestore();
  const selected = selections();

  selected[1].providerId = selected[0].providerId;

  await assert.rejects(() => read(mock, selected));
  assert.equal(mock.reads.length, 0);
});

test("rejects duplicate request IDs before any Firestore read", async () => {
  const mock = mockFirestore();
  const selected = selections();

  selected[1].providerRequestId =
    selected[0].providerRequestId;

  await assert.rejects(() => read(mock, selected));
  assert.equal(mock.reads.length, 0);
});

test("rejects mismatched event dates before any Firestore read", async () => {
  const mock = mockFirestore();
  const selected = selections();

  selected[1].eventDate =
    new Date("2026-12-21T00:00:00+08:00");

  await assert.rejects(() => read(mock, selected));
  assert.equal(mock.reads.length, 0);
});

test("rejects malformed occupancy documents", async () => {
  const mock = mockFirestore({
    provider_001: [{
      id: "",
      data: {
        status: "confirmed",
      },
    }],
  });

  await assert.rejects(() => read(mock));
  assert.deepEqual(mock.writes, []);
});

test("rejects unsupported provider counts before Firestore reads", async () => {
  for (const selected of [
    selections().slice(0, 1),
    [
      ...selections(),
      ...selections(),
      ...selections(),
    ],
  ]) {
    const mock = mockFirestore();

    await assert.rejects(() => read(mock, selected));
    assert.equal(mock.reads.length, 0);
  }
});