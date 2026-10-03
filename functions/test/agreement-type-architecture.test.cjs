const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {createRequire} = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {initialAgreementTypes} = require("../lib/shared/agreement-types.js");
const {
  compareNumericAgreementVersions,
  agreementVersionChoiceError,
  isRealCalendarDate,
} = require("../lib/shared/agreement-version-order.js");
const {
  parseActiveOnboardingAgreement,
  selectProviderOnboardingAgreement,
} = require("../lib/shared/provider-agreement-acceptance.js");

function catalogHarness(initial = {}) {
  const records = structuredClone({
    ...Object.fromEntries(initialAgreementTypes().map((type) => [`agreementTypes/${type.code}`, type])),
    "documentCategories/agreements": {status: "active"},
    ...initial,
  });
  const writes = [];
  const transaction = {
    get: async (ref) => ref.id ? {
      id: ref.id, exists: Boolean(records[ref.path]), data: () => records[ref.path],
    } : {
      docs: Object.entries(records)
        .filter(([key]) => key.startsWith(`${ref.path}/`))
        .map(([key, data]) => ({id: key.split("/")[1], ref: {path: key}, data: () => data})),
    },
    delete: (ref) => { delete records[ref.path]; writes.push(ref.path); },
    create: (ref, data) => { records[ref.path] = data; writes.push(ref.path); },
    update: (ref, data) => {
      records[ref.path] = {...records[ref.path], ...data};
      writes.push(ref.path);
    },
  };
  const db = {
    collection: (name) => ({path: name, doc: (id) => ({id, path: `${name}/${id}`})}),
    runTransaction: (callback) => callback(transaction),
  };
  const filename = path.resolve(__dirname, "../lib/admin/document-catalog-management.js");
  const realRequire = createRequire(filename);
  const stubs = {
    "firebase-functions/v2/https": {
      ...realRequire("firebase-functions/v2/https"),
      onCall: (_options, handler) => handler,
    },
    "../shared/audit.js": {writeAuditLogInTransaction() {}},
    "../shared/auth.js": {requireAuth: () => ({uid: "admin"})},
    "../shared/authorization.js": {requireRole: async () => {}},
    "../shared/document-catalog.js": realRequire("../shared/document-catalog-policy.js"),
    "../shared/firestore.js": {db},
    "../shared/function-options.js": {appCheckCallableOptions: {}},
    "../shared/rate-limit.js": {enforceCallableRateLimit: async () => {}},
    "../shared/timestamps.js": {serverTimestamp: () => "timestamp"},
  };
  const exports = {};
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    exports, require: (name) => stubs[name] ?? realRequire(name),
  }, {filename});
  return {handlers: exports, records, writes};
}

function section(text) {
  return [{title: "Terms", paragraphs: [text]}];
}

function agreementInput(code, agreementTypeCode, version = "1.0") {
  return {
    code,
    name: code.replaceAll("_", " "),
    summary: "Summary",
    version,
    effectiveDate: "2026-09-30",
    sections: section("Agreement text."),
    agreementTypeCode,
  };
}

function storedAgreement(code, agreementTypeCode, versions) {
  const current = versions.find((entry) => entry.status === "current");
  const visible = current ?? versions[0];
  return {
    code,
    categoryCode: "agreements",
    name: code,
    summary: "Summary",
    version: visible.version,
    effectiveDate: visible.effectiveDate,
    sections: visible.sections,
    agreementTypeCode,
    status: "active",
    sortName: code,
    versions,
    priorVersions: [],
  };
}

function version(label, status, text = `${label} text`) {
  return {
    version: label,
    name: "Agreement",
    effectiveDate: "2026-09-30",
    sections: section(text),
    status,
    createdAt: "2026-09-30T00:00:00.000Z",
    publishedAt: status === "draft" ? null : "2026-09-30T00:00:00.000Z",
    archivedAt: status === "archived" ? "2026-10-01T00:00:00.000Z" : null,
  };
}

