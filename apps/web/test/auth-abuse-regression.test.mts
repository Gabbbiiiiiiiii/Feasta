import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const webSource = new URL("../src/", import.meta.url);
const repository = new URL("../../../", import.meta.url);

const web = (path: string) => readFile(new URL(path, webSource), "utf8");
const repo = (path: string) => readFile(new URL(path, repository), "utf8");

test("web authentication preflight is persistent, origin checked, and CSRF protected", async () => {
  const [route, limiter] = await Promise.all([
    web("app/api/auth/attempt/route.ts"),
    web("lib/security/session-rate-limit.ts"),
  ]);
  for (const control of [
    "assertTrustedMutation(request)",
    "adminAuth.verifyIdToken(idToken, true)",
    "loadTrustedAccountContext(decoded.uid)",
    "enforceWebAuthenticationActionRateLimit",
    "Cache-Control",
  ]) {
    assert.ok(route.includes(control), `missing preflight control: ${control}`);
  }
  for (const action of [
    "customer_registration",
    "provider_registration",
    "password_reset",
    "email_verification_resend",
    "email_update",
    "password_change",
    "logout_all",
  ]) {
    assert.ok(limiter.includes(action), `missing rate-limit policy: ${action}`);
  }
  assert.match(limiter, /adminDb\.runTransaction/u);
  assert.match(limiter, /digestIdentity/u);
  assert.doesNotMatch(limiter, /identifier:/u);
});

test("all browser Firebase Auth mutation flows invoke the protected preflight", async () => {
  const [customer, provider, account] = await Promise.all([
    web("lib/auth/client-session.ts"),
    web("lib/auth/provider-client.ts"),
    web("lib/auth/account-client.ts"),
  ]);
  for (const action of [
    "customer_registration",
    "password_reset",
    "email_verification_resend",
  ]) {
    assert.ok(customer.includes(`"${action}"`), `customer flow missing ${action}`);
  }
  for (const action of ["provider_registration", "email_verification_resend"]) {
    assert.ok(provider.includes(`"${action}"`), `provider flow missing ${action}`);
  }
  for (const action of ["email_update", "password_change", "logout_all"]) {
    assert.ok(account.includes(`"${action}"`), `account flow missing ${action}`);
  }
  assert.match(customer, /x-feasta-csrf/u);
  assert.match(customer, /credentials: "same-origin"/u);
});

test("registration and verification fields remain server owned", async () => {
  const [customerClient, customerFunction, providerIdentity, providerRegistration] =
    await Promise.all([
      web("lib/auth/client-session.ts"),
      repo("functions/src/auth/ensure-user-profile.ts"),
      repo("functions/src/auth/ensure-provider-identity.ts"),
      repo("functions/src/providers/register-provider.ts"),
    ]);
  const registrationInput = customerClient.slice(
    customerClient.indexOf("export type CustomerRegistrationInput"),
    customerClient.indexOf("export class WebAuthenticationError"),
  );
  for (const forbidden of [
    "role",
    "isEmailVerified",
    "isPhoneVerified",
    "accountStatus",
    "isBlocked",
  ]) {
    assert.doesNotMatch(registrationInput, new RegExp(`\\b${forbidden}\\b`, "u"));
  }
  assert.match(customerFunction, /role: USER_ROLES\.customer/u);
  assert.match(customerFunction, /isEmailVerified: authUser\.emailVerified/u);
  assert.match(customerFunction, /isPhoneVerified: false/u);
  assert.match(providerIdentity, /role: USER_ROLES\.provider/u);
  assert.match(providerIdentity, /isEmailVerified: authUser\.emailVerified/u);
  assert.match(providerIdentity, /isPhoneVerified: false/u);
  assert.match(providerRegistration, /verificationStatus: "draft"/u);
  assert.match(providerRegistration, /isActive: false/u);
  assert.match(providerRegistration, /isFeatured: false/u);
});

test("stale, cross-role, expired, tampered, and revoked sessions fail closed", async () => {
  const [session, policy, customerLayout, providerLayout, adminLayout] =
    await Promise.all([
      web("lib/auth/session.ts"),
      web("lib/auth/account-policy.ts"),
      web("app/customer/layout.tsx"),
      web("app/provider/layout.tsx"),
      web("app/admin/layout.tsx"),
    ]);
  assert.match(session, /adminAuth\.getUser\(uid\)/u);
  assert.match(session, /verifySessionCookie\(value, checkRevoked\)/u);
  assert.match(session, /options\.checkRevoked \?\? true/u);
  for (const state of [
    "disabled_auth_account",
    "blocked_account",
    "deactivated_account",
    "missing_user_profile",
    "missing_customer_profile",
  ]) {
    assert.ok(policy.includes(state), `missing stale-session denial: ${state}`);
  }
  assert.match(customerLayout, /requireCustomer/u);
  assert.match(providerLayout, /requireProvider/u);
  assert.match(adminLayout, /requireAdmin/u);
});

test("redirects, action links, cookies, and client bundles retain security boundaries", async () => {
  const [sessionRoute, actionProcessor, session, securityPolicy, clientSession] =
    await Promise.all([
      web("app/api/auth/session/route.ts"),
      web("app/auth/action/action-processor.tsx"),
      web("lib/auth/session.ts"),
      web("lib/security/policy.ts"),
      web("lib/auth/client-session.ts"),
    ]);
  assert.match(sessionRoute, /safeAccountReturnPath/u);
  assert.match(actionProcessor, /continueUrl is intentionally ignored/u);
  assert.match(session, /sessionCookiePolicy/u);
  assert.match(securityPolicy, /httpOnly: true/u);
  assert.match(securityPolicy, /sameSite: "lax"/u);
  assert.doesNotMatch(clientSession, /firebase-admin|firebase\/admin/u);
  assert.doesNotMatch(clientSession, /localStorage/u);
});

test("Flutter OTP sends and confirmation attempts are bounded", async () => {
  const [controller, service, bootstrap] = await Promise.all([
    repo(
      "apps/customer_mobile/lib/features/authentication/application/" +
      "phone_verification_controller.dart",
    ),
    repo(
      "apps/customer_mobile/lib/features/authentication/data/services/" +
      "firebase_phone_verification_service.dart",
    ),
    repo("apps/customer_mobile/lib/app/bootstrap.dart"),
  ]);
  assert.match(controller, /state\.cooldownSeconds > 0/u);
  assert.match(controller, /maximumConfirmationAttempts/u);
  assert.match(controller, /_confirmationAttempts\+\+/u);
  assert.match(service, /verifyPhoneNumber/u);
  assert.match(bootstrap, /FirebaseAppCheck/u);
  assert.match(bootstrap, /AndroidPlayIntegrityProvider/u);
});
