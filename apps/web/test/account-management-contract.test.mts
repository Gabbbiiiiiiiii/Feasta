import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");
const functionSource = (path: string) =>
  readFile(new URL(`../../../functions/src/${path}`, import.meta.url), "utf8");

test("all role account pages use trusted server guards and profile loading", async () => {
  for (const [role, guard] of [
    ["customer", "requireCustomer"],
    ["provider", "requireProvider"],
    ["admin", "requireAdmin"],
  ]) {
    const page = await source(`app/${role}/account/page.tsx`);
    assert.match(page, new RegExp(`${guard}\\(`));
    assert.match(page, /loadAccountManagementProfile/u);
    assert.match(page, /AccountManagementPanel/u);
  }
});

test("client profile mutations never submit privileged fields", async () => {
  const panel = await source(
    "components/account/account-management-panel.tsx",
  );
  for (const field of [
    "role",
    "accountStatus",
    "isActive",
    "isBlocked",
    "isEmailVerified",
    "isPhoneVerified",
    "providerId",
    "verificationStatus",
    "isFeatured",
  ]) {
    assert.doesNotMatch(
      panel,
      new RegExp(`field=["']${field}["']|${field}:\\s*profile`, "u"),
    );
  }
});

test("provider and admin backend policies fail closed", async () => {
  const backend = await functionSource("auth/manage-role-account.ts");
  assert.match(backend, /requireRole\(actor\.uid, \["provider", "admin"\]\)/u);
  assert.match(backend, /rejectUnknownFields/u);
  assert.match(backend, /editableVerificationStatuses/u);
  assert.match(backend, /Verified business identity changes require FEASTA review/u);
  assert.match(backend, /activeProviderRequestStatuses/u);
  assert.match(backend, /Resolve active event obligations/u);
  assert.match(backend, /requireRole\(actor\.uid, \["provider"\]\)/u);
  assert.doesNotMatch(backend, /accountStatus:\s*input|isActive:\s*input/u);
});

test("password and email changes use Firebase recent-authentication APIs", async () => {
  const client = await source("lib/auth/account-client.ts");
  assert.match(client, /reauthenticateWithCredential/u);
  assert.match(client, /EmailAuthProvider\.credential/u);
  assert.match(client, /verifyBeforeUpdateEmail/u);
  assert.match(client, /updatePassword/u);
  assert.match(client, /revokeAllAccountSessions/u);
  assert.match(client, /password_provider_required/u);
  assert.doesNotMatch(client, /localStorage|isEmailVerified\s*:/u);
  for (const path of [
    "lib/auth/client-session.ts",
    "lib/auth/provider-client.ts",
    "lib/auth/admin-client.ts",
  ]) {
    const authenticationClient = await source(path);
    assert.match(authenticationClient, /browserSessionPersistence/u);
    assert.doesNotMatch(authenticationClient, /localStorage/u);
  }
});

test("trusted session loading synchronizes Auth-owned email with audit history", async () => {
  const session = await source("lib/auth/session.ts");
  assert.match(session, /authUser\.email/u);
  assert.match(session, /synchronizeTrustedAuthFields/u);
  assert.match(session, /account_email_synchronized/u);
  assert.match(session, /collection\("adminLogs"\)/u);
  assert.match(session, /collection\("notifications"\)/u);
});