test("numeric versions compare by number instead of text", () => {
  assert.equal(compareNumericAgreementVersions("1.10", "1.9"), 1);
  assert.equal(compareNumericAgreementVersions("2.0", "1.12"), 1);
  assert.equal(compareNumericAgreementVersions("10.0", "2.0"), 1);
  assert.equal(compareNumericAgreementVersions("1.0", "1"), 0);
  assert.equal(compareNumericAgreementVersions("2026-09-27", "1.0"), null);
  assert.equal(agreementVersionChoiceError("1.0", [{version: "1.1", status: "current"}]), "Enter a version newer than the current version 1.1.");
  assert.equal(agreementVersionChoiceError("1.1", [{version: "1.1", status: "current"}]), "Version 1.1 already exists for this agreement.");
  assert.equal(agreementVersionChoiceError("1.2", [{version: "1.1", status: "current"}]), null);
  assert.equal(agreementVersionChoiceError("1.10", [{version: "1.9", status: "current"}]), null);
  assert.equal(agreementVersionChoiceError("1.0", [
    {version: "1.0", status: "archived"},
    {version: "1.1", status: "current"},
  ]), "Version 1.0 already exists for this agreement.");
  assert.equal(agreementVersionChoiceError("1.0", [{version: "2026-09-27", status: "current"}]), null);
});

test("a new agreement starts as a draft and a forged publish flag cannot make it current", async () => {
  const harness = catalogHarness();
  const created = await harness.handlers.createAgreementTemplate({
    data: {...agreementInput("terms_of_service", "terms_of_service"), name: "Terms of Service"},
  });
  assert.equal(created.success, true);
  const saved = harness.records["agreementTemplates/terms_of_service"];
  assert.equal(saved.versions[0].status, "draft");
  assert.equal(saved.versions[0].publishedAt, null);
  assert.equal(saved.agreementTypeCode, "terms_of_service");
  assert.equal(saved.useForProviderOnboarding, undefined);
  await harness.handlers.updateAgreementTemplate({
    data: {...agreementInput("terms_of_service", "terms_of_service"), name: "Terms of Service", summary: "Edited draft"},
  });
  assert.equal(harness.records["agreementTemplates/terms_of_service"].versions[0].status, "draft");
});

test("forged requests cannot create a second singleton provider agreement", async () => {
  for (const [typeCode, existingCode] of [
    ["provider_agreement", "feasta_provider_agreement"],
    ["terms_of_service", "terms_of_service"],
    ["privacy_policy", "privacy_policy"],
  ]) {
    const harness = catalogHarness({
      [`agreementTemplates/${existingCode}`]: storedAgreement(existingCode, typeCode, [
        version("1.1", "current"),
      ]),
    });
    const before = harness.writes.length;
    await assert.rejects(harness.handlers.createAgreementTemplate({
      data: agreementInput(`${typeCode}_copy`, typeCode, "1.0"),
    }), (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /already exists/);
      return true;
    });
    assert.equal(harness.writes.length, before);
    assert.equal(harness.records[`agreementTemplates/${typeCode}_copy`], undefined);
  }
});

test("new custom agreements are rejected even when a legacy type record remains", async () => {
  const {parseAgreementType, isTrustedAgreementType} = require("../lib/shared/agreement-types.js");
  const legacy = {
    code: "custom_agreement",
    name: "Terms of Service",
    description: "Stored legacy type",
    purpose: "custom",
    singleton: false,
    requiresAcceptance: false,
    targetAudience: "custom",
    system: true,
    isActive: true,
    sortOrder: 40,
  };
  const parsed = parseAgreementType("custom_agreement", legacy);
  assert.equal(parsed.purpose, "custom");
  assert.equal(isTrustedAgreementType(parsed), false);
  const harness = catalogHarness({"agreementTypes/custom_agreement": legacy});
  await assert.rejects(harness.handlers.createAgreementTemplate({
    data: {...agreementInput("calendar_service", "custom_agreement"), name: "Terms of Service"},
  }), (error) => {
    assert.equal(error.code, "failed-precondition");
    assert.match(error.message, /not available/);
    return true;
  });
  assert.equal(harness.records["agreementTemplates/calendar_service"], undefined);
  assert.equal(harness.records["agreementTypes/custom_agreement"].name, "Terms of Service");
});

