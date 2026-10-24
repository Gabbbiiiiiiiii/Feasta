const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../src/packages/provider-occasion-capabilities-v2.ts"),
  "utf8",
);

const entry = fs.readFileSync(
  path.join(__dirname, "../src/index.ts"),
  "utf8",
);

test("V2 grants remain in the protected authority sidecar", () => {
  assert.match(
    source,
    /tx\.update\(authority,\s*\{\s*revision:\s*next,\s*approvedOccasionIds:\s*full,/u,
  );

  assert.match(
    source,
    /const next = nextEligibilityRevision\(revision\)/u,
  );
});

test("V2 capability changes cannot overwrite the legacy provider document", () => {
  assert.doesNotMatch(
    source,
    /\btx\.(?:update|set|create)\(\s*ref\s*,/u,
  );

  assert.match(
    source,
    /Preserve the legacy V1 eventTypesSupported field/u,
  );
});

test("V2 capability callable remains unexported until integration approval", () => {
  assert.doesNotMatch(
    entry,
    /export\s*\{[^}]*\bupdateProviderOccasionCapabilities\b/u,
  );
});
