const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");

const source = readFileSync(
  resolve(__dirname,
    "../src/admin/occasion-historical-inventory-server.ts"),
  "utf8",
);

const entrypoint = readFileSync(
  resolve(__dirname, "../src/index.ts"),
  "utf8",
);

test("historical reader supports only approved collections", () => {
  for (const collection of [
    "packages",
    "mainEvents",
    "providerRequests",
  ]) {
    assert.ok(source.includes(`"${collection}"`));
  }

  assert.match(source, /validCollection\(collection\)/u);
});

test("queries order by Firestore document ID", () => {
  assert.match(
    source,
    /orderBy\(FieldPath\.documentId\(\)\)/u,
  );
});

test("queries use bounded cursor pagination", () => {
  assert.match(source, /base\.limit\(limit\)/u);
  assert.match(source, /base\.startAfter\(afterId\)\.limit\(limit\)/u);
});

test("queries use the trusted bounded inventory scanner", () => {
  assert.match(
    source,
    /return scanHistoricalOccasionInventory\(\{/u,
  );
});

test("historical reader does not perform Firestore writes", () => {
  for (const mutation of [
    /\.create\(/u,
    /\.update\(/u,
    /\.set\(/u,
    /\.delete\(/u,
    /runTransaction\(/u,
    /writeBatch\(/u,
  ]) {
    assert.doesNotMatch(source, mutation);
  }
});

test("historical reader is not a public Firebase Function", () => {
  assert.doesNotMatch(
    entrypoint,
    /occasion-historical-inventory-server/u,
  );

  assert.doesNotMatch(source, /\bonCall\(/u);
  assert.doesNotMatch(source, /\bonRequest\(/u);
});

test("historical reader never certifies coverage", () => {
  assert.doesNotMatch(source, /coverageVerified:\s*true/u);
  assert.doesNotMatch(source, /canDeactivate:\s*true/u);
});