test("provider onboarding follows the published provider agreement version only", () => {
  const types = initialAgreementTypes();
  const provider = storedAgreement("feasta_provider_agreement", "provider_agreement", [
    version("1.1", "current", "Current 1.1 sentence."),
    version("1.2", "draft", "Draft 1.2 sentence."),
  ]);
  const terms = storedAgreement("terms_of_service", "terms_of_service", [
    version("1.0", "current", "Terms 1.0 sentence."),
  ]);
  const privacy = storedAgreement("privacy_policy", "privacy_policy", [
    version("1.0", "current", "Privacy 1.0 sentence."),
  ]);
  const custom = storedAgreement("calendar_service", "custom_agreement", [
    version("1.0", "current", "Calendar 1.0 sentence."),
  ]);
  const selected = selectProviderOnboardingAgreement([
    {id: "feasta_provider_agreement", data: provider},
    {id: "terms_of_service", data: terms},
    {id: "privacy_policy", data: privacy},
    {id: "calendar_service", data: custom},
  ], types);
  assert.equal(selected.version, "1.1");
  assert.equal(selected.sections[0].paragraphs[0], "Current 1.1 sentence.");
  provider.versions = provider.versions.map((entry) => entry.version === "1.2"
    ? {...entry, status: "current"}
    : {...entry, status: "archived"});
  const next = selectProviderOnboardingAgreement([
    {id: "feasta_provider_agreement", data: provider},
    {id: "terms_of_service", data: terms},
  ], types);
  assert.equal(next.version, "1.2");
  assert.equal(parseActiveOnboardingAgreement("calendar_service", custom, "provider_agreement"), null);
});

test("publishing one agreement does not change another agreement history", async () => {
  const providerPath = "agreementTemplates/feasta_provider_agreement";
  const cases = [
    ["terms_of_service", "terms_of_service"],
    ["privacy_policy", "privacy_policy"],
  ];
  for (const [code, typeCode] of cases) {
    const harness = catalogHarness({
      [providerPath]: storedAgreement("feasta_provider_agreement", "provider_agreement", [
        version("1.1", "current", "Provider 1.1 sentence."),
      ]),
      [`agreementTemplates/${code}`]: storedAgreement(code, typeCode, [
        version("1.0", "current", "Other 1.0 sentence."),
        version("1.1", "draft", "Other 1.1 sentence."),
      ]),
    });
    const before = structuredClone(harness.records[providerPath]);
    await harness.handlers.publishAgreementVersion({data: {code, version: "1.1"}});
    assert.deepEqual(harness.records[providerPath], before);
    assert.equal(harness.records[`agreementTemplates/${code}`].versions.find((entry) => entry.version === "1.0").status, "archived");
    assert.equal(harness.records[`agreementTemplates/${code}`].versions.find((entry) => entry.version === "1.1").status, "current");
  }
});

