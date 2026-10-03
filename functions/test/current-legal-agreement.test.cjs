const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {createRequire} = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {initialAgreementTypes} = require("../lib/shared/agreement-types.js");
const {publishDraftVersion} = require("../lib/shared/agreement-versions.js");
const {resolveCurrentAgreementByPurpose} = require("../lib/shared/current-agreement.js");

const version = (label, status) => ({
  name: "Published name", summary: `Summary ${label}`, version: label, status, effectiveDate: "2026-09-30",
  sections: [{title: "Policy", paragraphs: [`Admin text ${label}`]}],
  createdAt: null, publishedAt: status === "draft" ? null : "2026-09-30", archivedAt: null,
});

function harness() {
  const records = {
    agreementTypes: initialAgreementTypes(),
    agreementTemplates: [],
  };
  const filename = path.resolve(__dirname, "../lib/documents/current-legal-agreement.js");
  const realRequire = createRequire(filename);
  const stubs = {
    "firebase-functions/v2/https": {...realRequire("firebase-functions/v2/https"), onCall: (_options, handler) => handler},
    "../shared/firestore.js": {db: {collection: (name) => ({get: async () => ({
      docs: records[name].map((data) => ({id: data.code, data: () => data})),
    })})}},
    "../shared/function-options.js": {appCheckCallableOptions: {}},
  };
  const exports = {};
  vm.runInNewContext(readFileSync(filename, "utf8"), {exports, require: (name) => stubs[name] ?? realRequire(name)}, {filename});
  return {records, get: (purpose) => exports.getCurrentLegalAgreement({data: {purpose}})};
}

for (const [purpose, code] of [["platform_terms", "terms_of_service"], ["privacy_notice", "privacy_policy"]]) {
  test(`${purpose}: public callable returns only Current, then newly published 1.1`, async () => {
    const h = harness();
    const record = {code: "renamed_lineage", agreementTypeCode: code, status: "discontinued", versions: [version("0.9", "archived"), version("1.0", "current"), version("1.1", "draft")]};
    h.records.agreementTemplates.push(record);
    const before = await h.get(purpose);
    assert.equal(before.agreement.version, "1.0");
    assert.equal(before.agreement.summary, "Summary 1.0");
    assert.equal(before.agreement.name, "Published name");
    assert.equal(before.agreement.versions, undefined);
    assert.equal(JSON.stringify(before).includes("Admin text 1.1"), false);
    assert.equal(JSON.stringify(before).includes("Admin text 0.9"), false);
    record.versions = publishDraftVersion({versions: record.versions, version: "1.1", name: "Published name", now: "2026-10-01"});
    assert.equal((await h.get(purpose)).agreement.version, "1.1");
    assert.equal((await h.get(purpose)).agreement.summary, "Summary 1.1");
    assert.equal(record.status, "discontinued");
  });
  for (const scenario of ["missing", "draft", "archived", "legacy", "duplicate", "two-current", "malformed-current", "untrusted"]) {
    test(`${purpose}: ${scenario} returns unavailable`, async () => {
      const h = harness();
      const record = {code: "policy", agreementTypeCode: code, ...version("1.0", "current"), versions: [version("1.0", "current")]};
      h.records.agreementTemplates.push(record);
      if (scenario === "missing") h.records.agreementTemplates = [];
      if (["draft", "archived"].includes(scenario)) record.versions = [version("1.0", scenario)];
      if (scenario === "legacy") delete record.versions;
      if (scenario === "duplicate") h.records.agreementTemplates.push({code: "another", agreementTypeCode: code, versions: []});
      if (scenario === "two-current") record.versions.push(version("1.1", "current"));
      if (scenario === "malformed-current") record.versions.push({status: "current"});
      if (scenario === "untrusted") h.records.agreementTypes.find((type) => type.code === code).purpose = "custom";
      assert.equal((await h.get(purpose)).agreement, null);
    });
  }
}

test("public callable rejects provider/custom purposes and ignores forged document selection", async () => {
  const h = harness();
  for (const purpose of ["provider_onboarding", "custom", undefined, "Privacy Policy"]) {
    await assert.rejects(h.get(purpose), {code: "invalid-argument"});
  }
});

test("shared resolver supports trusted provider_onboarding Current without matching names", () => {
  const current = resolveCurrentAgreementByPurpose("provider_onboarding", initialAgreementTypes(), [
    {code: "renamed_provider", agreementTypeCode: "provider_agreement", versions: [version("1.0", "current"), version("1.1", "draft")]},
    {code: "terms", agreementTypeCode: "terms_of_service", versions: [version("2.0", "current")]},
  ]);
  assert.equal(current.code, "renamed_provider");
  assert.equal(current.version, "1.0");
});

test('legacy Summary is retained only by its owning version and then archived intact', () => {
  const {agreementVersionsFromDocument} = require('../lib/shared/agreement-versions.js');
  const versions = agreementVersionsFromDocument({
    version: '1.0', summary: 'Existing published summary', versions: [
      {...version('0.9', 'archived'), summary: undefined},
      {...version('1.0', 'current'), summary: undefined},
    ].map(({summary, ...entry}) => entry),
  }).versions;
  assert.equal(versions[0].summary, undefined);
  assert.equal(versions[1].summary, 'Existing published summary');
  const next = publishDraftVersion({versions: [...versions, {...version('1.1', 'draft'), summary: 'Replacement summary'}], version: '1.1', name: 'Published name', now: '2026-10-01'});
  assert.equal(next.find((entry) => entry.version === '1.0').summary, 'Existing published summary');
  assert.equal(next.find((entry) => entry.version === '0.9').summary, undefined);
});
