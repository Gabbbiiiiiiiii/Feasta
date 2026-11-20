const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");

const root = path.resolve(__dirname, "../..");

test("pagination defaults, maximums, and stable cursors are canonical", () => {
  const constants = read("functions/src/shared/constants.ts");
  const dart = read("apps/customer_mobile/lib/core/firestore/query_builder.dart");
  const repository = read(
    "apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart",
  );

  assert.match(constants, /DEFAULT_PAGE_SIZE\s*=\s*20/);
  assert.match(constants, /MAX_PAGE_SIZE\s*=\s*50/);
  assert.match(dart, /defaultPageSize\s*=\s*20/);
  assert.match(dart, /maximumPageSize\s*=\s*50/);
  assert.match(dart, /orderBy\(FieldPath\.documentId/);
  assert.match(dart, /startAfterDocument\(startAfter\)/);
  assert.doesNotMatch(repository, /\.offset\s*\(/);
});

test("required Phase 3 composite index families are checked in", () => {
  const indexes = JSON.parse(read("firebase/firestore.indexes.json")).indexes;
  const signatures = new Set(indexes.map((index) => [
    index.collectionGroup,
    ...index.fields.map((field) => field.fieldPath),
  ].join("|")));
  const required = [
    "users|role|createdAt",
    "users|accountStatus|createdAt",
    "users|role|accountStatus|createdAt",
    "providers|verificationStatus|createdAt",
    "providers|providerServiceType|isActive",
    "providers|city|isActive",
    "providers|isFeatured|isActive",
    "providerVerifications|status|createdAt",
    "mainEvents|customerId|createdAt",
    "mainEvents|customerId|status|eventDate",
    "mainEvents|status|eventDate",
    "providerRequests|providerId|status|createdAt",
    "providerRequests|customerId|createdAt",
    "providerRequests|mainEventId|createdAt",
    "payments|customerId|createdAt",
    "payments|providerId|paidAt",
    "payments|status|createdAt",
    "notifications|userId|isRead|createdAt",
    "notifications|userId|createdAt",
    "complaints|status|createdAt",
    "complaints|userId|createdAt",
  ];

  for (const signature of required) {
    assert.ok(signatures.has(signature), `Missing composite index: ${signature}`);
  }
});

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
