import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
import * as domain from "@feasta/shared-types/documents";
import * as shared from "../dist/index.js";
const require = createRequire(import.meta.url);
test("ESM and CommonJS consumers share the same policy implementation", () => {
  const cjs = require("@feasta/shared-types/documents");
  assert.equal(cjs.resolveVerificationDocumentPolicy, domain.resolveVerificationDocumentPolicy);
  assert.equal(shared.verificationDocumentRequirement, domain.verificationDocumentRequirement);
  assert.equal(shared.verificationDocumentsSatisfyPolicy, domain.verificationDocumentsSatisfyPolicy);
});
for (const venue of [false, true]) test(`current catalog requirements for catering (venue=${venue})`, () => {
  const policy = domain.resolveVerificationDocumentPolicy(domain.initialBusinessDocumentTypes(), domain.providerDocumentContext({providerServiceType: "catering", serviceCategories: venue ? ["venue_provider"] : []}));
  assert.equal(domain.verificationDocumentRequirement("sanitary_permit", policy), "required");
  assert.equal(domain.verificationDocumentRequirement("mayors_permit", policy), venue ? "required" : "optional");
});
test("one-of alternatives require one verified member", () => {
  const catalog = domain.initialBusinessDocumentTypes().filter(d => ["sanitary_permit", "mayors_permit"].includes(d.code)).map(d => ({...d, rules: [{effect: "one_of", oneOfGroup: "permit", registrationScope: "any", serviceTypes: [], serviceCategoryCodes: [], excludeServiceCategoryCodes: []}]}));
  const policy = domain.resolveVerificationDocumentPolicy(catalog, domain.providerDocumentContext({}));
  assert.deepEqual(policy.requiredAll, []);
  assert.equal(domain.verificationDocumentRequirement("mayors_permit", policy), "one_of");
  assert.equal(domain.verificationDocumentsSatisfyPolicy(new Set(["sanitary_permit"]), policy), true);
  assert.equal(domain.verificationDocumentsSatisfyPolicy(new Set(), policy), false);
});
