const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "index.ts"),
  "utf8",
);
const callableSource = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "src",
    "provider-finance",
    "provider-admin-mock-disbursement.ts",
  ),
  "utf8",
);

test("admin mock disbursement release is exported and admin-gated", () => {
  assert.match(
    indexSource,
    /releaseMockProviderDisbursement/,
  );
  assert.match(
    callableSource,
    /USER_ROLES\.admin/,
  );
  assert.match(
    callableSource,
    /requireRecentAuthentication/,
  );
  assert.match(
    callableSource,
    /RELEASE_CONFIRMATION_PHRASE/,
  );
  assert.match(
    callableSource,
    /Provide the disbursement identity and RELEASE confirmation/,
  );
  assert.match(
    callableSource,
    /releaseChannel: "admin_disbursement"/,
  );
  assert.match(
    callableSource,
    /status: "paid"/,
  );
});
