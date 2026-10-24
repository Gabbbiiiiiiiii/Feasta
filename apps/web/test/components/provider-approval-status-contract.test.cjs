"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

const service = read(
  "apps/web/src/lib/admin/provider-verification/provider-verification-service.ts"
);

const approval = service.split(
  "export async function approveProviderVerification("
)[1]?.split(
  "export async function rejectProviderVerification("
)[0];

test("Web Admin approval uses the canonical approved provider state", () => {
  assert.ok(approval, "Approval function missing");

  const approved = approval.match(
    /verificationStatus:\s*"approved"/gu
  ) ?? [];

  assert.equal(approved.length, 2);

  assert.doesNotMatch(
    approval,
    /verificationStatus:\s*"verified"/u
  );

  assert.match(
    approval,
    /prepareProviderEligibilityAdvance\(/u
  );

  assert.match(
    approval,
    /transaction\.update\(verificationRef,\s*\{[\s\S]*?status:\s*"approved"/u
  );
});

test("Provider gallery and session use approved", () => {
  const files = [
    "apps/web/src/lib/provider/provider-setup-gallery-service.ts",
    "apps/web/src/lib/provider/provider-setup-gallery-v2-writer.ts",
    "apps/web/src/lib/auth/session.ts",
    "apps/web/src/lib/customer/providers/provider-normalization.ts",
  ];

  for (const file of files) {
    assert.match(
      read(file),
      /verificationStatus\s*!==\s*"approved"|\bverificationStatus\s*===\s*"approved"/u,
      file
    );
  }
});

test("Backend approval remains aligned", () => {
  const backend = read(
    "functions/src/verification/review-provider-verification.ts"
  );

  assert.match(
    backend,
    /verificationStatus:\s*"approved"/u
  );
});

test("Admin rejection flow remains intact", () => {
  const rejection = service.split(
    "export async function rejectProviderVerification("
  )[1];

  assert.ok(rejection, "Rejection function missing");

  assert.match(
    rejection,
    /verificationStatus:\s*"rejected"/u
  );
});
