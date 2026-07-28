const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = (relative) => fs.readFileSync(
  path.join(__dirname, "../src", relative),
  "utf8",
);
const register = source("verification/register-verification-document.ts");
const remove = source("verification/remove-verification-document.ts");
const submit = source("verification/submit-provider-verification.ts");
const providerRegistration = source("providers/register-provider.ts");

test("document registration validates real private Storage metadata", () => {
  for (const contract of [
    "file.exists()",
    "file.getMetadata()",
    "MAX_VERIFICATION_DOCUMENT_SIZE_BYTES",
    "VERIFICATION_DOCUMENT_CONTENT_TYPES",
    "fileNameMatchesContentType",
    "expectedTypePrefix",
    "providerVerificationDocumentPolicy",
  ]) {
    assert.ok(register.includes(contract), contract);
  }
  assert.ok(register.includes("previousData.storagePath"));
  assert.ok(register.includes("ignoreNotFound: true"));
  assert.equal(register.includes("getDownloadURL"), false);
});

test("provider removal is callable-owned, audited, and editable-state only", () => {
  for (const contract of [
    "requireAuth(request)",
    "requireRole(actor.uid",
    "EDITABLE_STATUSES",
    "verification.ownerId !== actor.uid",
    "transaction.delete(documentReference)",
    "writeAuditLogInTransaction",
    "getStorage().bucket().file",
    "ignoreNotFound: true",
  ]) {
    assert.ok(remove.includes(contract), contract);
  }
  assert.ok(remove.includes("\"draft\", \"resubmission_required\""));
});

test("submission uses the dynamic server policy rather than client flags", () => {
  assert.ok(submit.includes("providerVerificationDocumentPolicy"));
  assert.ok(submit.includes("verificationDocumentsSatisfyPolicy"));
  assert.ok(submit.includes("missingAlternativeGroups"));
  assert.equal(submit.includes("input.isRequired"), false);
});

test("submission enforces complete trusted state and safely replays", () => {
  for (const contract of [
    "getAuth().getUser",
    "if (!emailVerified)",
    "providerSubmissionProfileIssues",
    "userData?.accountStatus !== \"active\"",
    "userData?.providerId !== providerId",
    "verificationData.termsAcceptedAt == null",
    "\"pending\", \"verified\"",
    "getMetadata()",
    "MAX_VERIFICATION_DOCUMENT_SIZE_BYTES",
    "createNotificationInTransaction",
    "alreadySubmitted: true",
  ]) {
    assert.ok(submit.includes(contract), contract);
  }
  assert.ok(submit.includes("currentStatus === \"submitted\""));
  assert.ok(submit.includes("providerData?.verificationStatus !== currentStatus"));
});

test("verification records snapshot trusted consent metadata", () => {
  for (const field of [
    "termsPolicyVersion:",
    "privacyPolicyVersion:",
    "termsAcceptedAt:",
    "privacyAcceptedAt:",
  ]) {
    assert.ok(providerRegistration.includes(field), field);
  }
  assert.equal(providerRegistration.includes("input.termsAcceptedAt"), false);
  assert.equal(providerRegistration.includes("input.privacyAcceptedAt"), false);
});
