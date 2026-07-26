import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("provider routes retain server role, email, and approval gates", async () => {
  const [layout, dashboard, packages] = await Promise.all([
    source("app/provider/layout.tsx"),
    source("app/provider/page.tsx"),
    source("app/provider/packages/layout.tsx"),
  ]);
  assert.match(layout, /requireProvider\(\)/u);
  assert.match(layout, /requireVerifiedEmail/u);
  assert.match(layout, /provider-verify-email/u);
  assert.match(dashboard, /requireApprovedProvider\(\)/u);
  assert.match(packages, /requireApprovedProvider\(\)/u);
});

test("provider identity and business registration use only trusted callables", async () => {
  const client = await source("lib/auth/provider-client.ts");
  assert.match(client, /ensureProviderIdentity/u);
  assert.match(client, /registerProvider/u);
  assert.match(client, /exchangeCurrentUserForSession\("provider"/u);
  assert.doesNotMatch(client, /verificationStatus\s*:/u);
  assert.doesNotMatch(client, /isActive\s*:/u);
  assert.doesNotMatch(client, /isFeatured\s*:/u);
});

test("verification uploads use the exact private path and no public URL", async () => {
  const client = await source("lib/auth/provider-client.ts");
  assert.match(
    client,
    /providers\/\$\{input\.providerId\}\/verification\/\$\{input\.documentType\}/u,
  );
  assert.match(client, /10 \* 1024 \* 1024/u);
  assert.match(client, /registerVerificationDocument/u);
  assert.doesNotMatch(client, /getDownloadURL/u);
});
