const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../src");
const source = (relative) => readFileSync(path.join(root, relative), "utf8");

const policies = [
  ["ensureUserProfile", "auth/ensure-user-profile.ts", ["requireAuth(request)", "enforceCallableRateLimit", "appCheckCallableOptions"]],
  ["ensureProviderIdentity", "auth/ensure-provider-identity.ts", ["requireAuth(request)", "enforceCallableRateLimit", "appCheckCallableOptions"]],
  ["syncUserAuthState", "auth/sync-user-auth-state.ts", ["requireAuth(request)", "enforceCallableRateLimit", "authUser.disabled", "appCheckCallableOptions"]],
  ["syncPhoneVerification", "auth/sync-phone-verification.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "getAuth().getUser", "appCheckCallableOptions"]],
  ["updateCustomerProfile", "auth/manage-customer-account.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["updateCustomerPreferences", "auth/manage-customer-account.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["deactivateCustomerAccount", "auth/manage-customer-account.ts", ["requireAuth(request)", "requireRole", "requireRecentAuthentication", "revokeRefreshTokens", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["revokeAllCustomerSessions", "auth/manage-customer-account.ts", ["requireAuth(request)", "requireRole", "requireRecentAuthentication", "revokeRefreshTokens", "appCheckCallableOptions"]],
  ["submitBookingRequest", "bookings/submit-booking-request.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "assertBookingSubmissionAllowed", "runTransaction", "appCheckCallableOptions"]],
  ["registerProvider", "providers/register-provider.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "beginIdempotentOperation", "writeAuditLogInTransaction"]],
  ["registerVerificationDocument", "verification/register-verification-document.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "idempotentReplay", "writeAuditLogInTransaction"]],
  ["submitProviderVerification", "verification/submit-provider-verification.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "beginIdempotentOperation", "writeAuditLogInTransaction"]],
  ["reviewProviderVerification", "verification/review-provider-verification.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "beginIdempotentOperation", "writeAuditLogInTransaction", "createNotificationInTransaction"]],
  ["createComplaint", "content/create-complaint.ts", ["requireAuth(request)", "requireActiveUser", "enforceCallableRateLimit", "executeIdempotently", "writeAuditLogInTransaction"]],
  ["submitReview", "content/submit-review.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "executeIdempotently"]],
  ["createPaymentSession", "payments/create-payment-session.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "defineSecret", "runTransaction"]],
  ["requestPaymentRefund", "payments/request-refund.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "executeIdempotently", "defineSecret", "writeAuditLog"]],
  ["payMongoWebhook", "payments/paymongo-webhook.ts", ["defineSecret", "verifyPayMongoSignature", "rawBody", "processPayMongoWebhook"]],
];

for (const [name, file, controls] of policies) {
  test(`${name} declares its security controls`, () => {
    const content = source(file);
    for (const control of controls) {
      assert.ok(content.includes(control), `${name} is missing ${control}`);
    }
  });
}

for (const name of ["searchPlaces", "reverseGeocode", "getPlaceDetails", "getDirections"]) {
  test(`${name} is an authenticated, active and rate-limited Maps callable`, () => {
    const index = source("index.ts");
    const start = index.indexOf(`export const ${name} = onCall`);
    assert.notEqual(start, -1);
    const next = index.indexOf("export const ", start + 20);
    const block = index.slice(start, next === -1 ? undefined : next);
    for (const control of ["requireAuth(request)", "requireActiveUser", "enforceCallableRateLimit"]) {
      assert.ok(block.includes(control), `${name} is missing ${control}`);
    }
  });
}

test("all deployed exports remain in the reviewed inventory", () => {
  const index = source("index.ts");
  const names = new Set();
  for (const match of index.matchAll(/export const\s+(\w+)\s*=/gu)) names.add(match[1]);
  for (const match of index.matchAll(/export\s*\{\s*(\w+)[\s,}]/gu)) names.add(match[1]);
  assert.deepEqual([...names].sort(), [
    "createComplaint", "createPaymentSession", "deactivateCustomerAccount",
    "ensureProviderIdentity",
    "ensureUserProfile", "getDirections", "getPlaceDetails", "healthCheck",
    "onPromotionWrite", "onUserSecurityStateChanged", "payMongoWebhook",
    "registerProvider", "revokeAllCustomerSessions",
    "registerVerificationDocument", "requestPaymentRefund", "reverseGeocode",
    "reviewProviderVerification", "searchPlaces", "submitProviderVerification",
    "submitBookingRequest", "submitReview", "syncPhoneVerification",
    "syncUserAuthState", "updateCustomerPreferences", "updateCustomerProfile",
  ].sort());
  assert.equal(index.includes("onSchedule"), false);
});

test("trigger and public HTTP exports have explicit non-callable controls", () => {
  const index = source("index.ts");
  assert.ok(index.includes("sendIdempotentTopicNotification"));
  assert.ok(index.includes("executeIdempotently"));
  assert.ok(index.includes("notifications.promotionFanout"));
  assert.ok(source("system/health-check.ts").includes("status: \"ok\""));
});

test("active-account authorization checks Firebase Auth disabled state", () => {
  const authorization = source("shared/authorization.ts");
  assert.ok(authorization.includes("getAuth().getUser(uid)"));
  assert.ok(authorization.includes("authUser.disabled"));
});

test("customer profile creation forces the customer role and trusted flags", () => {
  const content = source("auth/ensure-user-profile.ts");
  assert.ok(content.includes("role: USER_ROLES.customer"));
  assert.ok(content.includes("isEmailVerified: authUser.emailVerified"));
  assert.ok(content.includes("isPhoneVerified: false"));
  assert.ok(content.includes("accountStatus: \"active\""));
  assert.equal(content.includes("input.role"), false);
  assert.equal(content.includes("input.isEmailVerified"), false);
  assert.equal(content.includes("input.isPhoneVerified"), false);
});

test("Maps proxy cache and timeout controls do not persist API keys", () => {
  const index = source("index.ts");
  assert.ok(index.includes('cacheUrl.searchParams.delete("key")'));
  assert.ok(index.includes("256 * 1024"));
  assert.ok(index.includes("new AbortController()"));
});

test("required security rejection and decision events are instrumented", () => {
  const combined = [
    source("shared/auth.ts"),
    source("shared/authorization.ts"),
    source("shared/rate-limit.ts"),
    source("shared/idempotency.ts"),
    source("payments/paymongo-webhook.ts"),
    source("verification/submit-provider-verification.ts"),
    source("verification/review-provider-verification.ts"),
  ].join("\n");
  for (const action of [
    "account_access_denied",
    "role_access_denied",
    "rate_limit_rejected",
    "idempotency_replay",
    "payment_webhook",
    "provider_verification_submission",
    "provider_verification_decision",
  ]) {
    assert.ok(combined.includes(`\"${action}\"`), `missing ${action}`);
  }
  const accountTrigger = source("auth/audit-account-security-state.ts");
  assert.ok(accountTrigger.includes("onDocumentUpdatedWithAuthContext"));
  assert.ok(accountTrigger.includes('collection("adminLogs")'));
});
