"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node CommonJS contract tests. */

const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");
const rules = fs.readFileSync(
  path.join(root, "firebase/firestore.rules"), "utf8");
const writer = fs.readFileSync(
  path.join(root, "apps/web/src/lib/provider/provider-setup-gallery-v2-writer.ts"),
  "utf8");

function between(source, start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `Missing section: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, `Missing ending: ${end}`);
  return source.slice(a, b);
}

test("client admin account-status changes are backend-only", () => {
  const users = between(
    rules, "match /users/{userId} {", "match /customers/{customerId} {");
  assert.match(users, /allow update:\s*if/u);
  assert.doesNotMatch(
    users,
    /isAdmin\(\)\s*&&\s*changesOnly\(\[\s*'accountStatus'/u);
});

test("provider blocked flag is protected against direct client writes", () => {
  const providers = between(
    rules, "match /providers/{providerId} {",
    "match /providerTaxProfiles/{providerId} {");
  assert.match(
    providers, /changesNone\(\[[\s\S]*?'isBlocked'/u);
});

test("B2B transaction checks provider blocked state", () => {
  assert.match(writer, /provider\.isBlocked === true/u);
  assert.match(writer, /user\.isBlocked === true/u);
});

test("private V2 release guards remain disabled", () => {
  assert.match(writer,
    /PRIVATE_V2_WRITER_COVERAGE_VERIFIED = false/u);
  assert.match(writer,
    /MIXED_GALLERY_PUBLIC_V1_COMPATIBILITY_VERIFIED = false/u);
});

test("private gallery and V2 authority collections have only the recursive default deny", () => {
  // Source contract only: these paths intentionally have no client allow rule.
  for (const collection of ["catalog", "providerEligibilityAuthorities", "occasionCatalog",
    "occasions", "contractPolicies", "providerOccasionCapabilityOperations",
    "providerOccasionCapabilityAudits", "providerOccasionCapabilityRevalidations"]) {
    assert.doesNotMatch(rules, new RegExp(`match /${collection}/`, "u"));
  }
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/u);
  assert.equal((rules.match(/=\*\*/gu) || []).length, 1, "No broader recursive allow");
});

test("provider client update is Admin-only and protects every eligibility input", () => {
  const providers = between(rules, "match /providers/{providerId} {",
    "match /providerTaxProfiles/{providerId} {");
  assert.match(providers, /allow update: if \(\s*isAdmin\(\) &&\s*changesNone\(/u);
  const protectedFields = providers.slice(providers.indexOf("changesNone("));
  for (const field of ["ownerId", "verificationStatus", "providerServiceType", "providerCategory",
    "serviceCategories", "eventTypesSupported", "isActive", "isBlocked", "isSuspended", "isDeleted"]) {
    assert.ok(protectedFields.includes(`'${field}'`), field);
  }
  assert.match(providers, /allow create: if false;/u);
  assert.match(providers, /allow delete: if false;/u);
});

test("user updates cannot mutate role linkage or account status even for Admin clients", () => {
  const users = between(rules, "match /users/{userId} {", "match /customers/{customerId} {");
  const update = users.slice(users.indexOf("allow update:"));
  assert.match(update, /isOwner\(userId\) &&\s*isActiveSignedInUser\(\) &&\s*changesOnly\(/u);
  for (const field of ["role", "providerId", "accountStatus", "isActive", "isBlocked"]) {
    assert.ok(!update.includes(`'${field}'`), field);
  }
  assert.doesNotMatch(update, /isAdmin\(\)/u);
});

test("category mutations are backend-only and callable stays unexported", () => {
  const categories = between(rules, "match /serviceCategories/{categoryCode} {",
    "// Dynamic document catalog");
  assert.match(categories, /allow create, update, delete: if false;/u);
  const entry = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
  assert.doesNotMatch(entry, /provider-occasion-capabilities-v2/u);
});
