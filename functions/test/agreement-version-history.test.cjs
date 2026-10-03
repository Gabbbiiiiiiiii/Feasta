const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {createRequire} = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {parseAgreementText} = require("../lib/shared/agreement-text.js");
const {initialAgreementTypes} = require("../lib/shared/agreement-types.js");

const {
  parseActiveOnboardingAgreement,
  resolveProviderAgreementAcceptance,
  providerAgreementAcceptanceWrite,
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

function version(label, status, text, effectiveDate) {
  return {
    version: label,
    name: "FEASTA Provider Agreement",
    effectiveDate,
    sections: section(text),
    status,
    createdAt: "2026-09-29T00:00:00.000Z",
    publishedAt: status === "draft" ? null : "2026-09-29T00:00:00.000Z",
    archivedAt: status === "archived" ? "2026-10-01T00:00:00.000Z" : null,
  };
}

function agreementDocument(versions) {
  const current = versions.find((entry) => entry.status === "current");
  return {
    code: "feasta_provider_agreement",
    categoryCode: "agreements",
    name: "FEASTA Provider Agreement",
    summary: "Provider terms",
    version: current.version,
    effectiveDate: current.effectiveDate,
    sections: current.sections,
    agreementTypeCode: "provider_agreement",
    useForProviderOnboarding: true,
    status: "active",
    sortName: "feasta provider agreement",
    versions,
    priorVersions: [],
    createdBy: "original-admin",
  };
}

const agreementPath = "agreementTemplates/feasta_provider_agreement";

function publishedError(error) {
  assert.equal(error.code, "failed-precondition");
  assert.equal(
    error.message,
    "This agreement version has already been published. Create a new version to change the agreement text or effective date.",
  );
  return true;
}

for (const editingDraft of [false, true]) {
  test(`canonical text is stored when ${editingDraft ? "editing" : "creating"} a draft`, async () => {
    const publish = false;
      const archived = version("0.9", "archived", "Historical  spacing.\nOriginal line.", "2026-09-01");
      const current = version("1.0", "current", "Original 1.0 sentence.", "2026-09-29");
      const draft = version("1.1", "draft", "Draft only.", "2026-10-01");
      const acceptance = {providerAgreementSnapshot: {version: "1.0", sections: current.sections}};
      const harness = catalogHarness({
        [agreementPath]: agreementDocument(editingDraft ? [archived, current, draft] : [archived, current]),
        "providerVerifications/provider": acceptance,
      });
      const text = "1. PAYMENT\r\nThe Provider shall pay PHP 10,000. ".concat("One event per day. ".repeat(160));
      const {sections} = parseAgreementText(text);
      const handler = editingDraft ? harness.handlers.updateAgreementVersion : harness.handlers.createAgreementVersion;
      await handler({data: {
        code: "feasta_provider_agreement", version: "1.1", effectiveDate: "2026-10-01", sections, publish,
        ...(editingDraft ? {draftVersion: "1.1"} : {sourceVersion: "1.0"}),
      }});
      const saved = harness.records[agreementPath];
      const next = saved.versions.find((entry) => entry.version === "1.1");
      assert.deepEqual(next.sections, sections);
      assert.equal(next.status, publish ? "current" : "draft");
      assert.equal(saved.version, publish ? "1.1" : "1.0");
      assert.equal(saved.versions.filter((entry) => entry.status === "current").length, 1);
      assert.deepEqual(saved.versions[0], archived);
      assert.deepEqual(saved.versions[1].sections, current.sections);
      assert.equal(saved.versions[1].status, publish ? "archived" : "current");
      assert.deepEqual(harness.records["providerVerifications/provider"], acceptance);
      assert.deepEqual(harness.writes, [agreementPath]);
    });

  test(`saving cannot publish while ${editingDraft ? "editing" : "creating"} a draft`, async () => {
    const current = version("1.0", "current", "Original 1.0 sentence.", "2026-09-29");
    const draft = version("1.1", "draft", "Draft only.", "2026-10-01");
    const harness = catalogHarness({
      [agreementPath]: agreementDocument(editingDraft ? [current, draft] : [current]),
    });
    const handler = editingDraft ? harness.handlers.updateAgreementVersion : harness.handlers.createAgreementVersion;
    await assert.rejects(handler({data: {
      code: "feasta_provider_agreement",
      version: "1.1",
      effectiveDate: "2026-10-01",
      sections: section("Published from save."),
      publish: true,
      ...(editingDraft ? {draftVersion: "1.1"} : {sourceVersion: "1.0"}),
    }}), (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /cannot publish/);
      return true;
    });
    const saved = harness.records[agreementPath];
    assert.equal(saved.version, "1.0");
    assert.equal(saved.versions.find((entry) => entry.status === "current").version, "1.0");
    assert.equal(saved.versions.some((entry) => entry.version === "1.1" && entry.status === "current"), false);
    assert.deepEqual(harness.writes, []);
  });
}

