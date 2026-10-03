const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {initializeApp} = require("firebase-admin/app");

initializeApp({projectId: "demo-feasta-marketplace-availability"});

const {
  parseMarketplaceAvailabilityInput,
} = require("../lib/provider-availability/check-marketplace-provider-availability.js");

const validInput = {
  providerIds: ["provider_12345678", "provider_87654321"],
  eventDate: "2026-09-10",
  eventTime: "18:00",
  eventEndTime: "22:00",
  guestCount: 100,
  serviceType: "catering",
};

test("marketplace availability input accepts a bounded canonical page request", () => {
  const parsed = parseMarketplaceAvailabilityInput(validInput);
  assert.deepEqual(parsed.providerIds, validInput.providerIds);
  assert.equal(parsed.eventTime, "18:00");
  assert.equal(parsed.eventEndTime, "22:00");
  assert.equal(parsed.guestCount, 100);
  assert.equal(parsed.serviceType, "catering");
});

test("marketplace availability rejects malformed, duplicate, and oversized provider IDs", () => {
  assert.throws(() => parseMarketplaceAvailabilityInput({
    ...validInput,
    providerIds: ["bad.id"],
  }), /providerIds is invalid/u);
  assert.throws(() => parseMarketplaceAvailabilityInput({
    ...validInput,
    providerIds: ["provider_12345678", "provider_12345678"],
  }), /providerIds is invalid/u);
  assert.throws(() => parseMarketplaceAvailabilityInput({
    ...validInput,
    providerIds: Array.from({length: 13}, (_, index) =>
      `provider_${String(index).padStart(8, "0")}`),
  }), /providerIds is invalid/u);
});

test("marketplace availability rejects malformed event input and unknown fields", () => {
  assert.throws(() => parseMarketplaceAvailabilityInput({
    ...validInput,
    eventEndTime: "17:59",
  }), /event date or time is invalid/u);
  assert.throws(() => parseMarketplaceAvailabilityInput({
    ...validInput,
    guestCount: 1.5,
  }), /guestCount is invalid/u);
  assert.throws(() => parseMarketplaceAvailabilityInput({
    ...validInput,
    ownerId: "private_owner_12345678",
  }), /unsupported fields/u);
});

test("marketplace callable is customer-only, App Check protected, rate limited, and privacy-safe", () => {
  const source = readFileSync(path.resolve(
    __dirname,
    "../src/provider-availability/check-marketplace-provider-availability.ts",
  ), "utf8");
  for (const control of [
    "appCheckCallableOptions",
    "requireAuth(request)",
    "requireRole(actor.uid",
    "USER_ROLES.customer",
    "providerAvailability.marketplaceCheck",
    "MAX_PROVIDER_IDS = 12",
    "validateProviderAvailability",
    "customerSafeAvailabilityResult",
  ]) assert.ok(source.includes(control), `missing ${control}`);
  assert.doesNotMatch(source, /return\s+providerData/u);
  assert.doesNotMatch(source, /return\s+availability\.issues/u);
  assert.doesNotMatch(source, /ownerId:\s*ownerId/u);
});
