const assert = require("node:assert/strict");
const test = require("node:test");

const {
  initialBusinessDocumentTypes,
  resolveVerificationDocumentPolicy,
} = require("../lib/shared/document-catalog-policy.js");

const catalog = initialBusinessDocumentTypes();

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
  assert.deepEqual(individualCatering.requiredAll, ["valid_id"]);
  assert.deepEqual(individualCatering.requiredOneOf, [[
    "mayors_permit",
    "sanitary_permit",
  ]]);

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
