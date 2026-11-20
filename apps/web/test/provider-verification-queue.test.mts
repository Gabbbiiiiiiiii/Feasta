import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {
  parseProviderVerificationQueueFilters,
  selectedVerificationId,
} from "../src/lib/admin/provider-verification/provider-verification-query.ts";

const sourceRoot = new URL("../src/", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");
const repositorySource = (path: string) =>
  readFile(new URL(path, repositoryRoot), "utf8");

test("queue query parameters are typed, bounded, and fail closed", () => {
  assert.deepEqual(parseProviderVerificationQueueFilters({
    q: "  Ada Catering  ",
    status: "submitted",
    serviceType: "catering",
    from: "2026-07-01",
    to: "2026-07-31",
    cursor: "opaque",
    direction: "previous",
  }), {
    search: "Ada Catering",
    status: "submitted",
    serviceType: "catering",
    from: "2026-07-01",
    to: "2026-07-31",
    cursor: "opaque",
    direction: "previous",
  });
  assert.equal(parseProviderVerificationQueueFilters({
    status: "approved",
    serviceType: "venue",
    from: "not-a-date",
    direction: "sideways",
  }).status, "approved");
  assert.equal(selectedVerificationId({selected: "../admin"}), null);
  assert.equal(selectedVerificationId({selected: "verification_01"}), "verification_01");
});

test("admin queue retains server authorization and bounded global queries", async () => {
  const [page, service] = await Promise.all([
    source("app/admin/providers/page.tsx"),
    source("lib/admin/provider-verification/provider-verification-service.ts"),
  ]);
  assert.match(page, /await requireAdmin\(\)/u);
  assert.match(service, /await requireAdmin\(\)/u);
  assert.match(service, /verificationQueuePageSize = 20/u);
  assert.match(service, /\.limit\(verificationQueuePageSize \+ 1\)/u);
  assert.match(service, /"searchTokens", "array-contains"/u);
  assert.match(service, /"providerServiceType"/u);
  assert.match(service, /"createdAt", ">="/u);
  assert.match(service, /\.startAfter\(/u);
  assert.match(service, /\.endBefore\(/u);
  assert.doesNotMatch(
    service.slice(
      service.indexOf("export async function getProviderVerificationQueue("),
      service.indexOf("export async function getProviderVerificationQueueSummary"),
    ),
    /loadNestedVerificationData/u,
  );
});

test("verification queue indexes cover status, service, search, and date order", async () => {
  const indexes = JSON.parse(
    await repositorySource("firebase/firestore.indexes.json"),
  ) as {indexes: Array<{collectionGroup: string; fields: Array<{fieldPath: string}>}>};
  const queueIndexes = indexes.indexes.filter(
    (index) => index.collectionGroup === "providerVerifications",
  );
  const signatures = queueIndexes.map((index) =>
    index.fields.map((field) => field.fieldPath).join("+")
  );
  assert.ok(signatures.includes("status+createdAt"));
  assert.ok(signatures.includes("status+providerServiceType+createdAt"));
  assert.ok(signatures.includes("searchTokens+status+createdAt"));
  assert.ok(
    signatures.includes("searchTokens+status+providerServiceType+createdAt"),
  );
});

test("new and legacy verification records support global owner/provider search", async () => {
  const [registration, backfill] = await Promise.all([
    repositorySource("functions/src/providers/register-provider.ts"),
    repositorySource("functions/src/scripts/backfill-query-policy.ts"),
  ]);
  for (const field of [
    "businessName",
    "businessEmail",
    "businessPhone",
    "ownerFirstName",
    "ownerLastName",
    "ownerEmail",
    "searchTokens",
  ]) {
    assert.match(registration, new RegExp(field, "u"));
  }
  assert.match(backfill, /"providerVerifications"/u);
  assert.match(backfill, /verificationSearchValues/u);
  assert.match(backfill, /collection\("users"\)/u);
});
