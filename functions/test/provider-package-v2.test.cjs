const test = require("node:test");
const assert = require("node:assert/strict");
const occasion = require("../lib/packages/occasion-v2-validation.js");
const offer = require("../lib/packages/offer-v2-validation.js");
const suggestion = require("../lib/packages/occasion-suggestion-v2-validation.js");
const key = "phase1_contract_12345";
const stamp = {seconds: 1, nanoseconds: 0};
function entry(id, overrides = {}) {
  return {id, label: id, normalizedName: id, aliases: [], active: true,
    moderationState: "approved", applicableServiceCategoryCodes: ["catering_service"], sortOrder: 1,
    revision: 1, createdBy: "private-admin", createdAt: stamp, updatedAt: stamp, ...overrides};
}
function authority(overrides = {}) {
  return {catalog: [entry("wedding", {sortOrder: 2}), entry("birthday")],
    approvedOccasionIds: ["birthday", "wedding"], serviceCategoryCode: "catering_service",
    approvedActiveCategoryCodes: ["catering_service"], catalogRevision: 7,
    providerEligibilityRevision: 3, maxSpecificOccasions: 10, ...overrides};
}
function selection(ids = ["birthday"], scope = "specific") {
  return {occasionSchemaVersion: 2, occasionScope: scope, occasionIds: ids};
}
function capability(overrides = {}) {
  return {providerId: "provider_1", approveOccasionIds: ["birthday"], revokeOccasionIds: [],
    expectedProviderEligibilityRevision: 1, expectedCatalogRevision: 1, reason: "Approved scope review",
    idempotencyKey: key, ...overrides};
}
function pricing(overrides = {}) {
  return {offerSchemaVersion: 2, price: 1.01, serviceOptions: {
    drop_off: {price: 1.01, includedServices: ["Delivery", "shared"]},
    full_service: {price: 2.02, includedServices: ["Staff"], equipmentInclusions: ["Warmers"]},
  }, serviceInclusions: ["Shared"], decorInclusions: [], furnitureInclusions: [], foodInclusions: ["Meal"],
  ...overrides};
}
function fails(fn, reason) {
  assert.throws(fn, (e) => e.details?.reason === reason);
}

test("specific selection uses current server authority and preserves eligible legacy primary", () => {
  const v = occasion.resolveOccasionV2(selection(["wedding", "birthday"]), authority(), "wedding");
  assert.deepEqual(v.occasionIds, ["birthday", "wedding"]);
  assert.equal(v.eventType, "wedding");
  assert.equal(v.occasionCatalogRevision, 7);
  assert.equal(v.providerEligibilityRevision, 3);
  assert.equal(occasion.resolveOccasionV2(selection(), authority(), "other").eventType, "birthday");
});

test("selection limit is required server configuration, configurable beyond initial ten", () => {
  const ids = Array.from({length: 11}, (_, i) => `occasion_${i}`);
  const context = authority({catalog: ids.map((id) => entry(id)), approvedOccasionIds: ids});
  assert.equal(occasion.resolveOccasionV2(selection(ids.slice(0, 10)), context).occasionIds.length, 10);
  fails(() => occasion.resolveOccasionV2(selection(ids), context), "INVALID_OCCASION_SELECTION");
  assert.equal(occasion.resolveOccasionV2(selection(ids), {...context, maxSpecificOccasions: 11}).occasionIds.length, 11);
  for (const max of [undefined, null, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "10"]) {
    fails(() => occasion.parseWritableOccasionV2(selection(), max), "CONFIG_UNAVAILABLE");
  }
});

test("all scope requires every applicable capability and a valid primary, independent of specific limit", () => {
  const all = selection([], "all");
  assert.deepEqual(occasion.resolveOccasionV2(all, authority({maxSpecificOccasions: 1})).occasionMatchIds,
    ["birthday", "wedding"]);
  fails(() => occasion.resolveOccasionV2(all, authority({approvedOccasionIds: ["birthday"]})), "UNIVERSAL_REVALIDATION_REQUIRED");
  fails(() => occasion.resolveOccasionV2(all, authority({catalog: []})), "INVALID_OCCASION_SELECTION");
  fails(() => occasion.resolveOccasionV2(selection(["birthday"], "all"), authority()), "INVALID_OCCASION_SELECTION");
});

