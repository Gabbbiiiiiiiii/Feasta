const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  providerAgreementAcceptanceWrite,
  resolveProviderAgreementAcceptance,
} = require("../lib/shared/provider-agreement-acceptance.js");

const original = {
  code: "feasta_provider_agreement",
  name: "FEASTA Provider Agreement",
  version: "2026-09-27",
  effectiveDate: "2026-09-27",
  sections: [{
    title: "1. Original terms",
    paragraphs: ["The provider accepted this original sentence."],
  }],
};

test("records the server agreement and rejects a client-selected version", () => {
  const rejected = resolveProviderAgreementAcceptance({
    clientVersion: "1999-01-01",
    current: original,
    existing: null,
  });
  assert.equal(rejected.action, "reject");
  assert.equal(rejected.acceptance, undefined);

  const recorded = resolveProviderAgreementAcceptance({
    clientVersion: original.version,
    current: original,
    existing: null,
  });
  assert.equal(recorded.action, "record");
  assert.equal(recorded.acceptance.providerAgreementVersion, "2026-09-27");
  assert.equal(recorded.acceptance.providerAgreementCode, original.code);
  assert.equal(recorded.acceptance.providerAgreementName, original.name);
  assert.equal(
    recorded.acceptance.providerAgreementEffectiveDate,
    original.effectiveDate,
  );
  assert.equal(
    recorded.acceptance.providerAgreementSnapshot.sections[0].paragraphs[0],
    "The provider accepted this original sentence.",
  );
  assert.equal(
    Object.hasOwn(recorded.acceptance, "providerAgreementAcceptedAt"),
    false,
  );

  original.sections[0].paragraphs[0] = "Mutated catalog text";
  assert.equal(
    recorded.acceptance.providerAgreementSnapshot.sections[0].paragraphs[0],
    "The provider accepted this original sentence.",
  );
  original.sections[0].paragraphs[0] =
    "The provider accepted this original sentence.";

  const stamp = {serverTimestamp: true};
  const fields = providerAgreementAcceptanceWrite(recorded.acceptance, stamp);
  assert.equal(fields.providerAgreementAccepted, true);
  assert.equal(fields.providerAgreementAcceptedAt, stamp);
  assert.equal(fields.providerAgreementSnapshot.acceptedAt, stamp);
  assert.equal(fields.providerAgreementVersion, "2026-09-27");
});

test("an agreement edit does not replace a previously accepted record", () => {
  const first = resolveProviderAgreementAcceptance({
    clientVersion: original.version,
    current: original,
    existing: null,
  });
  const stored = {
    providerAgreementAccepted: true,
    providerAgreementVersion: first.acceptance.providerAgreementVersion,
    providerAgreementAcceptedAt: {seconds: 10},
    providerAgreementSnapshot: {
      ...first.acceptance.providerAgreementSnapshot,
      acceptedAt: {seconds: 10},
    },
  };
  const updated = {
    ...original,
    version: "2026-10-01",
    effectiveDate: "2026-10-01",
    sections: [{
      title: "1. Replacement terms",
      paragraphs: ["This replacement sentence was never accepted."],
    }],
  };

  const stale = resolveProviderAgreementAcceptance({
    clientVersion: "2026-09-27",
    current: updated,
    existing: stored,
  });
  assert.equal(stale.action, "reject");
  assert.equal(
    stored.providerAgreementSnapshot.sections[0].paragraphs[0],
    "The provider accepted this original sentence.",
  );
  assert.equal(stored.providerAgreementSnapshot.version, "2026-09-27");

  const repeat = resolveProviderAgreementAcceptance({
    clientVersion: original.version,
    current: original,
    existing: stored,
  });
  assert.equal(repeat.action, "preserve");

  const reaccepted = resolveProviderAgreementAcceptance({
    clientVersion: updated.version,
    current: updated,
    existing: stored,
  });
  assert.equal(reaccepted.action, "record");
  assert.equal(reaccepted.acceptance.providerAgreementVersion, "2026-10-01");
  assert.equal(
    reaccepted.acceptance.providerAgreementSnapshot.sections[0].paragraphs[0],
    "This replacement sentence was never accepted.",
  );
  assert.equal(stored.providerAgreementSnapshot.version, "2026-09-27");
});

test("acceptance time is a trusted server timestamp", () => {
  const source = readFileSync(
    path.join(__dirname, "../src/providers/save-provider-onboarding-draft.ts"),
    "utf8",
  );
  assert.match(
    source,
    /providerAgreementAcceptanceWrite\(\s*decision\.acceptance,\s*serverTimestamp\(\),\s*\)/,
  );
  assert.doesNotMatch(
    source,
    /providerAgreementAcceptedAt:\s*(data|validated|input|request)\./,
  );
  const registration = readFileSync(
    path.join(__dirname, "../src/providers/register-provider.ts"),
    "utf8",
  );
  assert.match(registration, /providerAgreementSnapshot/);
  assert.match(
    registration,
    /providerAgreementAcceptedAt,\s*\n\s*\.\.\.\(providerAgreementSnapshot/,
  );
});
