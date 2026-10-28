const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {isLegacyOccasionPackage: readable} = require(
  "../lib/packages/legacy-occasion-publication-guard.js");

const fields = ["occasionScope", "occasionIds", "occasionMatchIds",
  "occasionCatalogRevision", "providerEligibilityRevision", "occasionEligibilityState"];

test("unknown offer envelopes and explicitly malformed schema markers fail closed", () => {
  for (const field of ['offerSchemaVersion', 'occasionSchemaVersion']) {
    for (const marker of [undefined, null, 2, 3, '1', false]) {
      assert.equal(readable({eventType: 'birthday', [field]: marker}), false);
    }
    assert.equal(readable({eventType: 'birthday', [field]: 1}), true);
  }
});

test("legacy packages remain compatible without V2 occasion fields", () => {
  for (const candidate of [
    {eventType: "birthday"},
    {eventType: "wedding", occasionSchemaVersion: 1},
  ]) assert.equal(readable(candidate), true);
});

test("pricingModel markers never qualify for legacy publication", () => {
  for (const pricingModel of ["per_pax", "fixed_bundle", null, undefined]) {
    for (const isPublished of [true, false]) {
      assert.equal(
        readable({eventType: "birthday", pricingModel, isPublished}),
        false,
      );
    }
  }
});
test("V2 and malformed occasion schema versions fail closed", () => {
  for (const version of [2, 3, 0, null, "2", false, -1]) {
    assert.equal(readable({eventType: "birthday", occasionSchemaVersion: version}), false);
  }
});

test("partial V2 tuples block the legacy path, including an undefined field", () => {
  for (const key of fields) {
    for (const version of [undefined, 1, 2]) {
      const row = {eventType: "birthday", ...(version === undefined ? {} :
        {occasionSchemaVersion: version}), [key]: undefined};
      assert.equal(readable(row), false, `${key} with ${version} must block`);
    }
  }
});

test("full eligible-looking V2 tuple still cannot use the old publishing path", () => {
  assert.equal(readable({eventType: "birthday", occasionSchemaVersion: 2,
    occasionScope: "specific", occasionIds: ["birthday"], occasionMatchIds: ["birthday"],
    occasionCatalogRevision: 2, providerEligibilityRevision: 1,
    occasionEligibilityState: "valid"}), false);
});

test("legacy publish and booking boundaries invoke the guard", () => {
  const source = (relative) => fs.readFileSync(path.join(__dirname, "../src", relative), "utf8");
  const publish = source("packages/publish-provider-package.ts");
  const booking = source("bookings/submit-booking-request.ts");
  assert.match(publish, /isLegacyOccasionPackage\(packageRecord\.packageData\)/u);
  assert.match(booking, /isLegacyOccasionPackage\(packageData\)/u);
  assert.ok(booking.indexOf("if (existingSnapshot.exists)") <
    booking.indexOf("isLegacyOccasionPackage(packageData)"),
  "historical idempotent booking replay must stay ahead of new booking rejection");
});

const {isLegacyPackageDraft: editable} = require("../lib/packages/legacy-occasion-publication-guard.js");
test("legacy draft edits preserve supported pricing while publication stays fenced", () => {
  for (const pricingModel of ["per_pax", "per_bundle"]) {
    const row = {eventType: "wedding", pricingModel};
    assert.equal(editable(row), true);
    assert.equal(readable(row), false);
  }
  assert.equal(editable({eventType: "wedding"}), true);
  for (const key of fields) {
    assert.equal(editable({eventType: "wedding", [key]: undefined}), false);
  }
  for (const key of ["occasionSchemaVersion", "offerSchemaVersion"]) {
    for (const marker of [undefined, null, 2, 3, "1", false]) {
      assert.equal(editable({eventType: "wedding", [key]: marker}), false);
    }
    assert.equal(editable({eventType: "wedding", [key]: 1}), true);
  }
});

test("legacy update checks the stored envelope before image verification or writes", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/packages/update-provider-package.ts"), "utf8");
  const guard = source.indexOf("if (!isLegacyPackageDraft(packageRecord.packageData))");
  assert.ok(guard > source.indexOf("authorizeOwnedPackage({"));
  assert.ok(guard < source.indexOf("await verifyPackageImages("));
  assert.ok(guard < source.indexOf("transaction.update("));
  assert.match(source, /reason: "CLIENT_UPGRADE_REQUIRED"/);
});