test("malformed, duplicate, partial, server-owned and unauthorized selection fields fail closed", () => {
  assert.equal(occasion.occasionId("aa"), "aa");
  assert.equal(occasion.occasionId("a".repeat(64)).length, 64);
  for (const value of [null, [], {}, {eventType: "birthday"}, selection([]), selection(["birthday", "birthday"]),
    selection(["Birthday"]), selection(["a"]), selection(["a".repeat(65)]), selection(["../birthday"]),
    selection(["unknown"]), selection(["1birthday"]),
    selection([null]), selection(new Array(1)), {...selection(), occasionSchemaVersion: 1},
    {...selection(), occasionScope: "unknown"}]) {
    fails(() => occasion.resolveOccasionV2(value, authority()), "INVALID_OCCASION_SELECTION");
  }
  for (const value of [{...selection(), eventType: "birthday"},
    {...selection(), occasionEligibilityState: "valid"}, {...selection(), occasionMatchIds: ["birthday"]},
    {...selection(), providerEligibilityRevision: 1}, {...selection(), occasionCatalogRevision: 1}]) {
    fails(() => occasion.resolveOccasionV2(value, authority()), "UNKNOWN_FIELD");
  }
  fails(() => occasion.resolveOccasionV2(selection(), authority({approvedOccasionIds: []})), "PROVIDER_OCCASION_INELIGIBLE");
  fails(() => occasion.resolveOccasionV2(selection(), authority({catalog: [entry("birthday", {active: false})]})), "OCCASION_INACTIVE");
  fails(() => occasion.resolveOccasionV2(selection(), authority({catalog: [entry("birthday", {applicableServiceCategoryCodes: ["different"]})]})), "INVALID_OCCASION_SELECTION");
  fails(() => occasion.resolveOccasionV2(selection(), authority({approvedActiveCategoryCodes: []})), "INVALID_SERVICE_CATEGORY");
});

test("public projection has exactly five fields, filters private/inactive records, clones arrays and sorts", () => {
  const catalog = [entry("wedding"), entry("birthday"), entry("other", {active: false}),
    entry("invalid", {moderationState: "pending"})];
  const result = occasion.projectPublicOccasions(catalog, ["catering_service"], "catering_service");
  assert.deepEqual(result.map((v) => v.id), ["birthday", "wedding"]);
  assert.deepEqual(Object.keys(result[0]).sort(), ["id", "label", "applicableServiceCategoryCodes", "sortOrder", "revision"].sort());
  result[0].applicableServiceCategoryCodes.push("mutation");
  assert.equal(catalog[1].applicableServiceCategoryCodes.length, 1);
  fails(() => occasion.projectPublicOccasions(catalog, [], "catering_service"), "INVALID_SERVICE_CATEGORY");
});

test("capability requests enforce exact shape, disjoint unique deltas, revisions and mutation keys", () => {
  assert.equal(occasion.parseCapabilityChange(capability()).providerId, "provider_1");
  for (const patch of [{active: true}, {isAdmin: true}, {eventTypesSupported: ["birthday"]},
    {approveOccasionIds: []}, {approveOccasionIds: ["birthday", "birthday"]},
    {revokeOccasionIds: ["birthday"]}, {expectedCatalogRevision: 0}, {expectedProviderEligibilityRevision: 1.1},
    {providerId: "../foreign"}, {idempotencyKey: "short"}, {reason: null}]) {
    fails(() => occasion.parseCapabilityChange(capability(patch)), "INVALID_CAPABILITY_CHANGE");
  }
});

test("capability reason counts Unicode code points after trim: 9/10/500/501 and malicious text", () => {
  for (const n of [10, 500]) assert.equal([...occasion.parseCapabilityChange(capability({reason: `  ${"😀".repeat(n)}  `})).reason].length, n);
  for (const reason of ["x".repeat(9), "😀".repeat(501), "valid reason\n", "valid\u200breason", "valid\u202ereason",
    "valid\u00adreason", "valid\ud800reason", "valid\ufe0freason"]) {
    fails(() => occasion.parseCapabilityChange(capability({reason})), "INVALID_CAPABILITY_CHANGE");
  }
});

