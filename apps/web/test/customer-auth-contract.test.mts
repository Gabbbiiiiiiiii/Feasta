import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const root = new URL("../src/", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("all customer routes are protected by role and verified-email server gates", async () => {
  const layout = await source("app/customer/layout.tsx");
  assert.match(layout, /requireCustomer\(\)/u);
  assert.match(layout, /requireVerifiedEmail\(await requireCustomer\(\)\)/u);
});

test("customer registration never supplies a client-selected role", async () => {
  const registration = await source("lib/auth/client-session.ts");
  assert.match(registration, /createUserWithEmailAndPassword/u);
  assert.match(registration, /ensureCustomerProfile/u);
  assert.match(registration, /deleteUser\(credential\.user\)/u);
  assert.match(
    registration.slice(
      registration.indexOf("export async function signInWithEmail"),
      registration.indexOf("export async function signInWithGoogle"),
    ),
    /ensureCustomerProfile\(\{\}\)/u,
  );
  const inputType = registration.slice(
    registration.indexOf("export type CustomerRegistrationInput"),
    registration.indexOf("export class WebAuthenticationError"),
  );
  assert.doesNotMatch(inputType, /\brole\b/u);
});

test("session destinations are validated server-side", async () => {
  const route = await source("app/api/auth/session/route.ts");
  assert.match(route, /safeAccountReturnPath\(body\.returnTo, account\)/u);
  assert.match(route, /destination:/u);
  assert.match(route, /account\.role !== body\.expectedRole/u);
});

test("account action handling ignores untrusted continue URLs", async () => {
  const action = await source("app/auth/action/action-processor.tsx");
  assert.match(action, /continueUrl is intentionally ignored/u);
  assert.doesNotMatch(action, /searchParams\.get\("continueUrl"\)/u);
});
