import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../src");
const source = (relative: string) =>
  readFileSync(path.join(root, relative), "utf8");

test("provider phone auth links or updates the same Firebase account", () => {
  const client = source("lib/auth/provider-client.ts");
  const existingFlow = client.slice(
    client.indexOf("export async function requestProviderPhoneVerification"),
    client.indexOf("export async function registerProviderBusiness"),
  );
  assert.ok(existingFlow.includes("linkWithCredential(user, credential)"));
  assert.ok(existingFlow.includes("updatePhoneNumber(user, credential)"));
  assert.ok(existingFlow.includes("result.user.uid !== session.uid"));
  assert.ok(existingFlow.includes("auth.currentUser?.uid !== session.uid"));
  assert.ok(existingFlow.includes('call("syncPhoneVerification", {})'));
  assert.equal(existingFlow.includes("signInWithPhoneNumber"), false);
  assert.equal(client.includes("updateDoc("), false);
});

test("new provider registration authenticates by phone before trusted classification", () => {
  const client = source("lib/auth/provider-client.ts");
  const form = source(
    "app/provider-register/provider-phone-registration-form.tsx",
  );
  const page = source("app/provider-register/page.tsx");
  const registrationFlow = client.slice(
    client.indexOf("export async function requestProviderRegistrationPhoneCode"),
    client.indexOf("export async function registerProviderIdentity"),
  );

  assert.ok(registrationFlow.includes('"provider_phone_registration"'));
  assert.ok(registrationFlow.includes("browserSessionPersistence"));
  assert.ok(registrationFlow.includes("const verifier = createVerifier()"));
  assert.ok(registrationFlow.indexOf('"provider_phone_registration"') <
    registrationFlow.indexOf("const verifier = createVerifier()"));
  assert.ok(registrationFlow.includes("signInWithPhoneNumber"));
  assert.ok(registrationFlow.includes("confirmation.confirm(code)"));
  assert.ok(registrationFlow.includes("credential.user.uid"));
  assert.ok(registrationFlow.includes("PhoneAuthProvider.PROVIDER_ID"));
  assert.ok(registrationFlow.includes("normalizedAuthPhone !== normalizedExpected"));
  assert.ok(registrationFlow.includes("user.getIdToken(true)"));
  assert.ok(registrationFlow.includes(
    'fetch("/api/auth/provider-registration/classify"',
  ));
  assert.ok(form.includes("resumeProviderPhoneRegistration"));
  assert.ok(form.includes("confirmationRef"));
  assert.ok(form.includes("verifierRef.current?.clear()"));
  assert.ok(form.includes("RESEND_COOLDOWN_SECONDS"));
  assert.ok(form.includes("actionInProgress.current"));
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "verificationId",
    "createUserWithEmailAndPassword",
    "ensureProviderIdentity",
    "sendEmailVerification",
    "linkWithCredential",
  ]) {
    assert.equal(form.includes(forbidden), false, `registration form includes ${forbidden}`);
    assert.equal(page.includes(forbidden), false, `registration page includes ${forbidden}`);
  }
  assert.ok(form.includes("registerProviderIdentity"));
});

test("Phase C links email/password to the same phone UID before identity creation", () => {
  const client = source("lib/auth/provider-client.ts");
  const form = source(
    "app/provider-register/provider-phone-registration-form.tsx",
  );
  const phaseC = client.slice(
    client.indexOf("export async function registerProviderIdentity"),
    client.indexOf("export async function signInProvider"),
  );
  for (const control of [
    "EmailAuthProvider.credential",
    "linkWithCredential(user, emailCredential)",
    "const originalUid = user.uid",
    "linkResult.user.uid !== originalUid",
    "auth.currentUser?.uid !== originalUid",
    "hasPasswordProvider",
    "const authPhone = normalizePhilippineMobile(user.phoneNumber)",
    "user.getIdToken(true)",
    'call("ensureProviderIdentity"',
    "sendEmailVerification(user)",
  ]) {
    assert.ok(phaseC.includes(control), `missing Phase C control: ${control}`);
  }
  assert.ok(
    phaseC.indexOf("linkWithCredential(user, emailCredential)") <
      phaseC.indexOf('call("ensureProviderIdentity"'),
  );
  assert.equal(phaseC.includes("createUserWithEmailAndPassword"), false);
  assert.equal(phaseC.includes("deleteUser"), false);
  assert.equal(phaseC.includes("localStorage"), false);
  assert.equal(phaseC.includes("sessionStorage"), false);
  assert.ok(form.includes("Complete your provider account"));
  assert.ok(form.includes('href="/terms"'));
  assert.ok(form.includes('href="/privacy"'));
  assert.ok(form.includes("validateProviderOwnerIdentityInput"));
  assert.ok(form.includes("establishProviderIdentitySession"));
  assert.ok(form.includes('router.replace("/provider")'));
  assert.equal(form.includes("/provider-verify-email?registration=complete"), false);
  assert.equal(form.includes("/provider?uid="), false);
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

test("phone registration classification is authenticated, bounded, and fail closed", () => {
  const route = source("app/api/auth/provider-registration/classify/route.ts");
  const server = source("lib/auth/provider-registration-server.ts");
  const classifier = source("lib/auth/provider-registration-classification.ts");
  for (const control of [
    "assertTrustedMutation(request)",
    "verifyIdToken(idToken, true)",
    "getUser(decoded.uid)",
    'sign_in_provider === "phone"',
    'provider.providerId === "phone"',
    '"provider_phone_classification"',
    ".limit(2)",
  ]) {
    assert.ok(
      `${route}\n${server}`.includes(control),
      `missing classification control: ${control}`,
    );
  }
  assert.ok(classifier.includes('role === "customer" || role === "admin"'));
  assert.ok(classifier.includes('"malformed_provider_relationship"'));
  assert.ok(classifier.includes("provider.ownerId !== input.uid"));
  assert.equal(route.includes("providerId"), false);
  assert.equal(route.includes("customer"), false);
});

test("provider routes enforce the phone gate before onboarding", () => {
  const layout = source("app/provider/layout.tsx");
  const session = source("lib/auth/session.ts");
  const page = source("app/provider-verify-phone/page.tsx");
  assert.ok(layout.includes("requireProviderIdentityAccess"));
  assert.ok(session.includes("requireOnboardingReadyProvider"));
  assert.ok(session.includes("requireVerifiedProviderIdentity"));
  assert.ok(session.includes('redirect("/provider-verify-phone")'));
  assert.ok(page.includes("account.isPhoneVerified"));
  assert.ok(page.includes("providerAccessDestination(account)"));
});