test("callables reject malformed canonical sections without writing", async () => {
  for (const sections of [
    [], [{title: "Terms", paragraphs: [null]}],
    [{title: "Terms", paragraphs: ["X".repeat(2001)]}],
    [{title: "Terms", paragraphs: Array(13).fill("Term.")}],
    Array.from({length: 41}, () => ({title: "Terms", paragraphs: ["Term."]})),
  ]) {
    const harness = catalogHarness({[agreementPath]: agreementDocument([
      version("1.0", "current", "Original 1.0 sentence.", "2026-09-29"),
    ])});
    await assert.rejects(harness.handlers.createAgreementVersion({data: {
      code: "feasta_provider_agreement", sourceVersion: "1.0", version: "1.1",
      effectiveDate: "2026-10-01", sections,
    }}), (error) => {
      assert.equal(error.code, "invalid-argument");
      assert.equal(error.details.userMessage, error.message);
      return true;
    });
    assert.deepEqual(harness.writes, []);
  }
});

test("a draft can change its text and effective date without a new version label", async () => {
  const versions = [
    version("1.0", "current", "Original 1.0 sentence.", "2026-09-29"),
    version("1.1", "draft", "Draft sentence.", "2026-10-01"),
  ];
  const harness = catalogHarness({[agreementPath]: agreementDocument(versions)});
  const result = await harness.handlers.updateAgreementVersion({
    data: {
      code: "feasta_provider_agreement",
      draftVersion: "1.1",
      version: "1.1",
      effectiveDate: "2026-10-15",
      sections: section("Edited draft sentence."),
    },
  });
  assert.equal(result.success, true);
  const saved = harness.records[agreementPath];
  const draft = saved.versions.find((entry) => entry.version === "1.1");
  const current = saved.versions.find((entry) => entry.status === "current");
  assert.equal(draft.status, "draft");
  assert.equal(draft.effectiveDate, "2026-10-15");
  assert.equal(draft.sections[0].paragraphs[0], "Edited draft sentence.");
  assert.equal(current.version, "1.0");
  assert.equal(current.sections[0].paragraphs[0], "Original 1.0 sentence.");
  assert.equal(saved.version, "1.0");
  assert.equal(saved.sections[0].paragraphs[0], "Original 1.0 sentence.");
});

test("published text and effective date cannot be changed in place", async () => {
  const original = agreementDocument([
    version("1.0", "current", "Original 1.0 sentence.", "2026-09-29"),
  ]);
  for (const patch of [
    {sections: section("Rewritten 1.0 sentence.")},
    {effectiveDate: "2026-12-01"},
  ]) {
    const harness = catalogHarness({[agreementPath]: structuredClone(original)});
    await assert.rejects(
      harness.handlers.updateAgreementTemplate({
        data: {
          code: "feasta_provider_agreement",
          name: original.name,
          summary: original.summary,
          version: "1.0",
          effectiveDate: patch.effectiveDate ?? original.effectiveDate,
          sections: patch.sections ?? original.sections,
          agreementTypeCode: "provider_agreement",
          versions: [version("1.0", "current", "Forged history.", "1999-01-01")],
        },
      }),
      publishedError,
    );
    const saved = harness.records[agreementPath];
    assert.equal(saved.sections[0].paragraphs[0], "Original 1.0 sentence.");
    assert.equal(saved.effectiveDate, "2026-09-29");
    assert.equal(saved.versions[0].sections[0].paragraphs[0], "Original 1.0 sentence.");
    assert.deepEqual(harness.writes, []);
    assert.equal(saved.createdBy, "original-admin");
  }
});