test("version progression is enforced inside one agreement and not across agreements", async () => {
  const harness = catalogHarness({
    "agreementTemplates/feasta_provider_agreement": storedAgreement("feasta_provider_agreement", "provider_agreement", [
      version("1.0", "archived"),
      version("1.1", "current"),
    ]),
    "agreementTemplates/terms_of_service": storedAgreement("terms_of_service", "terms_of_service", [
      version("1.0", "current", "Terms text."),
    ]),
  });
  for (const [nextVersion, pattern] of [
    ["1.0", /already exists/],
    ["1.1", /already exists/],
    ["1.0.9", /newer than the current version 1\.1/],
  ]) {
    await assert.rejects(harness.handlers.createAgreementVersion({
      data: {
        code: "feasta_provider_agreement",
        sourceVersion: "1.1",
        version: nextVersion,
        effectiveDate: "2026-12-01",
        sections: section("Rejected."),
      },
    }), (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, pattern);
      return true;
    });
  }
  const created = await harness.handlers.createAgreementVersion({
    data: {
      code: "feasta_provider_agreement",
      sourceVersion: "1.1",
      version: "1.2",
      effectiveDate: "2026-12-01",
      sections: section("Accepted 1.2."),
    },
  });
  assert.equal(created.agreement.versions.find((entry) => entry.version === "1.2").status, "draft");
  assert.equal(harness.records["agreementTemplates/feasta_provider_agreement"].version, "1.1");
  const newer = catalogHarness({
    "agreementTemplates/feasta_provider_agreement": storedAgreement("feasta_provider_agreement", "provider_agreement", [
      version("1.9", "current"),
    ]),
  });
  await newer.handlers.createAgreementVersion({
    data: {
      code: "feasta_provider_agreement",
      sourceVersion: "1.9",
      version: "1.10",
      effectiveDate: "2026-12-01",
      sections: section("Accepted 1.10."),
    },
  });
  assert.equal(newer.records["agreementTemplates/feasta_provider_agreement"].versions.find((entry) => entry.version === "1.10").status, "draft");
  assert.equal(harness.records["agreementTemplates/terms_of_service"].versions[0].version, "1.0");
  assert.equal(harness.records["agreementTemplates/terms_of_service"].versions[0].status, "current");
});

test("legacy version labels stay in place when a numeric version is added", async () => {
  const harness = catalogHarness({
    "agreementTemplates/feasta_provider_agreement": storedAgreement("feasta_provider_agreement", "provider_agreement", [
      version("2026-09-27", "current", "Legacy sentence."),
    ]),
  });
  await harness.handlers.createAgreementVersion({
    data: {
      code: "feasta_provider_agreement",
      sourceVersion: "2026-09-27",
      version: "1.0",
      effectiveDate: "2026-12-01",
      sections: section("First numeric draft."),
    },
  });
  const saved = harness.records["agreementTemplates/feasta_provider_agreement"];
  assert.equal(saved.versions.find((entry) => entry.version === "2026-09-27").status, "current");
  assert.equal(saved.versions.find((entry) => entry.version === "2026-09-27").sections[0].paragraphs[0], "Legacy sentence.");
  assert.equal(saved.versions.find((entry) => entry.version === "1.0").status, "draft");
  assert.equal(saved.version, "2026-09-27");
});

test("agreement type presentation can change and protected purpose cannot", async () => {
  const harness = catalogHarness();
  const updated = await harness.handlers.updateAgreementType({
    data: {
      code: "privacy_policy",
      name: "Personal Information Notice",
      description: "Updated description.",
      isActive: false,
      sortOrder: 35,
      purpose: "privacy_notice",
    },
  });
  assert.equal(updated.agreementType.name, "Personal Information Notice");
  assert.equal(updated.agreementType.purpose, "privacy_notice");
  assert.equal(updated.agreementType.singleton, true);
  assert.equal(harness.records["agreementTypes/privacy_policy"].purpose, "privacy_notice");
  await assert.rejects(harness.handlers.updateAgreementType({
    data: {
      code: "privacy_policy",
      name: "Personal Information Notice",
      description: "Updated description.",
      isActive: true,
      sortOrder: 35,
      purpose: "provider_onboarding",
    },
  }), (error) => {
    assert.equal(error.code, "failed-precondition");
    assert.match(error.message, /cannot be changed/);
    return true;
  });
  assert.equal(harness.records["agreementTypes/privacy_policy"].purpose, "privacy_notice");
});

test("calendar dates reject impossible days and months", () => {
  assert.equal(isRealCalendarDate("2026-09-30"), true);
  assert.equal(isRealCalendarDate("2024-02-29"), true);
  for (const value of ["2026-02-30", "2026-13-01", "2026-00-12", "2026/09/30", "2026-02-29", ""]) {
    assert.equal(isRealCalendarDate(value), false);
  }
});

