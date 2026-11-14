const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validOccasionDependencyEntry,
  occasionDependencyEntryPath,
  classifyMainEventForRegistry,
} = require("../lib/admin/occasion-dependency-registry.js");

function booking(overrides = {}) {
  return {
    bookingId: "event_001",
    mainEventId: "event_001",
    bookingCode: "BK-0123456789",
    submissionFingerprint: "a".repeat(64),
    eventType: "birthday",
    status: "pending_provider_approval",
    submittedAt: {seconds: 123},
    providerRequestIds: ["request_001", "request_002"],
    providerRequestCount: 2,
    ...overrides,
  };
}

function entry(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "submitted_booking",
    occasionId: "birthday",
    sourceId: "event_001",
    sourcePath: "mainEvents/event_001",
    ...overrides,
  };
}

test("canonical submitted booking has a recognizable source shape", () => {
  assert.equal(
    classifyMainEventForRegistry("event_001", booking()),
    "submitted_booking",
  );
});

test("valid customer planning draft is not a submitted booking", () => {
  assert.equal(
    classifyMainEventForRegistry("draft_001", {
      customerId: "customer_001",
      status: "draft",
      eventType: "birthday",
      guestCount: 50,
    }),
    "customer_draft",
  );
});

test("draft with canonical or unexpected fields requires review", () => {
  for (const patch of [
    {bookingId: "draft_001"},
    {providerRequestIds: ["request_001"]},
    {submissionFingerprint: "a".repeat(64)},
    {unexpectedFlag: true},
    {isDeleted: true},
  ]) {
    assert.equal(classifyMainEventForRegistry("draft_001", {
      customerId: "customer_001",
      status: "draft",
      ...patch,
    }), "unresolved");
  }
});

test("historical or incomplete bookings are never silently ignored", () => {
  for (const patch of [
    {submissionFingerprint: undefined},
    {bookingId: undefined},
    {providerRequestIds: undefined},
    {providerRequestCount: 3},
    {submittedAt: undefined},
    {eventType: undefined},
    {status: undefined},
  ]) {
    assert.equal(
      classifyMainEventForRegistry("event_001", booking(patch)),
      "unresolved",
    );
  }
});

test("multiple-provider linkage must be complete and unique", () => {
  assert.equal(classifyMainEventForRegistry("event_001", booking({
    providerRequestIds: ["request_001", "request_001"],
  })), "unresolved");
  assert.equal(classifyMainEventForRegistry("event_001", booking({
    providerRequestIds: [],
    providerRequestCount: 0,
  })), "unresolved");
});

test("valid registry entry has deterministic scoped location", () => {
  const value = entry();
  assert.equal(validOccasionDependencyEntry(value), true);
  assert.equal(
    occasionDependencyEntryPath(value),
    "occasionDependencies/birthday/entries/submitted_booking_event_001",
  );
});

test("package and booking sources cannot be interchanged", () => {
  assert.equal(validOccasionDependencyEntry(entry({
    kind: "package",
    sourcePath: "mainEvents/event_001",
  })), false);

  assert.equal(validOccasionDependencyEntry(entry({
    kind: "package",
    sourcePath: "packages/event_001",
  })), true);
});