test("archived versions cannot be edited, deleted, or made current again", async () => {
  const original = agreementDocument([
    version("1.0", "archived", "Original 1.0 sentence.", "2026-09-29"),
    version("1.1", "current", "Current 1.1 sentence.", "2026-11-01"),
  ]);
  const harness = catalogHarness({[agreementPath]: original});
  await assert.rejects(
    harness.handlers.updateAgreementVersion({
      data: {
        code: "feasta_provider_agreement",
        draftVersion: "1.0",
        version: "1.0",
        effectiveDate: "2026-09-29",
        sections: section("Changed archived sentence."),
      },
    }),
    publishedError,
  );
  await assert.rejects(
    harness.handlers.deleteAgreementVersion({
      data: {code: "feasta_provider_agreement", version: "1.0"},
    }),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /cannot be deleted/);
      return true;
    },
  );
  await assert.rejects(
    harness.handlers.publishAgreementVersion({
      data: {code: "feasta_provider_agreement", version: "1.0"},
    }),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /cannot become current again/);
      return true;
    },
  );
  const saved = harness.records[agreementPath];
  assert.equal(saved.versions[0].status, "archived");
  assert.equal(saved.versions[0].sections[0].paragraphs[0], "Original 1.0 sentence.");
  assert.equal(saved.versions[1].status, "current");
  assert.deepEqual(harness.writes, []);
});

test("publishing a new version archives the previous current version", async () => {
  const harness = catalogHarness({
    [agreementPath]: agreementDocument([
      version("1.0", "current", "Original 1.0 sentence.", "2026-09-29"),
    ]),
  });
  const drafted = await harness.handlers.createAgreementVersion({
    data: {
      code: "feasta_provider_agreement",
      sourceVersion: "1.0",
      version: " 1.1 ",
      effectiveDate: "2026-11-01",
      sections: section("Current 1.1 sentence."),
      publish: false,
    },
  });
  assert.equal(drafted.success, true);
  let saved = harness.records[agreementPath];
  assert.equal(saved.versions.find((entry) => entry.version === "1.0").status, "current");
  assert.equal(saved.versions.find((entry) => entry.version === "1.1").status, "draft");
  assert.equal(saved.version, "1.0");

  await assert.rejects(
    harness.handlers.createAgreementVersion({
      data: {
        code: "feasta_provider_agreement",
        sourceVersion: "1.0",
        version: "1.1",
        effectiveDate: "2026-11-01",
        sections: section("Duplicate."),
      },
    }),
    (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /already exists/);
      return true;
    },
  );

  const published = await harness.handlers.publishAgreementVersion({
    data: {code: "feasta_provider_agreement", version: "1.1"},
  });
  assert.equal(published.success, true);
  saved = harness.records[agreementPath];
  const current = saved.versions.filter((entry) => entry.status === "current");
  const archived = saved.versions.find((entry) => entry.version === "1.0");
  assert.equal(current.length, 1);
  assert.equal(current[0].version, "1.1");
  assert.equal(current[0].sections[0].paragraphs[0], "Current 1.1 sentence.");
  assert.equal(archived.status, "archived");
  assert.equal(archived.sections[0].paragraphs[0], "Original 1.0 sentence.");
  assert.equal(saved.version, "1.1");
  assert.equal(saved.sections[0].paragraphs[0], "Current 1.1 sentence.");
  assert.equal(saved.useForProviderOnboarding, true);
  assert.ok(harness.writes.every((path) => path === agreementPath));

  const visible = parseActiveOnboardingAgreement(
    "feasta_provider_agreement",
    saved,
    "provider_agreement",
  );
  assert.equal(visible.version, "1.1");
  assert.equal(visible.sections[0].paragraphs[0], "Current 1.1 sentence.");
});