test("agreement creation rejects invalid names, versions, summaries, and dates", async () => {
  const harness = catalogHarness();
  const cases = [
    [{...agreementInput("terms_of_service", "terms_of_service"), name: " "}, /Agreement name is required/],
    [{...agreementInput("terms_of_service", "terms_of_service"), name: "A"}, /between 2 and 120/],
    [{...agreementInput("terms_of_service", "terms_of_service"), name: "A".repeat(121)}, /between 2 and 120/],
    [{...agreementInput("terms_of_service", "terms_of_service"), name: "  Terms   of   Service  "}, null],
    [{...agreementInput("terms_of_service", "terms_of_service"), summary: "A".repeat(501)}, /500 characters/],
    [{...agreementInput("terms_of_service", "terms_of_service"), version: " "}, /valid version/],
    [{...agreementInput("terms_of_service", "terms_of_service"), effectiveDate: "2026-02-30"}, /valid effective date/],
    [{...agreementInput("terms_of_service", "terms_of_service"), effectiveDate: "2026-13-01"}, /valid effective date/],
    [{...agreementInput("terms_of_service", "terms_of_service"), status: "current"}, /agreement type/],
  ];
  for (const [data, pattern] of cases) {
    if (pattern) {
      await assert.rejects(harness.handlers.createAgreementTemplate({data}), (error) => {
        assert.match(error.message, pattern);
        return true;
      });
      assert.equal(harness.records["agreementTemplates/terms_of_service"], undefined);
    }
  }
  const created = await harness.handlers.createAgreementTemplate({
    data: {...agreementInput("terms_of_service", "terms_of_service"), name: "  Terms   of   Service  "},
  });
  assert.equal(created.agreement.name, "Terms of Service");
  assert.equal(harness.records["agreementTemplates/terms_of_service"].versions[0].status, "draft");
  await assert.rejects(harness.handlers.createAgreementTemplate({
    data: {...agreementInput("terms_of_service", "terms_of_service"), name: "Terms of Service"},
  }), /already exists/);
});

test("a singleton agreement must use its type name and an inactive type cannot be created", async () => {
  const harness = catalogHarness();
  await assert.rejects(harness.handlers.createAgreementTemplate({
    data: {...agreementInput("terms_of_service", "terms_of_service"), name: "Custom terms"},
  }), /Use the Terms of Service name/);
  harness.records["agreementTypes/privacy_policy"] = {
    ...harness.records["agreementTypes/privacy_policy"],
    isActive: false,
  };
  await assert.rejects(harness.handlers.createAgreementTemplate({
    data: {...agreementInput("privacy_policy", "privacy_policy"), name: "Privacy Policy"},
  }), /inactive/);
  assert.equal(harness.records["agreementTemplates/privacy_policy"], undefined);
});

test("publishing is explicit, transactional, and limited to the selected agreement", async () => {
  const providerPath = "agreementTemplates/feasta_provider_agreement";
  const termsPath = "agreementTemplates/terms_of_service";
  const harness = catalogHarness({
    [providerPath]: storedAgreement("feasta_provider_agreement", "provider_agreement", [
      version("1.1", "current", "Provider 1.1 sentence."),
    ]),
    [termsPath]: storedAgreement("terms_of_service", "terms_of_service", [
      version("1.0", "current", "Terms 1.0 sentence."),
      version("1.1", "draft", "Terms 1.1 sentence."),
      version("1.2", "draft", "Terms 1.2 sentence."),
    ]),
  });
  const before = structuredClone(harness.records[providerPath]);
  await assert.rejects(harness.handlers.publishAgreementVersion({
    data: {code: "terms_of_service", version: "9.9", sections: section("Forged.")},
  }), /Publishing only accepts/);
  assert.deepEqual(harness.records[providerPath], before);
  await assert.rejects(harness.handlers.publishAgreementVersion({
    data: {code: "terms_of_service", version: "9.9"},
  }), /not found|was not found/i);
  assert.equal(harness.records[termsPath].versions.find((entry) => entry.version === "1.0").status, "current");
  await harness.handlers.publishAgreementVersion({data: {code: "terms_of_service", version: "1.2"}});
  const terms = harness.records[termsPath].versions;
  assert.equal(terms.filter((entry) => entry.status === "current").length, 1);
  assert.equal(terms.find((entry) => entry.version === "1.0").status, "archived");
  assert.equal(terms.find((entry) => entry.version === "1.1").status, "draft");
  assert.equal(terms.find((entry) => entry.version === "1.2").status, "current");
  assert.deepEqual(harness.records[providerPath], before);
  await assert.rejects(harness.handlers.publishAgreementVersion({
    data: {code: "terms_of_service", version: "1.2"},
  }), /already been published/);
  assert.equal(harness.records[termsPath].versions.filter((entry) => entry.status === "current").length, 1);
});

