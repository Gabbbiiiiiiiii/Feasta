"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  validateProposal,
  stageWitnessCreatesInTransaction,
} = require("../scripts/occasion-birthday-witness-migration.cjs");

const {
  validOccasionDependencyEntry,
} = require("../lib/admin/occasion-dependency-registry.js");

const report = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../reports/occasion-birthday-reconciliation-3L8K98.json"
    ),
    "utf8"
  )
);

const ids = report.proposedWitnesses.map(
  witness => witness.value.sourceId
);

function fixture(overrides = {}) {
  const requestIdFor = id => `request_${id}`;

  const events = new Map();
  const requests = new Map();

  for (const id of ids) {
    const requestId = requestIdFor(id);

    events.set(`mainEvents/${id}`, {
      eventType: "birthday",
      status: "completed",
      bookingId: id,
      mainEventId: id,
      bookingCode: "BK-ABCDEFGHIJ",
      submissionFingerprint: "a".repeat(64),
      providerRequestIds: [requestId],
      providerRequestCount: 1,
      submittedAt: new Date("2026-10-01T00:00:00Z"),
    });

    requests.set(`providerRequests/${requestId}`, {
      eventType: "birthday",
      status: "completed",
      mainEventId: id,
    });
  }

  if (overrides.changeEvent) {
    const id = ids[0];
    events.set(
      `mainEvents/${id}`,
      {
        ...events.get(`mainEvents/${id}`),
        ...overrides.changeEvent,
      }
    );
  }

  if (overrides.removeEvent) {
    events.delete(`mainEvents/${ids[0]}`);
  }

  if (overrides.breakLink) {
    const requestId = requestIdFor(ids[0]);
    requests.set(`providerRequests/${requestId}`, {
      ...requests.get(`providerRequests/${requestId}`),
      mainEventId: ids[1],
    });
  }

  const existing = new Set(
    overrides.existingWitness
      ? [report.proposedWitnesses[0].path]
      : []
  );

  const creates = [];
  let readCount = 0;

  const db = {
    doc(documentPath) {
      return {path: documentPath};
    },
    collection(name) {
      assert.equal(name, "mainEvents");

      const query = {
        orderBy(field) {
          assert.equal(field, "__name__");
          return query;
        },
        limit(value) {
          assert.equal(value, 41);
          return query;
        },
      };

      return query;
    },
  };

  const transaction = {
    async get(query) {
      assert.ok(query);

      const docs = [...events.entries()].map(([path, data]) => ({
        id: path.split("/").at(-1),
        data: () => data,
      }));

      if (overrides.extraEvent) {
        docs.push({
          id: "extra_birthday_booking",
          data: () => ({eventType: "birthday"}),
        });
      }

      return {docs};
    },
    async getAll(...refs) {
      readCount++;

      return refs.map(ref => {
        const data = events.get(ref.path) ??
          requests.get(ref.path);

        return {
          ref,
          exists: existing.has(ref.path) || data !== undefined,
          data: () => data,
        };
      });
    },
    create(ref, value) {
      creates.push({path: ref.path, value});
    },
  };

  return {
    db,
    transaction,
    creates,
    getReadCount: () => readCount,
  };
}

test("valid proposal has 17 unique witnesses", () => {
  const {registry} = {
    registry: require(
      "../lib/admin/occasion-dependency-registry.js"
    ),
  };

  const witnesses = validateProposal(report, registry);

  assert.equal(witnesses.length, 17);
  assert.equal(
    new Set(witnesses.map(w => w.path)).size,
    17
  );

  assert.ok(
    witnesses.every(w =>
      validOccasionDependencyEntry(w.value)
    )
  );
});

test("valid sources stage exactly 17 create-only writes", async () => {
  const f = fixture();

  const result = await stageWitnessCreatesInTransaction({
    transaction: f.transaction,
    db: f.db,
    report,
  });

  assert.equal(f.creates.length, 17);
  assert.equal(result.sourceBookingsVerified, 17);
  assert.equal(result.linkedRequestsVerified, 17);
  assert.equal(result.canDeactivate, false);
  assert.equal(result.coverageVerified, false);
  assert.equal(f.getReadCount(), 3);
});

test("existing target prevents all creates", async () => {
  const f = fixture({existingWitness: true});

  await assert.rejects(
    stageWitnessCreatesInTransaction({
      transaction: f.transaction,
      db: f.db,
      report,
    }),
    /MIGRATION_TARGET_NOT_EMPTY/
  );

  assert.equal(f.creates.length, 0);
});

test("missing booking prevents all creates", async () => {
  const f = fixture({removeEvent: true});

  await assert.rejects(
    stageWitnessCreatesInTransaction({
      transaction: f.transaction,
      db: f.db,
      report,
    }),
    /MIGRATION_INVENTORY_CHANGED/
  );

  assert.equal(f.creates.length, 0);
});

test("changed occasion prevents all creates", async () => {
  const f = fixture({
    changeEvent: {eventType: "wedding"},
  });

  await assert.rejects(
    stageWitnessCreatesInTransaction({
      transaction: f.transaction,
      db: f.db,
      report,
    }),
    /MIGRATION_INVENTORY_CHANGED/
  );

  assert.equal(f.creates.length, 0);
});

test("broken provider relationship prevents creates", async () => {
  const f = fixture({breakLink: true});

  await assert.rejects(
    stageWitnessCreatesInTransaction({
      transaction: f.transaction,
      db: f.db,
      report,
    }),
    /MIGRATION_BOOKING_LINKS_UNVERIFIED/
  );

  assert.equal(f.creates.length, 0);
});

test("unauthorized proposal is rejected", () => {
  const changed = {
    ...report,
    authorizedForWrite: true,
  };

  const registry = require(
    "../lib/admin/occasion-dependency-registry.js"
  );

  assert.throws(
    () => validateProposal(changed, registry),
    /INVALID_MIGRATION_PROPOSAL/
  );
});

test("duplicate witness is rejected", () => {
  const changed = structuredClone(report);

  changed.proposedWitnesses[1] =
    structuredClone(changed.proposedWitnesses[0]);

  const registry = require(
    "../lib/admin/occasion-dependency-registry.js"
  );

  assert.throws(
    () => validateProposal(changed, registry),
    /INVALID_MIGRATION_WITNESS/
  );
});

test("migration is not an executable Firebase script", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../scripts/occasion-birthday-witness-migration.cjs"
    ),
    "utf8"
  );

  assert.ok(source.includes("MIGRATION_NOT_EXECUTABLE"));
  assert.ok(source.includes("if (require.main === module)"));
  assert.ok(source.includes("transaction.create("));
  assert.ok(source.includes("coverageVerified: false"));
  assert.ok(source.includes("canDeactivate: false"));
});
test("additional Birthday booking blocks all creates", async () => {
  const f = fixture({extraEvent: true});

  await assert.rejects(
    stageWitnessCreatesInTransaction({
      transaction: f.transaction,
      db: f.db,
      report,
    }),
    /MIGRATION_INVENTORY_CHANGED/
  );

  assert.equal(f.creates.length, 0);
});