test("invalid registry identities fail closed", () => {
  for (const patch of [
    {schemaVersion: 2},
    {occasionId: "../birthday"},
    {sourceId: "../event_001"},
    {sourcePath: "providerRequests/event_001"},
    {kind: "provider_request"},
  ]) {
    assert.equal(validOccasionDependencyEntry(entry(patch)), false);
    assert.throws(() => occasionDependencyEntryPath(entry(patch)));
  }
});
test("canonical booking submission registers its dependency atomically", () => {
  const {readFileSync} = require("node:fs");
  const {resolve} = require("node:path");

  const source = readFileSync(
    resolve(__dirname, "../src/bookings/submit-booking-request.ts"),
    "utf8",
  );

  assert.match(
    source,
    /import \{occasionDependencyEntryPath\} from "\.\.\/admin\/occasion-dependency-registry\.js";/u,
  );

  const admission = source.indexOf(
    "recordMaintenanceAdmission(transaction, db);",
  );

  const registry = source.indexOf(
    "db.doc(occasionDependencyEntryPath(occasionDependencyEntry))",
    admission,
  );

  const canonicalMatch =
    /transaction\.create\(\s*bookingReference,/u.exec(
      source.slice(admission),
    );

  const canonical = canonicalMatch ?
    admission + canonicalMatch.index : -1;

  assert.ok(admission >= 0);
  assert.ok(registry > admission);
  assert.ok(canonical > registry);

  assert.match(
    source,
    /kind: "submitted_booking" as const,/u,
  );

  assert.match(
    source,
    /sourcePath: bookingReference\.path,/u,
  );
});
test("legacy package creation registers its occasion dependency", () => {
  const {readFileSync} = require("node:fs");
  const {resolve} = require("node:path");

  const source = readFileSync(
    resolve(__dirname, "../src/packages/create-provider-package.ts"),
    "utf8",
  );

  assert.match(
    source,
    /import \{occasionDependencyEntryPath\} from "\.\.\/admin\/occasion-dependency-registry\.js";/u,
  );

  const authority = source.indexOf(
    "await requireLegacyPackageOccasionAuthority(",
  );

  const registry = source.indexOf(
    "db.doc(occasionDependencyEntryPath(occasionDependencyEntry))",
    authority,
  );

  const creationMatch =
    /transaction\.create\(\s*packageReference,/u.exec(
      source.slice(authority),
    );

  const canonical = creationMatch ?
    authority + creationMatch.index : -1;

  assert.ok(authority >= 0);
  assert.ok(registry > authority);
  assert.ok(canonical > registry);

  assert.match(source, /kind: "package" as const,/u);
  assert.match(source, /occasionId: validated\.eventType,/u);
  assert.match(source, /sourceId: packageReference\.id,/u);
  assert.match(source, /sourcePath: packageReference\.path,/u);
});
test("legacy package occasion updates synchronize registry memberships", () => {
  const {readFileSync} = require("node:fs");
  const {resolve} = require("node:path");

  const source = readFileSync(
    resolve(__dirname, "../src/packages/update-provider-package.ts"),
    "utf8",
  );

  assert.match(
    source,
    /previousOccasionId = packageRecord\.packageData\.eventType/u,
  );

  assert.match(
    source,
    /const changedOccasion =\s*previousOccasionId !== validated\.eventType/u,
  );

  assert.match(
    source,
    /const previousSnapshot = await transaction\.get\(previousRef\)/u,
  );

  assert.match(
    source,
    /await transaction\.get\(nextRef\)/u,
  );

  assert.match(
    source,
    /if \(changedOccasion && previousSnapshot\.exists\)/u,
  );

  assert.match(source, /transaction\.delete\(previousRef\)/u);
  assert.match(source, /transaction\.create\(nextRef, nextEntry\)/u);
  assert.match(source, /requireMatchingEntry\(nextSnapshot\.data\(\), nextEntry\)/u);

  const authority = source.indexOf(
    "await requireLegacyPackageOccasionAuthority(",
  );

  const reads = source.indexOf(
    "const previousSnapshot = await transaction.get(previousRef)",
    authority,
  );

  const registryWrites = source.indexOf(
    "transaction.delete(previousRef)",
    reads,
  );

  const packageWriteMatch =
    /transaction\.update\(\s*packageReference,/u.exec(
      source.slice(registryWrites),
    );

  const packageWrite = packageWriteMatch ?
    registryWrites + packageWriteMatch.index : -1;

  assert.ok(authority >= 0);
  assert.ok(reads > authority);
  assert.ok(registryWrites > reads);
  assert.ok(packageWrite > registryWrites);
});