test("provider onboarding cannot lose its only published agreement", async () => {
  const providerPath = "agreementTemplates/feasta_provider_agreement";
  const harness = catalogHarness({
    [providerPath]: storedAgreement("feasta_provider_agreement", "provider_agreement", [
      version("1.1", "current", "Provider 1.1 sentence."),
      version("1.2", "draft", "Provider 1.2 sentence."),
    ]),
    "agreementTemplates/terms_of_service": storedAgreement("terms_of_service", "terms_of_service", [
      version("1.0", "current", "Terms 1.0 sentence."),
    ]),
  });
  await assert.rejects(harness.handlers.discontinueAgreementTemplate({
    data: {code: "feasta_provider_agreement"},
  }), /lifecycle changes are no longer supported/);
  assert.equal(harness.records[providerPath].status, "active");
  assert.equal(harness.records[providerPath].versions.find((entry) => entry.version === "1.2").status, "draft");
  await assert.rejects(harness.handlers.discontinueAgreementTemplate({data: {code: "terms_of_service"}}), /no longer supported/);
  assert.equal(harness.records["agreementTemplates/terms_of_service"].status, "active");
  assert.equal(harness.records["agreementTemplates/terms_of_service"].versions[0].status, "current");
  assert.equal(harness.records[providerPath].versions.find((entry) => entry.version === "1.1").status, "current");
  await assert.rejects(harness.handlers.deleteAgreementVersion({
    data: {code: "feasta_provider_agreement", version: "1.1"},
  }), /current agreement version cannot be deleted/);
  harness.records[providerPath] = {...harness.records[providerPath], status: "discontinued"};
  await assert.rejects(harness.handlers.deleteAgreementTemplate({
    data: {code: "feasta_provider_agreement"},
  }), /cannot be permanently deleted/);
  assert.equal(harness.records[providerPath].versions.find((entry) => entry.version === "1.1").sections[0].paragraphs[0], "Provider 1.1 sentence.");
  await harness.handlers.publishAgreementVersion({
    data: {code: "feasta_provider_agreement", version: "1.2"},
  });
  assert.equal(harness.records[providerPath].status, "discontinued");
  assert.equal(harness.records[providerPath].versions.find((entry) => entry.version === "1.2").status, "current");
});

for (const type of initialAgreementTypes()) {
  for (const status of ['active', 'discontinued']) {
    test(`${type.code} ${status}: retired lifecycle endpoints never write`, async () => {
      const code = 'test_agreement';
      const record = {...storedAgreement(code, type.code, [version('1.0', 'current')]), status};
      const harness = catalogHarness({[`agreementTemplates/${code}`]: record});
      for (const action of ['discontinueAgreementTemplate', 'reactivateAgreementTemplate']) {
        await assert.rejects(harness.handlers[action]({data: {code}}), /no longer supported/);
      }
      await assert.rejects(harness.handlers.deleteAgreementTemplate({data: {code}}), /cannot be permanently deleted/);
      assert.deepEqual(harness.writes, []);
      assert.deepEqual(harness.records[`agreementTemplates/${code}`], record);
    });
  }
}

