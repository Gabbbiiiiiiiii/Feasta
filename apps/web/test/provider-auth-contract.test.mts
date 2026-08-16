import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("provider routes retain server role, email, and operation gates", async () => {
  const [layout, dashboard, packages] = await Promise.all([
    source("app/provider/layout.tsx"),
    source("app/provider/page.tsx"),
    source("app/provider/packages/layout.tsx"),
  ]);
  assert.match(layout, /requireProvider\(\)/u);
  assert.match(layout, /requireVerifiedProviderIdentity/u);
  const session = await source("lib/auth/session.ts");
  assert.match(session, /requireVerifiedEmail\(account, "\/provider-verify-email"\)/u);
  assert.match(session, /redirect\("\/provider-verify-phone"\)/u);
  assert.match(dashboard, /requireApprovedProvider\(\)/u);
  assert.match(packages, /requireProviderCatalogAccess\(\)/u);
  assert.doesNotMatch(packages, /requireApprovedProvider\(\)/u);
});

test("draft catalog access requires a trusted linked provider profile", async () => {
  const session = await source("lib/auth/session.ts");
  assert.match(session, /requireProviderCatalogAccess/u);
  assert.match(
    session,
    /!account\.provider \|\| account\.provider\.id !== account\.providerId/u,
  );
  assert.match(session, /redirect\("\/provider\/onboarding"\)/u);
  assert.match(session, /requireApprovedProvider/u);
  assert.match(session, /verificationStatus !== "approved"/u);
});

test("provider identity and business registration use only trusted callables", async () => {
  const client = await source("lib/auth/provider-client.ts");
  assert.match(client, /ensureProviderIdentity/u);
  assert.match(client, /registerProvider/u);
  assert.match(client, /validateProviderOwnerIdentityInput/u);
  assert.match(client, /exchangeCurrentUserForSession\("provider"/u);
  assert.match(client, /sendEmailVerification\(credential\.user\)/u);
  assert.doesNotMatch(client, /isPhoneVerified\s*:/u);
  assert.doesNotMatch(client, /phoneVerified\s*:/u);
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

test("provider submission refreshes trusted server context and never assigns status", async () => {
  const [client, actions] = await Promise.all([
    source("lib/auth/provider-client.ts"),
    source("app/provider/verification/provider-verification-actions.tsx"),
  ]);
  assert.match(client, /submitProviderVerification/u);
  assert.match(actions, /router\.replace\("\/provider\/status"\)/u);
  assert.match(actions, /router\.refresh\(\)/u);
  assert.doesNotMatch(actions, /verificationStatus\s*:/u);
  assert.doesNotMatch(actions, /status\s*:\s*["']submitted["']/u);
});
