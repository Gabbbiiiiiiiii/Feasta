const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../src");
const source = (relative) => readFileSync(path.join(root, relative), "utf8");

const policies = [
  ["ensureUserProfile", "auth/ensure-user-profile.ts", ["requireAuth(request)", "enforceCallableRateLimit", "appCheckCallableOptions"]],
  ["ensureProviderIdentity", "auth/ensure-provider-identity.ts", ["requireAuth(request)", "enforceCallableRateLimit", "appCheckCallableOptions", "isAuthoritativeAuthPhone", "passwordLinked", "authEmail !== submittedEmail", "requireProviderConsent"]],
  ["syncUserAuthState", "auth/sync-user-auth-state.ts", ["requireAuth(request)", "enforceCallableRateLimit", "authUser.disabled", "appCheckCallableOptions"]],
  ["syncPhoneVerification", "auth/sync-phone-verification.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "getAuth().getUser", "appCheckCallableOptions"]],
  ["prepareProviderPhoneVerification", "auth/prepare-provider-phone-verification.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "getAuth().getUser", "appCheckCallableOptions", "requirePhoneAvailableToUid"]],
  ["updateCustomerProfile", "auth/manage-customer-account.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["updateCustomerPreferences", "auth/manage-customer-account.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["deactivateCustomerAccount", "auth/manage-customer-account.ts", ["requireAuth(request)", "requireRole", "requireRecentAuthentication", "revokeRefreshTokens", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["revokeAllCustomerSessions", "auth/manage-customer-account.ts", ["requireAuth(request)", "requireRole", "requireRecentAuthentication", "revokeRefreshTokens", "appCheckCallableOptions"]],
  ["updateRoleAccountProfile", "auth/manage-role-account.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "rejectUnknownFields", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["updateAccountPreferences", "auth/manage-role-account.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "rejectUnknownFields", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["revokeAllAccountSessions", "auth/manage-role-account.ts", ["requireAuth(request)", "requireRole", "requireRecentAuthentication", "enforceCallableRateLimit", "revokeRefreshTokens", "appCheckCallableOptions"]],
  ["deactivateProviderAccount", "auth/manage-role-account.ts", ["requireAuth(request)", "requireRole", "requireRecentAuthentication", "enforceCallableRateLimit", "activeProviderRequestStatuses", "revokeRefreshTokens", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["submitBookingRequest", "bookings/submit-booking-request.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "assertBookingSubmissionAllowed", "runTransaction", "appCheckCallableOptions"]],
  ["checkCustomerProviderAvailability", "provider-availability/check-customer-provider-availability.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "appCheckCallableOptions", "rejectUnknownFields", "validateBookingPackage", "validateProviderAvailability", "isProviderPubliclyEligible"]],
  ["registerProvider", "providers/register-provider.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "beginIdempotentOperation", "writeAuditLogInTransaction", "requireTrustedProviderIdentity", "requireProviderRegistrationConsent"]],
  ["saveProviderOnboardingDraft", "providers/save-provider-onboarding-draft.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "appCheckCallableOptions", "runTransaction", "requireTrustedProviderIdentity"]],
  [
    "createProviderMediaUploadSignature",
    "providers/provider-media.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "cloudinarySecrets",
      "createProviderUploadSignature",
    ],
  ],
  [
    "deleteProviderOnboardingMedia",
    "providers/provider-media.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "cloudinarySecrets",
      "requireUnlinkedProviderOnboarding",
      "deleteProviderMedia",
    ],
  ],
  [
    "createProviderPackage",
    "packages/create-provider-package.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "authorizeProviderForPackageManagement",
      "runTransaction",
    ],
  ],
  [
    "updateProviderPackage",
    "packages/update-provider-package.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "authorizeProviderForPackageManagement",
      "authorizeOwnedPackage",
      "runTransaction",
    ],
  ],
  [
    "publishProviderPackage",
    "packages/publish-provider-package.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "authorizeProviderForPackageManagement",
      "authorizeOwnedPackage",
      "isProviderPubliclyEligible",
      "runTransaction",
    ],
  ],
  [
    "archiveProviderPackage",
    "packages/archive-provider-package.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "authorizeProviderForPackageManagement",
      "authorizeOwnedPackage",
      "runTransaction",
    ],
  ],
  [
    "createProviderService",
    "providers/provider-service-management.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "rejectUnknownFields",
      "requireOwnedServiceProvider",
      "assertServiceCategoryAllowed",
      "verifyProviderServiceImage",
      "runTransaction",
    ],
  ],
  [
    "updateProviderService",
    "providers/provider-service-management.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "rejectUnknownFields",
      "requireOwnedServiceProvider",
      "assertOwnedService",
      "assertServiceCategoryAllowed",
      "verifyProviderServiceImage",
      "runTransaction",
    ],
  ],
  [
    "publishProviderService",
    "providers/provider-service-management.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "rejectUnknownFields",
      "requireOwnedServiceProvider",
      "assertOwnedService",
      "assertServiceCategoryAllowed",
      "isApprovedProviderForOperations",
      "runTransaction",
    ],
  ],
  [
    "archiveProviderService",
    "providers/provider-service-management.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "rejectUnknownFields",
      "requireOwnedServiceProvider",
      "assertOwnedService",
      "runTransaction",
    ],
  ],
  [
    "createProviderServiceImageUploadSignature",
    "providers/provider-media.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "cloudinarySecrets",
      "createProviderServiceImageUploadSignature",
    ],
  ],
  [
    "deleteProviderServiceImage",
    "providers/provider-media.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "cloudinarySecrets",
      "deleteProviderServiceImage",
    ],
  ],
  [
    "moderateReview",
    "content/moderate-review.ts",
    [
      "requireAuth(request)",
      "requireRole",
      "enforceCallableRateLimit",
      "appCheckCallableOptions",
      "executeIdempotently",
      "writeAuditLogInTransaction",
      "createNotificationInTransaction",
      "runTransaction",
    ],
  ],
  ["registerVerificationDocument", "verification/register-verification-document.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "idempotentReplay", "writeAuditLogInTransaction"]],
  ["removeVerificationDocument", "verification/remove-verification-document.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "EDITABLE_STATUSES", "writeAuditLogInTransaction"]],
  ["submitProviderVerification", "verification/submit-provider-verification.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "beginIdempotentOperation", "writeAuditLogInTransaction", "requireTrustedProviderIdentity"]],
  ["reviewProviderVerification", "verification/review-provider-verification.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "beginIdempotentOperation", "writeAuditLogInTransaction", "createNotificationInTransaction", "loadApprovalOwnerAuth", "requireTrustedProviderIdentity"]],
  ["createComplaint", "content/create-complaint.ts", ["requireAuth(request)", "requireActiveUser", "enforceCallableRateLimit", "executeIdempotently", "writeAuditLogInTransaction"]],
  ["submitReview", "content/submit-review.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "executeIdempotently"]],
  ["deleteReview", "content/delete-review.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "executeIdempotently", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["createPaymentSession", "payments/create-payment-session.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "appCheckCallableOptions", "defineSecret", "rejectUnknownFields", "paymentIdForProviderRequest", "canonicalPaymentLinkageReason", "providerOperationalReason", "payMongoFailureCertainty", "calculateMainEventRequestSummary", "runTransaction"]],
  ["acceptProviderRequest", "provider-requests/accept-provider-request.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "authorizeProviderRequest", "assertCanonicalProviderRequestCore", "requireProviderResponseParentStatus", "validateAcceptanceProviderRequest", "validateProviderAvailability", "runTransaction", "writeAuditLogInTransaction", "createNotificationInTransaction", "appCheckCallableOptions"]],
  ["rejectProviderRequest", "provider-requests/reject-provider-request.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "authorizeProviderRequest", "assertCanonicalProviderRequestCore", "requireProviderResponseParentStatus", "runTransaction", "writeAuditLogInTransaction", "createNotificationInTransaction", "appCheckCallableOptions"]],
  ["markProviderBookingInProgress", "provider-requests/update-provider-booking-lifecycle.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "authorizeProviderRequest", "runTransaction", "writeAuditLogInTransaction", "createNotificationInTransaction", "appCheckCallableOptions"]],
  ["completeProviderBooking", "provider-requests/update-provider-booking-lifecycle.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "authorizeProviderRequest", "runTransaction", "writeAuditLogInTransaction", "createNotificationInTransaction", "appCheckCallableOptions"]],
  ["openProviderRequestChat", "messaging/provider-request-chat.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "appCheckCallableOptions", "loadCanonicalContext", "assertChatLifecycleEligible", "runTransaction"]],
  ["sendChatMessage", "messaging/provider-request-chat.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "appCheckCallableOptions", "validateSendChatMessageInput", "createNotificationInTransaction", "runTransaction"]],
  ["markChatRoomRead", "messaging/provider-request-chat.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "appCheckCallableOptions", "validateMarkChatReadInput", "runTransaction"]],
  ["updateProviderAvailability", "providers/update-provider-availability.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "isApprovedProviderForOperations", "runTransaction", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["updateProviderAvailabilitySettings", "providers/update-provider-availability.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "isApprovedProviderForOperations", "runTransaction", "writeAuditLogInTransaction", "appCheckCallableOptions"]],
  ["updateProviderBusinessProfile", "providers/update-provider-business-profile.ts", ["requireAuth(request)", "requireRole", "enforceCallableRateLimit", "isApprovedProviderForOperations", "isProviderOwnerAccountActive", "validateProviderBusinessProfileUpdate", "verifyProviderMedia", "runTransaction", "writeAuditLogInTransaction", "appCheckCallableOptions", "cloudinarySecrets"]],
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

test("payment checkout keeps provider-request authority and fail-safe gateway handling", () => {
  const checkout = source("payments/create-payment-session.ts");
  const callable = checkout.slice(
    0,
    checkout.indexOf("export async function createPaymentSessionForCustomer"),
  );
  assert.ok(callable.includes('"providerRequestId"'));
  assert.ok(callable.includes('"idempotencyKey"'));
  for (const field of ["amount", "customerId", "providerId", "bookingId", "paymentStatus", "successUrl", "cancelUrl"]) {
    assert.ok(
      !callable.includes(`input.${field}`),
      `createPaymentSession must not trust input.${field}`,
    );
  }
  assert.ok(checkout.includes("checkoutCreationStatus"));
  assert.ok(checkout.includes('certainty: "ambiguous"'));
});

test("PayMongo webhook records gateway truth without resurrecting booking state", () => {
  const webhook = source("payments/process-webhook.ts");
  for (const control of [
    "canonicalPaymentLinkageReason",
    "webhookLifecycleConflictReason",
    "providerOperationalReason",
    "processed_with_conflict",
    "payment.lifecycle_conflict",
    "allowFailedToPaidRecovery",
  ]) {
    assert.ok(webhook.includes(control), `payment webhook is missing ${control}`);
  }
});

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
    "acceptProviderRequest",
    "archiveProviderService",
    "checkCustomerProviderAvailability",
    "completeProviderBooking",
    "createComplaint",
    "createPaymentSession",
    "createProviderMediaUploadSignature",
    "archiveProviderPackage",
    "createProviderPackage",
    "publishProviderPackage",
    "updateProviderPackage",
    "deactivateCustomerAccount",
    "deactivateProviderAccount",
    "deleteReview",
    "ensureProviderIdentity",
    "ensureUserProfile",
    "getDirections",
    "getPlaceDetails",
    "healthCheck",
    "moderateReview",
    "markProviderBookingInProgress",
    "markChatRoomRead",
    "onPromotionWrite",
    "onUserSecurityStateChanged",
    "openProviderRequestChat",
    "payMongoWebhook",
    "prepareCustomerPhoneVerification",
    "prepareProviderPhoneVerification",
    "registerProvider",
    "registerVerificationDocument",
    "rejectProviderRequest",
    "removeVerificationDocument",
    "requestPaymentRefund",
    "reverseGeocode",
    "reviewProviderVerification",
    "revokeAllAccountSessions",
    "revokeAllCustomerSessions",
    "saveProviderOnboardingDraft",
    "searchPlaces",
    "sendChatMessage",
    "submitBookingRequest",
    "submitProviderVerification",
    "submitReview",
    "syncPhoneVerification",
    "syncUserAuthState",
    "updateAccountPreferences",
    "updateCustomerPreferences",
    "updateCustomerProfile",
    "updateProviderAvailability",
    "updateProviderAvailabilitySettings",
    "updateProviderBusinessProfile",
    "updateRoleAccountProfile",
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
  assert.equal(content.includes("input.phoneNumber"), false);
  assert.ok(content.includes("authoritativeFirebasePhone(authUser)"));
});

test("provider identity creation derives verification from Firebase Auth", () => {
  const content = source("auth/ensure-provider-identity.ts");
  assert.ok(content.includes("role: USER_ROLES.provider"));
  assert.ok(content.includes("isEmailVerified: authUser.emailVerified"));
  assert.ok(content.includes("isAuthoritativeAuthPhone(authUser, phoneNumber)"));
  assert.ok(content.includes("isPhoneVerified: phoneVerified"));
  assert.ok(content.includes("requireProviderConsent"));
  assert.ok(content.includes("accountStatus: \"active\""));
  assert.equal(content.includes("input.role"), false);
  assert.equal(content.includes("input.isEmailVerified"), false);
  assert.equal(content.includes("input.isPhoneVerified"), false);
  assert.equal(content.includes("input.isActive"), false);
});

test("booking and payment callables revalidate approved providers", () => {
  const bookings = source("bookings/submit-booking-request.ts");
  const payments = source("payments/create-payment-session.ts");
  const lifecycle = source("payments/payment-lifecycle.ts");
  assert.ok(
    (bookings.match(/isApprovedProviderForOperations\(\s*\w+/gu) ?? [])
      .length >= 2,
    "each selected provider must be revalidated",
  );
  assert.ok(payments.includes("providerOperationalReason"));
  assert.match(lifecycle, /isApprovedProviderForOperations\(\s*provider/u);
  assert.match(lifecycle, /isProviderOwnerAccountActive\(\s*providerId/u);
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
