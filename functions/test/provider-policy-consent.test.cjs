const assert = require("node:assert/strict");
const test = require("node:test");
const {providerPolicyConsentPatch} = require("../lib/auth/provider-policy-consent.js");
const input = {acceptedTerms: true, acceptedPrivacy: true,
  termsPolicyVersion: "terms-current", privacyPolicyVersion: "privacy-current"};
const current = {terms: "terms-current", privacy: "privacy-current"};
test("new consent records authoritative versions and server timestamp values", () => {
  const serverTimestamp = {server: true};
  assert.deepEqual(providerPolicyConsentPatch(null, input, current, () => serverTimestamp), {
    termsPolicyVersion: current.terms, privacyPolicyVersion: current.privacy,
    termsAcceptedAt: serverTimestamp, privacyAcceptedAt: serverTimestamp,
  });
});
test("historical consent is preserved even with newer submitted versions", () => {
  const historical = {termsPolicyVersion: "unversioned", privacyPolicyVersion: "older",
    termsAcceptedAt: {seconds: 1}, privacyAcceptedAt: {seconds: 2}};
  const before = structuredClone(historical);
  assert.deepEqual(providerPolicyConsentPatch(historical, input,
    {terms: null, privacy: null}, () => {throw new Error("must not timestamp");}), {});
  assert.deepEqual(historical, before);
});
test("partial historical consent only records the missing policy", () => {
  assert.deepEqual(providerPolicyConsentPatch({termsAcceptedAt: 1,
    termsPolicyVersion: "unversioned"}, input, current, () => 2), {
    privacyAcceptedAt: 2, privacyPolicyVersion: "privacy-current",
  });
});
test("new consent rejects unavailable, stale, unversioned and unchecked policies", () => {
  for (const [submitted, published] of [
    [input, {terms: null, privacy: current.privacy}],
    [{...input, termsPolicyVersion: "old"}, current],
    [{...input, termsPolicyVersion: "unversioned"}, current],
    [{...input, acceptedPrivacy: false}, current],
  ]) assert.throws(() => providerPolicyConsentPatch(null, submitted, published, () => 1),
    /unavailable or changed/);
});

test("incomplete historical evidence cannot silently change its version", () => {
  assert.throws(() => providerPolicyConsentPatch({termsPolicyVersion: "unversioned"},
    input, current, () => 1), /Existing policy version evidence requires review/);
});
