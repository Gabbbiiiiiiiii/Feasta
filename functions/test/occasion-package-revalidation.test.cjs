const {test} = require("node:test");
const assert = require("node:assert/strict");
const {planOccasionPackageRevalidation: plan} = require("../lib/packages/occasion-package-revalidation.js");
const authority = (extra = {}) => ({catalogRevision: 3, providerEligibilityRevision: 5,
  serviceCategoryCode: "catering_service", approvedActiveCategoryCodes: ["catering_service"],
  approvedOccasionIds: ["wedding"], maxSpecificOccasions: 10,
  catalog: ["wedding", "birthday"].map((id, sortOrder) => ({id, sortOrder, active: true,
    moderationState: "approved", applicableServiceCategoryCodes: ["catering_service"]})), ...extra});
const specific = (extra = {}) => ({occasionSchemaVersion: 2, occasionScope: "specific",
  occasionIds: ["wedding"], eventType: "wedding", occasionMatchIds: ["wedding"],
  occasionCatalogRevision: 3, providerEligibilityRevision: 5, occasionEligibilityState: "valid",
  isPublished: true, status: "published", ...extra});

test("universal packages missing a new occasion grant are invalidated as a whole", () => {
  const original = specific({occasionScope: "all", occasionIds: []});
  const before = structuredClone(original);
  const result = plan(original, authority());
  assert.equal(result.reason, "UNIVERSAL_REVALIDATION_REQUIRED");
  assert.deepEqual(result.publicMembership, []); assert.deepEqual(result.proposedMembership, []);
  assert.equal(result.requiresWithdrawal, true); assert.deepEqual(original, before);
});
test("specific inactive or revoked IDs remain selected for manual repair", () => {
  for (const context of [authority({approvedOccasionIds: []}), authority({catalog: []})]) {
    const result = plan(specific(), context);
    assert.equal(result.state, "review_required"); assert.deepEqual(result.selectedOccasionIds, ["wedding"]);
    assert.equal(result.historicalEventType, "wedding"); assert.deepEqual(result.publicMembership, []);
  }
});
test("stale catalog/provider revisions and memberships are excluded by the local plan", () => {
  for (const patch of [{occasionCatalogRevision: 2}, {providerEligibilityRevision: 4},
    {occasionMatchIds: ["birthday"]}, {occasionEligibilityState: "review_required"}]) {
    const result = plan(specific(patch), authority());
    assert.equal(result.reason, "STALE_DISCOVERY_MEMBERSHIP"); assert.deepEqual(result.publicMembership, []);
    assert.deepEqual(result.proposedMembership, ["wedding"]);
  }
});
test("valid selections and drafts never become publication or booking authorization", () => {
  for (const record of [specific(), specific({isPublished: false, status: "draft"})]) {
    const result = plan(record, authority());
    assert.equal(result.publicationAllowed, false); assert.equal(result.bookingAllowed, false);
    assert.equal(result.withdrawalVerified, false); assert.deepEqual(result.publicMembership, []);
    assert.equal(result.requiresWithdrawal, record.isPublished);
  }
});
test("V1 is preserved and unknown or mixed schemas fail closed", () => {
  const legacy = {eventType: "birthday", isPublished: false};
  assert.equal(plan(legacy, authority()).reason, "LEGACY_COMPATIBILITY_UNVERIFIED");
  assert.deepEqual(legacy, {eventType: "birthday", isPublished: false});
  for (const patch of [{occasionSchemaVersion: 3}, {occasionMatchIds: ["birthday"]}, {occasionScope: "all"}]) {
    assert.equal(plan({...legacy, ...patch}, authority()).reason, "INVALID_OCCASION_SCHEMA");
  }
});
test("all scope never becomes specific, even after deactivation with empty applicability", () => {
  const record = specific({occasionScope: "all", occasionIds: []});
  const result = plan(record, authority({catalog: []}));
  assert.equal(result.state, "review_required"); assert.equal(record.occasionScope, "all");
  assert.deepEqual(record.occasionIds, []);
});
test("legacy event selections or add-on applicability cannot supply catering grants", () => {
  for (const context of [authority({approvedOccasionIds: []}),
    authority({approvedActiveCategoryCodes: ["photographer"]})]) {
    assert.equal(plan(specific({eventTypesSupported: ["wedding"]}), context).state, "review_required");
  }
});