test("an accepted 1.0 snapshot stays intact after 1.1 becomes current", async () => {
  const original = {
    code: "feasta_provider_agreement",
    name: "FEASTA Provider Agreement",
    version: "1.0",
    effectiveDate: "2026-09-29",
    sections: section("Original 1.0 sentence."),
  };
  const recorded = resolveProviderAgreementAcceptance({
    clientVersion: "1.0",
    current: original,
    existing: null,
  });
  const stamp = {seconds: 10};
  const stored = providerAgreementAcceptanceWrite(recorded.acceptance, stamp);
  const before = structuredClone(stored);
  const harness = catalogHarness({
    [agreementPath]: agreementDocument([
      version("1.0", "current", "Original 1.0 sentence.", "2026-09-29"),
      version("1.1", "draft", "Current 1.1 sentence.", "2026-11-01"),
    ]),
  });
  await harness.handlers.publishAgreementVersion({
    data: {code: "feasta_provider_agreement", version: "1.1"},
  });
  assert.deepEqual(stored, before);
  assert.equal(stored.providerAgreementAcceptedAt, stamp);
  assert.equal(stored.providerAgreementSnapshot.acceptedAt, stamp);
  assert.equal(stored.providerAgreementSnapshot.version, "1.0");
  assert.equal(
    stored.providerAgreementSnapshot.sections[0].paragraphs[0],
    "Original 1.0 sentence.",
  );

  const visible = parseActiveOnboardingAgreement(
    "feasta_provider_agreement",
    harness.records[agreementPath],
    "provider_agreement",
  );
  assert.equal(visible.version, "1.1");
  const stale = resolveProviderAgreementAcceptance({
    clientVersion: "1.0",
    current: visible,
    existing: stored,
  });
  assert.equal(stale.action, "reject");
  const fresh = resolveProviderAgreementAcceptance({
    clientVersion: "1.1",
    current: visible,
    existing: null,
  });
  assert.equal(fresh.action, "record");
  assert.equal(fresh.acceptance.providerAgreementVersion, "1.1");
  assert.equal(
    fresh.acceptance.providerAgreementSnapshot.sections[0].paragraphs[0],
    "Current 1.1 sentence.",
  );
  assert.deepEqual(stored, before);
  assert.ok(!Object.hasOwn(stored, "rewrittenAt"));
});

test("providers read the current version and never a draft", () => {
  const parsed = parseActiveOnboardingAgreement("feasta_provider_agreement", {
    status: "active",
    useForProviderOnboarding: false,
    agreementTypeCode: "provider_agreement",
    name: "FEASTA Provider Agreement",
    version: "1.2",
    effectiveDate: "2026-12-01",
    sections: section("Draft only text."),
    versions: [
      version("1.0", "archived", "Original 1.0 sentence.", "2026-09-29"),
      version("1.1", "current", "Current 1.1 sentence.", "2026-11-01"),
      version("1.2", "draft", "Draft only text.", "2026-12-01"),
    ],
  }, "provider_agreement");
  assert.equal(parsed.version, "1.1");
  assert.equal(parsed.sections[0].paragraphs[0], "Current 1.1 sentence.");
  assert.equal(
    parseActiveOnboardingAgreement("feasta_provider_agreement", {
      status: "active",
      useForProviderOnboarding: true,
      agreementTypeCode: "custom_agreement",
      name: "Provider Agreement",
      version: "1.1",
      effectiveDate: "2026-11-01",
      sections: section("Current 1.1 sentence."),
    }, "provider_agreement"),
    null,
  );
  assert.equal(
    parseActiveOnboardingAgreement("feasta_provider_agreement", {
      status: "active",
      useForProviderOnboarding: true,
      name: "FEASTA Provider Agreement",
      version: "1.1",
      effectiveDate: "2026-11-01",
      sections: section("Current 1.1 sentence."),
    }, "provider_agreement"),
    null,
  );
});

test("a metadata change does not rewrite published version text", async () => {
  const harness = catalogHarness({
    [agreementPath]: agreementDocument([
      version("1.0", "archived", "Original 1.0 sentence.", "2026-09-29"),
      version("1.1", "current", "Current 1.1 sentence.", "2026-11-01"),
    ]),
  });
  const before = structuredClone(harness.records[agreementPath].versions);
  await harness.handlers.updateAgreementTemplate({
    data: {
      code: "feasta_provider_agreement",
      name: "Renamed agreement",
      summary: "Provider terms",
      version: "1.1",
      effectiveDate: "2026-11-01",
      sections: section("Current 1.1 sentence."),
      agreementTypeCode: "provider_agreement",
    },
  });
  const saved = harness.records[agreementPath];
  assert.equal(saved.name, "Renamed agreement");
  assert.equal(saved.versions[0].sections[0].paragraphs[0], before[0].sections[0].paragraphs[0]);
  assert.equal(saved.versions[1].sections[0].paragraphs[0], before[1].sections[0].paragraphs[0]);
  assert.equal(saved.versions[0].status, "archived");
  assert.equal(saved.versions[1].status, "current");
  assert.equal(saved.versions[0].name, "FEASTA Provider Agreement");
});