test("capability semantic checks distinguish inactive revocation from unauthorized grants", () => {
  const context = {catalog: [entry("birthday"), entry("wedding", {active: false})],
    heldOccasionIds: ["wedding"], approvedActiveCategoryCodes: ["catering_service"], providerOperationallyApproved: true};
  occasion.validateCapabilityDelta(capability(), context);
  occasion.validateCapabilityDelta(capability({approveOccasionIds: [], revokeOccasionIds: ["wedding"]}),
    {...context, providerOperationallyApproved: false});
  for (const c of [{...context, providerOperationallyApproved: false}, {...context, heldOccasionIds: ["birthday"]},
    {...context, approvedActiveCategoryCodes: []}, {...context, catalog: []}]) {
    fails(() => occasion.validateCapabilityDelta(capability(), c), "INVALID_CAPABILITY_CHANGE");
  }
});

test("PHP decimals convert exactly without rounding; invalid money never falls back", () => {
  for (const [value, cents] of [[0.01, 1], [0.29, 29], [1.01, 101], [250.1, 25010], [10_000_000, 1_000_000_000]]) {
    assert.equal(offer.phpCentavos(value), cents);
  }
  for (const value of [0, -0, -1, NaN, Infinity, null, "1.00", 0.001, 1.005, 10_000_000.01,
    Number.MAX_SAFE_INTEGER, 0.1 + 0.2, undefined]) fails(() => offer.phpCentavos(value), "INVALID_PRICE");
  assert.equal(offer.offerTotalCentavos(101, 100, 1, 100, "per_pax"), 10100);
  assert.equal(offer.offerTotalCentavos(101, 100, 1, 100, "per_bundle"), 101);
  assert.equal(offer.offerTotalCentavos(101, 100, 1, 100), 101);
  assert.equal(offer.offerTotalCentavos(1_000_000_000, 100_000, 1, 100_000, "per_pax"), 100_000_000_000_000);
  for (const args of [[101, 0, 1, 100], [101, 2.5, 1, 100], [101, 101, 1, 100],
    [101, 1, 2, 1], [Number.MAX_SAFE_INTEGER, 100000, 1, 100000], [101, 1, 1, 100, "forged"]]) {
    fails(() => offer.offerTotalCentavos(...args), "INVALID_PRICE");
  }
});

test("selected tier resolves shared-first normalized dedupe with no other-tier leakage", () => {
  const value = pricing({equipmentInclusions: ["Shared warmer"]});
  const resolved = offer.resolveOfferV2(value, "drop_off");
  assert.deepEqual(resolved.serviceInclusions, ["Shared", "Delivery"]);
  assert.deepEqual(resolved.equipmentInclusions, ["Shared warmer"]);
  assert.equal(resolved.unitCentavos, 101);
  assert.deepEqual(offer.resolveOfferV2(value, "full_service").equipmentInclusions, ["Shared warmer", "Warmers"]);
  assert.deepEqual(offer.inclusionList(["  Ｄｅｌｉｖｅｒｙ  ", "delivery", "Two   spaces"]), ["Ｄｅｌｉｖｅｒｙ", "Two spaces"]);
  assert.deepEqual(offer.resolveOfferV2(pricing({serviceOptions: {drop_off: {price: 1.01, includedServices: []}}}), "drop_off").serviceInclusions, ["Shared"]);
  const items = Array.from({length: 50}, (_, i) => `shared ${i}`);
  const tier = Array.from({length: 50}, (_, i) => `tier ${i}`);
  assert.equal(offer.resolveOfferV2(pricing({serviceInclusions: items,
    serviceOptions: {drop_off: {price: 1.01, includedServices: tier}}}), "drop_off").serviceInclusions.length, 100);
});

