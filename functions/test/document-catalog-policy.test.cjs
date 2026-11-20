const assert = require("node:assert/strict");
const test = require("node:test");

const {
  initialBusinessDocumentTypes,
  resolveVerificationDocumentPolicy,
} = require("../lib/shared/document-catalog-policy.js");

const catalog = initialBusinessDocumentTypes();

test("current catalog preserves one-of alternatives without duplicate or individual requirements", () => {
  const {verificationDocumentsSatisfyPolicy} = require("../lib/shared/constants.js");
  const alternativeCatalog = catalog.filter((entry) => ["sanitary_permit", "mayors_permit"].includes(entry.code))
    .map((entry) => ({...entry, rules: [{effect: "one_of", oneOfGroup: "permit", registrationScope: "any",
      serviceTypes: ["catering"], serviceCategoryCodes: [], excludeServiceCategoryCodes: []}]}));
  const result = resolveVerificationDocumentPolicy(alternativeCatalog, {providerServiceType: "catering", serviceCategories: []});
  assert.deepEqual(result.requiredAll, []);
  assert.deepEqual(result.requiredOneOf, [["mayors_permit", "sanitary_permit"]]);
  assert.equal(verificationDocumentsSatisfyPolicy(new Set(["sanitary_permit"]), result), true);
  assert.equal(verificationDocumentsSatisfyPolicy(new Set(), result), false);
});

test("seeded document rules follow registration and service conditions", () => {
  const individualPhotographer = resolveVerificationDocumentPolicy(catalog, {
    providerServiceType: "addon",
    serviceCategories: ["photographer"],
    businessRegistrationType: "individual",
  });
  assert.deepEqual(individualPhotographer.requiredAll, ["valid_id"]);
  assert.deepEqual(individualPhotographer.requiredOneOf, []);

  const registeredPhotographer = resolveVerificationDocumentPolicy(catalog, {
    providerServiceType: "addon",
    serviceCategories: ["photographer"],
    businessRegistrationType: "registered_business",
  });
  assert.deepEqual(registeredPhotographer.requiredAll, [
    "bir_registration",
    "business_permit",
    "dti_registration",
    "valid_id",
  ]);
  assert.deepEqual(registeredPhotographer.requiredOneOf, []);

  const individualCatering = resolveVerificationDocumentPolicy(catalog, {
    providerServiceType: "catering",
    serviceCategories: ["catering_service"],
    businessRegistrationType: "individual",
  });
  assert.deepEqual(individualCatering.requiredAll, ["sanitary_permit", "valid_id"]);
  assert.deepEqual(individualCatering.requiredOneOf, []);

  const individualVenue = resolveVerificationDocumentPolicy(catalog, {
    providerServiceType: "addon",
    serviceCategories: ["venue_provider"],
    businessRegistrationType: "individual",
  });
  assert.deepEqual(individualVenue.requiredAll, [
    "mayors_permit",
    "valid_id",
  ]);
  assert.deepEqual(individualVenue.requiredOneOf, []);

  const legacyPhotographer = resolveVerificationDocumentPolicy(catalog, {
    providerServiceType: "addon",
    serviceCategories: ["photographer"],
  });
  assert.deepEqual(legacyPhotographer.requiredAll, [
    "bir_registration",
    "business_permit",
    "dti_registration",
    "valid_id",
  ]);
});