for (const type of initialAgreementTypes()) {
  test(`${type.code}: deleting draft beside current preserves history`, async () => {
    const code = 'test_agreement';
    const current = version('1.0', 'current');
    const harness = catalogHarness({[`agreementTemplates/${code}`]: storedAgreement(code, type.code, [current, version('1.1', 'draft')])});
    await harness.handlers.deleteAgreementVersion({data: {code, version: '1.1'}});
    assert.deepEqual(JSON.parse(JSON.stringify(harness.records[`agreementTemplates/${code}`].versions)), [{...current, summary: "Summary"}]);
  });
  test(`${type.code}: deleting never-published draft removes empty lineage`, async () => {
    const code = 'test_agreement';
    const harness = catalogHarness({[`agreementTemplates/${code}`]: storedAgreement(code, type.code, [version('1.0', 'draft')])});
    const result = await harness.handlers.deleteAgreementVersion({data: {code, version: '1.0'}});
    assert.equal(result.deletedCode, code);
    assert.equal(harness.records[`agreementTemplates/${code}`], undefined);
  });
}

for (const typeCode of ['terms_of_service', 'privacy_policy']) {
  test(`${typeCode}: draft summary is versioned, bounded, and published transactionally`, async () => {
    const code = typeCode;
    const type = initialAgreementTypes().find((entry) => entry.code === typeCode);
    const harness = catalogHarness();
    await harness.handlers.createAgreementTemplate({data: {
      ...agreementInput(code, typeCode), name: type.name, summary: 'Initial summary',
    }});
    const path = `agreementTemplates/${code}`;
    assert.equal(harness.records[path].versions[0].summary, 'Initial summary');
    await harness.handlers.publishAgreementVersion({data: {code, version: '1.0'}});
    const current = structuredClone(harness.records[path].versions[0]);
    const draftInput = {code, sourceVersion: '1.0', version: '1.1', effectiveDate: '2026-10-01', sections: section('New content')};
    await harness.handlers.createAgreementVersion({data: draftInput});
    assert.equal(harness.records[path].versions.find((entry) => entry.status === 'draft').summary, 'Initial summary');
    const editInput = {...draftInput, draftVersion: '1.1', summary: 'Updated draft summary'};
    await harness.handlers.updateAgreementVersion({data: editInput});
    assert.equal(harness.records[path].summary, 'Initial summary');
    assert.deepEqual(JSON.parse(JSON.stringify(harness.records[path].versions.find((entry) => entry.status === 'current'))), current);
    assert.equal(harness.records[path].versions.find((entry) => entry.status === 'draft').summary, 'Updated draft summary');
    const before = JSON.stringify(harness.records[path]);
    for (const summary of ['x'.repeat(501), 123]) {
      await assert.rejects(harness.handlers.updateAgreementVersion({data: {...editInput, summary}}), /500 characters/);
      assert.equal(JSON.stringify(harness.records[path]), before);
    }
    await assert.rejects(harness.handlers.publishAgreementVersion({data: {code, version: '1.1', summary: 'Forged summary'}}), /only accepts/);
    await harness.handlers.publishAgreementVersion({data: {code, version: '1.1'}});
    assert.equal(harness.records[path].summary, 'Updated draft summary');
    assert.equal(harness.records[path].versions.find((entry) => entry.status === 'archived').summary, 'Initial summary');
    assert.equal(harness.records[path].versions.find((entry) => entry.status === 'current').summary, 'Updated draft summary');
    assert.equal(harness.records[path].priorVersions[0].summary, 'Initial summary');
    await assert.rejects(harness.handlers.updateAgreementTemplate({data: {
      ...agreementInput(code, typeCode), name: type.name, version: '1.1', effectiveDate: '2026-10-01', sections: section('New content'), summary: 'Changed published summary',
    }}), /already been published/);
  });
}
