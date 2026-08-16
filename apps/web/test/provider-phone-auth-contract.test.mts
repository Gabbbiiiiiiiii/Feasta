import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../src");
const source = (relative: string) =>
  readFileSync(path.join(root, relative), "utf8");

test("provider phone auth links or updates the same Firebase account", () => {
  const client = source("lib/auth/provider-client.ts");
  assert.ok(client.includes("linkWithCredential(user, credential)"));
  assert.ok(client.includes("updatePhoneNumber(user, credential)"));
  assert.ok(client.includes("result.user.uid !== session.uid"));
  assert.ok(client.includes("auth.currentUser?.uid !== session.uid"));
  assert.ok(client.includes('call("syncPhoneVerification", {})'));
  assert.equal(client.includes("signInWithPhoneNumber"), false);
  assert.equal(client.includes("updateDoc("), false);
});

test("phone verification uses browser-only reCAPTCHA and explicit emulator opt-in", () => {
  const form = source(
    "app/provider-verify-phone/provider-phone-verification-form.tsx",
  );
  const firebase = source("lib/firebase/client.ts");
  assert.ok(form.startsWith('"use client"'));
  assert.ok(form.includes("createProviderPhoneRecaptcha"));
  assert.ok(form.includes("verifierRef.current?.clear()"));
  assert.ok(form.includes('id={RECAPTCHA_CONTAINER_ID}'));
  assert.ok(firebase.includes(
    "NEXT_PUBLIC_FIREBASE_AUTH_DISABLE_APP_VERIFICATION_FOR_TESTING",
  ));
  assert.ok(firebase.includes('environment !== "production"'));
  assert.ok(firebase.includes('emulatorSetting === "true"'));
  assert.equal(firebase.includes("location.hostname"), false);
});

test("provider routes enforce the phone gate before onboarding", () => {
  const layout = source("app/provider/layout.tsx");
  const session = source("lib/auth/session.ts");
  const page = source("app/provider-verify-phone/page.tsx");
  assert.ok(layout.includes("requireVerifiedProviderIdentity"));
  assert.ok(session.includes('redirect("/provider-verify-phone")'));
  assert.ok(page.includes("account.isPhoneVerified"));
  assert.ok(page.includes("providerAccessDestination(account)"));
});