test("tier structures, raw inclusion limits, null/absent semantics and prices are strict", () => {
  for (const tier of [undefined, null, "unknown", "buffet_setup"]) fails(() => offer.resolveOfferV2(pricing(), tier), "INVALID_INCLUSION");
  fails(() => offer.parseServiceOptionV2({price: 1, includedServices: [], enabled: true}), "UNKNOWN_FIELD");
  for (const input of [null, {}, {price: 1, includedServices: [], equipmentInclusions: null},
    {price: 1, includedServices: [" "]}, {price: 1, includedServices: Array(51).fill("duplicate")},
    {price: 1, includedServices: ["x".repeat(161)]}, {price: 1, includedServices: ["control\ttext"]}]) {
    fails(() => offer.parseServiceOptionV2(input), "INVALID_INCLUSION");
  }
  assert.equal(offer.inclusionList(["x".repeat(160)])[0].length, 160);
  for (const patch of [{pricingModel: null}, {pricingModel: "legacy"}, {equipmentInclusions: undefined},
    {serviceOptions: {unknown: {price: 1, includedServices: []}}}]) {
    fails(() => offer.parseOfferV2(pricing(patch)), "INVALID_INCLUSION");
  }
  fails(() => offer.parseOfferV2(pricing({ownerId: "forged"})), "UNKNOWN_FIELD");
  fails(() => offer.parseOfferV2(pricing({price: 2.02})), "INVALID_PRICE");
  fails(() => offer.parseOfferV2(pricing({serviceOptions: {}})), "INVALID_PRICE");
  assert.equal(offer.resolveOfferV2(pricing({serviceOptions: {}}), null, true).tier, null);
  fails(() => offer.resolveOfferV2(pricing({serviceOptions: {}}), "drop_off", true), "INVALID_INCLUSION");
});

test("suggestion/review shapes keep server metadata out and enforce four exact variants", () => {
  assert.deepEqual(suggestion.parseOccasionSuggestion({name: "  Birthday   party ", reason: " ", idempotencyKey: key}),
    {name: "Birthday party", idempotencyKey: key});
  fails(() => suggestion.parseOccasionSuggestion({name: "Valid", idempotencyKey: key, providerId: "foreign"}), "UNKNOWN_FIELD");
  const base = {suggestionId: "suggestion_1", expectedRevision: 1, expectedCatalogRevision: 1, reason: "Reviewed", idempotencyKey: key};
  const target = {targetOccasionId: "birthday", targetExpectedRevision: 1};
  for (const decision of ["map", "approve_existing_inactive"]) assert.equal(suggestion.parseOccasionReview({...base, decision, ...target}).decision, decision);
  assert.equal(suggestion.parseOccasionReview({...base, decision: "reject"}).decision, "reject");
  const fresh = {...base, decision: "approve_new", newOccasion: {id: "new_occasion", label: "New Occasion", aliases: [],
    applicableServiceCategoryCodes: ["catering_service"], sortOrder: 1}};
  assert.equal(suggestion.parseOccasionReview(fresh).newOccasion.id, "new_occasion");
  for (const value of [{...base, decision: "reject", ...target}, {...base, decision: "map"}, {...fresh, ...target},
    {...fresh, active: true}, {...base, decision: "reject", reviewedBy: "admin"}]) fails(() => suggestion.parseOccasionReview(value), "INVALID_REVIEW_TARGET");
  fails(() => suggestion.parseOccasionReview({...base, decision: "reject", reason: ""}), "INVALID_REVIEW_REASON");
});

test("prototype and accessor payloads are not plain JSON request objects", () => {
  fails(() => occasion.parseCapabilityChange(Object.create(capability())), "INVALID_CAPABILITY_CHANGE");
  const value = capability();
  Object.defineProperty(value, "reason", {get() { throw new Error("must not execute"); }, enumerable: true});
  fails(() => occasion.parseCapabilityChange(value), "INVALID_CAPABILITY_CHANGE");
  fails(() => occasion.parseCapabilityChange(JSON.parse('{"__proto__":{},"isAdmin":true}')), "INVALID_CAPABILITY_CHANGE");
});
