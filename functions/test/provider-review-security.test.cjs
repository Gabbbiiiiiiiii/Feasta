const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const review = fs.readFileSync(
  path.join(
    __dirname,
    "../src/verification/review-provider-verification.ts",
  ),
  "utf8",
);

test("provider review requires an active administrator and App Check", () => {
  assert.match(review, /appCheckCallableOptions/u);
  assert.match(review, /requireAuth\(request\)/u);
  assert.match(review, /requireRole\([\s\S]*USER_ROLES\.admin/u);
  assert.match(review, /enforceCallableRateLimit/u);
  assert.match(review, /ownerId === authenticatedUser\.uid/u);
});

test("provider review exposes only canonical admin transitions", () => {
  for (const action of [
    "start_review",
    "approve",
    "reject",
    "require_resubmission",
    "suspend",
  ]) {
    assert.ok(review.includes(`"${action}"`), action);
  }
  assert.match(review, /isProviderVerificationTransitionAllowed/u);
  assert.match(review, /providerData\?\.verificationStatus !== currentStatus/u);
  assert.match(review, /REVIEWABLE_STATUSES = \[[\s\S]*"submitted"[\s\S]*"under_review"[\s\S]*"approved"/u);
});

test("approval revalidates canonical required documents and Storage metadata", () => {
  for (const contract of [
    "providerVerificationDocumentPolicy",
    "verificationDocumentsSatisfyPolicy",
    "validateApprovalStorageEvidence",
    "validateApprovalDocumentsInTransaction",
    "VERIFICATION_DOCUMENT_CONTENT_TYPES",
    "MAX_VERIFICATION_DOCUMENT_SIZE_BYTES",
    "getMetadata()",
    "status: \"verified\"",
    "verifiedAt: serverTimestamp()",
    "verifiedBy: authenticatedUser.uid",
  ]) {
    assert.ok(review.includes(contract), contract);
  }
  assert.match(
    review,
    /providers\/\$\{providerId\}\/verification\/\$\{document\.documentType\}\//u,
  );
});

test("decisions are transaction-safe, replay-safe, and reject races", () => {
  assert.match(review, /beginIdempotentOperation/u);
  assert.match(review, /completeIdempotentOperation/u);
  assert.match(review, /idempotentReplay: true/u);
  assert.match(review, /db\.runTransaction/u);
  assert.match(review, /transaction\.get\(\s*verificationReference/u);
  assert.match(review, /storageValidatedDocuments\.get\(document\.id\) !== document\.storagePath/u);
  assert.match(review, /"aborted",[\s\S]*evidence changed during review/u);
});

test("decisions atomically update lifecycle, audit, and owner notification", () => {
  assert.match(review, /transaction\.update\(\s*verificationReference/u);
  assert.match(review, /transaction\.update\(\s*providerReference/u);
  assert.match(review, /isActive:\s*nextStatus === "approved"/u);
  assert.match(review, /isSuspended:\s*nextStatus === "suspended"/u);
  assert.match(review, /approvedBy: adminId/u);
  assert.match(review, /suspendedBy: adminId/u);
  assert.match(review, /writeAuditLogInTransaction/u);
  assert.match(review, /createNotificationInTransaction/u);
  assert.match(review, /userId: ownerId/u);
});

test("adverse decisions require meaningful bounded remarks", () => {
  assert.match(review, /remarks\.length < 10/u);
  assert.match(review, /remarks\.length > 2000/u);
});
