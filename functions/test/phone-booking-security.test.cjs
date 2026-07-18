const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  assertBookingSubmissionAllowed,
} = require("../lib/bookings/booking-authorization.js");

const verified = {
  role: "customer",
  accountStatus: "active",
  isActive: true,
  isBlocked: false,
  isPhoneVerified: true,
  phoneNumber: "+639171234567",
};

test("verified phone permits backend booking submission", () => {
  assert.doesNotThrow(() => assertBookingSubmissionAllowed(
    verified,
    true,
    "+639171234567",
  ));
});

test("unverified phone and blocked customer cannot bypass submission", () => {
  assert.throws(
    () => assertBookingSubmissionAllowed(
      {...verified, isPhoneVerified: false},
      true,
      "+639171234567",
    ),
    /Phone verification is required/u,
  );
  assert.throws(
    () => assertBookingSubmissionAllowed(
      {...verified, isBlocked: true},
      true,
      "+639171234567",
    ),
    /Account is unavailable/u,
  );
  assert.throws(
    () => assertBookingSubmissionAllowed(verified, true, undefined),
    /Phone verification is required/u,
  );
});

test("booking and phone callables retain trusted security controls", () => {
  const root = path.resolve(__dirname, "../src");
  const booking = readFileSync(
    path.join(root, "bookings/submit-booking-request.ts"),
    "utf8",
  );
  const phone = readFileSync(
    path.join(root, "auth/sync-phone-verification.ts"),
    "utf8",
  );
  for (const control of [
    "requireAuth(request)",
    "requireRole(actor.uid, [\"customer\"])",
    "enforceCallableRateLimit",
    "appCheckCallableOptions",
    "assertBookingSubmissionAllowed",
    "runTransaction",
  ]) assert.ok(booking.includes(control), `booking missing ${control}`);
  assert.ok(phone.includes("getAuth().getUser(actor.uid)"));
  assert.ok(phone.includes("authUser.phoneNumber"));
  assert.ok(phone.includes("isPhoneVerified: true"));
  assert.equal(phone.includes("request.data.phoneNumber"), false);
  assert.equal(phone.includes("request.data.isPhoneVerified"), false);
});
