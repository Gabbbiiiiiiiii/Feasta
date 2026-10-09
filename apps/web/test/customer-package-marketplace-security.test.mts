import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("package discovery is bounded, batched, server-only, and provider-normalized", async () => {
  const service = await source("lib/customer/discovery/package-discovery-service.ts");
  assert.match(service, /^import "server-only";/u);
  assert.match(service, /PACKAGE_PAGE_SIZE = 12/u);
  assert.match(service, /PACKAGE_CANDIDATE_READ_LIMIT = 48/u);
  assert.match(service, /\.limit\(PACKAGE_CANDIDATE_READ_LIMIT\)/u);
  assert.match(service, /adminDb\.getAll/u);
  assert.match(service, /normalizePublicProvider/u);
  assert.match(service, /normalizePublicPackage/u);
  assert.doesNotMatch(service, /documents\.map\([^)]*\.get\(/u);
});

test("package candidates require every canonical publication projection", async () => {
  const service = await source("lib/customer/discovery/package-discovery-service.ts");
  for (const predicate of [
    '.where("isActive", "==", true)',
    '.where("isPublished", "==", true)',
    '.where("providerPubliclyVisible", "==", true)',
    '.where("status", "==", "published")',
    '.where("isDeleted", "==", false)',
  ]) assert.ok(service.includes(predicate), predicate);
  assert.match(service, /orderBy\(FieldPath\.documentId\(\), "desc"\)/u);
  assert.match(service, /createdAtNanoseconds/u);
});

test("the public route performs no customer or favorite reads", async () => {
  const page = await source("app/customer/packages/page.tsx");
  assert.doesNotMatch(page, /requireCustomer|requireRole|getCustomerFavorite/u);
  assert.match(page, /getPublicPackagePage/u);
});

test("the PublicPackage boundary omits private payment and lifecycle fields", async () => {
  const types = await source("lib/customer/discovery/marketplace-types.ts");
  const contract = types.slice(
    types.indexOf("export type PublicPackage"),
    types.indexOf("export type PackageDiscoveryFilters"),
  );
  assert.doesNotMatch(
    contract,
    /downPayment|internal|publishedAt|isPublished|providerPubliclyVisible/u,
  );
});

test("the standalone package query has one exact checked-in composite index", async () => {
  const indexes = JSON.parse(await readFile(
    new URL("firebase/firestore.indexes.json", repositoryRoot),
    "utf8",
  )) as {indexes: Array<{collectionGroup: string; fields: Array<{fieldPath: string}>}>};
  const expected = [
    "isActive",
    "isPublished",
    "providerPubliclyVisible",
    "status",
    "isDeleted",
    "createdAt",
  ];
  const matches = indexes.indexes.filter((index) =>
    index.collectionGroup === "packages" &&
    index.fields.map((field) => field.fieldPath).join("|") ===
      expected.join("|"),
  );
  assert.equal(matches.length, 1);
});
