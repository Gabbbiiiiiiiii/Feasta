const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");
const {initializeApp} = require("firebase-admin/app");

initializeApp({projectId: "demo-feasta-customer-availability"});

const {
  customerSafeAvailabilityMessage,
  customerSafeAvailabilityResult,
  parseCustomerAvailabilityInput,
} = require(
  "../lib/provider-availability/check-customer-provider-availability.js",
);

const source = readFileSync(
  join(
    __dirname,
    "../src/provider-availability/check-customer-provider-availability.ts",
  ),
  "utf8",
);

function validInput(overrides = {}) {
  return {
    packageId: "package_12345678",
    addonIds: ["addon_12345678"],
    eventDate: "2026-09-10",
    eventTime: "18:00",
    eventEndTime: "22:00",
    guestCount: 100,
    ...overrides,
  };
}

test("parses bounded canonical Manila event inputs", () => {
  const parsed = parseCustomerAvailabilityInput(validInput());

  assert.equal(parsed.packageId, "package_12345678");
  assert.deepEqual(parsed.addonIds, ["addon_12345678"]);
  assert.equal(parsed.eventDate.toISOString(), "2026-09-09T16:00:00.000Z");
  assert.equal(parsed.eventTime, "18:00");
  assert.equal(parsed.eventEndTime, "22:00");
  assert.equal(parsed.guestCount, 100);
});

test("rejects malformed IDs, excessive providers, times, and unknown fields", () => {
  for (const input of [
    validInput({packageId: "../private"}),
    validInput({addonIds: Array.from({length: 21}, (_, index) =>
      `addon_${String(index).padStart(8, "0")}`
    )}),
    validInput({eventTime: "22:00", eventEndTime: "18:00"}),
    validInput({guestCount: 2.5}),
    {...validInput(), providerIds: ["provider_private_12345678"]},
  ]) {
    assert.throws(
      () => parseCustomerAvailabilityInput(input),
      (error) => error?.code === "invalid-argument",
    );
  }
});

test("maps canonical validator reasons to bounded customer-safe copy", () => {
  const provider = {
    bookingLeadTimeDays: 14,
    ownerId: "private_owner_12345678",
    unavailableDates: ["2026-09-10"],
    availableStaffCount: 3,
  };
  const cases = [
    ["LEAD_TIME_NOT_MET", "Requires booking at least 14 days in advance."],
    ["BLOCKED_DATE", "Not available on this date."],
    ["OUTSIDE_OPERATING_DAY", "Not available on this date."],
    ["TIME_CONFLICT", "Not available during the selected time."],
    ["MAX_EVENTS_REACHED", "Already fully booked for this date."],
    ["GUEST_CAPACITY_EXCEEDED", "Guest count exceeds this provider's supported capacity."],
  ];

  for (const [code, expected] of cases) {
    assert.equal(customerSafeAvailabilityMessage(code, provider), expected);
  }
});

test("returns only public result fields and never serializes private configuration", () => {
  const provider = {
    bookingLeadTimeDays: 7,
    ownerId: "private_owner_12345678",
    unavailableDates: ["2026-09-10"],
    availableStaffCount: 3,
    availableEquipmentCount: 2,
  };
  const result = customerSafeAvailabilityResult(
    "provider_12345678",
    {
      available: false,
      issues: [{
        code: "TIME_CONFLICT",
        field: "eventTime",
        message: "Conflict with booking private_booking_12345678.",
      }],
    },
    provider,
  );

  assert.deepEqual(Object.keys(result).sort(), [
    "available",
    "message",
    "providerId",
    "reasonCode",
  ]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /private_owner|private_booking|unavailableDates|availableStaff|availableEquipment/u,
  );
});

test("callable enforces customer auth, App Check policy, rate limits, and trusted catalog reads", () => {
  for (const contract of [
    "appCheckCallableOptions",
    "requireAuth(request)",
    "requireRole(actor.uid",
    "USER_ROLES.customer",
    "enforceCallableRateLimit",
    'scope: "providerAvailability.customerCheck"',
    '.collection("packages")',
    '.collection("addons")',
    '.collection("providers")',
    '.collection("providerRequests")',
    "validateBookingPackage",
    "validateProviderAvailability",
    "isProviderPubliclyEligible",
  ]) {
    assert.ok(source.includes(contract), `missing ${contract}`);
  }

  assert.doesNotMatch(source, /return\s+providerData/u);
  assert.doesNotMatch(source, /return\s+availability\.issues/u);
});
