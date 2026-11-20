"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runnerPath = path.resolve(
  __dirname,
  "../scripts/audit-occasion-historical-dependencies.cjs"
);

const source = fs.readFileSync(runnerPath, "utf8");
const start = "async function readAllRegistryEntries(db) {";
const end = "function assertRegistryContracts(";

assert.equal(source.split(start).length, 2);
assert.equal(source.split(end).length, 2);

const first = source.indexOf(start);
const last = source.indexOf(end);

assert.ok(last > first);

const functionSource = source.slice(first, last);

// Extract only the pure reader function. Never execute runner main().
const readAllRegistryEntries = vm.runInNewContext(
  [
    "const PAGE_SIZE = 100;",
    "const MAX_REGISTRY_PAGES = 100;",
    functionSource,
    "readAllRegistryEntries;",
  ].join("\n"),
  {}
);

function row(pathName, value = {}) {
  return {
    id: pathName.split("/").at(-1),
    ref: {path: pathName},
    data: () => value,
  };
}

function mockDb(paths, options = {}) {
  const rows = paths.map(p => row(p));
  let requests = 0;

  const db = {
    collectionGroup(name) {
      assert.equal(name, "entries");

      let cursor = null;
      let limit = 100;

      const query = {
        orderBy(field) {
          assert.equal(field, "__name__");
          return query;
        },
        startAfter(value) {
          assert.ok(value && value.ref && value.ref.path);
          cursor = value.ref.path;
          return query;
        },
        limit(value) {
          limit = value;
          return query;
        },
        async get() {
          requests++;

          if (options.fail) {
            throw new Error("MOCK_FIRESTORE_QUERY_FAILED");
          }

          let selected = rows;

          if (cursor !== null) {
            selected = selected.filter(
              item => item.ref.path > cursor
            );
          }

          if (options.repeatPage && cursor !== null) {
            selected = rows;
          }

          const docs = selected.slice(0, limit);

          return {
            docs,
            empty: docs.length === 0,
            size: docs.length,
          };
        },
      };

      return query;
    },
  };

  return {
    db,
    getRequests: () => requests,
  };
}

test("empty registry returns no witnesses", async () => {
  const mock = mockDb([]);
  const result = await readAllRegistryEntries(mock.db);

  assert.equal(result.length, 0);
  assert.equal(mock.getRequests(), 1);
});

test("reads both registry families", async () => {
  const mock = mockDb([
    "occasionCategoryDependencies/catering/entries/universal_package_p1",
    "occasionDependencies/birthday/entries/submitted_booking_b1",
  ]);

  const result = await readAllRegistryEntries(mock.db);

  assert.equal(result.length, 2);
  assert.equal(mock.getRequests(), 2);
});

test("includes entries whose parent document is absent", async () => {
  // No mock parent documents are provided.
  const mock = mockDb([
    "occasionDependencies/birthday/entries/submitted_booking_b1",
  ]);

  const result = await readAllRegistryEntries(mock.db);

  assert.equal(result.length, 1);
});

test("continues after a full page", async () => {
  const paths = Array.from(
    {length: 101},
    (_, i) =>
      "occasionDependencies/birthday/entries/submitted_booking_" +
      String(i).padStart(4, "0")
  );

  const mock = mockDb(paths);
  const result = await readAllRegistryEntries(mock.db);

  assert.equal(result.length, 101);
  assert.equal(mock.getRequests(), 3);
});

test("exact page boundary requires an empty terminal page", async () => {
  const paths = Array.from(
    {length: 100},
    (_, i) =>
      "occasionDependencies/birthday/entries/submitted_booking_" +
      String(i).padStart(4, "0")
  );

  const mock = mockDb(paths);
  const result = await readAllRegistryEntries(mock.db);

  assert.equal(result.length, 100);
  assert.equal(mock.getRequests(), 2);
});

test("rejects unrelated entries collections", async () => {
  const mock = mockDb([
    "unrelated/root/entries/entry_1",
  ]);

  await assert.rejects(
    readAllRegistryEntries(mock.db),
    /UNEXPECTED_REGISTRY_ENTRY_PATH/
  );
});

test("rejects repeated pagination results", async () => {
  const paths = Array.from(
    {length: 101},
    (_, i) =>
      "occasionDependencies/birthday/entries/submitted_booking_" +
      String(i).padStart(4, "0")
  );

  const mock = mockDb(paths, {repeatPage: true});

  await assert.rejects(
    readAllRegistryEntries(mock.db),
    /REGISTRY_PAGINATION_INCONSISTENT/
  );
});

test("Firestore query failure propagates", async () => {
  const mock = mockDb([], {fail: true});

  await assert.rejects(
    readAllRegistryEntries(mock.db),
    /MOCK_FIRESTORE_QUERY_FAILED/
  );
});

test("fails closed at the maximum page limit", async () => {
  const paths = Array.from(
    {length: 10000},
    (_, i) =>
      "occasionDependencies/birthday/entries/submitted_booking_" +
      String(i).padStart(5, "0")
  );

  const mock = mockDb(paths);

  await assert.rejects(
    readAllRegistryEntries(mock.db),
    /REGISTRY_NOT_EXHAUSTED/
  );
});

test("release certification flags remain disabled", () => {
  for (const marker of [
    "snapshotIsolated: false",
    "writersFenced: false",
    "coverageVerified: false",
    "canDeactivate: false",
  ]) {
    assert.ok(source.includes(marker), marker);
  }

  assert.ok(source.includes("READ_ONLY_LIVE_APPROVAL_REQUIRED"));
});