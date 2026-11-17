"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMultiProviderMarketplaceSelection: parse,
  MultiProviderContractError,
} = require("../lib/bookings/multi-provider-submission-contract.js");

const event = {
  eventType: "wedding", eventDate: "2026-12-20", eventTime: "10:00",
  eventEndTime: "18:00", guestCount: 100, eventLocation: "Ormoc City",
  eventAddress: "Ormoc City, Leyte", specialRequest: "Event instructions",
};
function selection(nested = true) {
  return {kind: "marketplace_service", providerId: "provider123", serviceId: "service123",
    expectedRevision: 3, configuration: nested
      ? {event: {...event}, specialRequest: "Provider instructions"}
      : {...event, specialRequest: "Provider instructions"}};
}
for (const [label, value] of [["forged numeric", 1], ["zero", 0], ["null", null], ["undefined", undefined]]) {
  for (const layout of ["nested configuration", "flat configuration", "nested event"]) {
    test(`rejects own price ${label} in ${layout}`, () => {
      const input = selection(layout !== "flat configuration");
      const target = layout === "nested event" ? input.configuration.event : input.configuration;
      target.price = value;
      assert.ok(Object.hasOwn(target, "price"));
      assert.throws(() => parse(input, event), error =>
        error instanceof MultiProviderContractError && /must not supply price/.test(error.message));
    });
  }
}
for (const nested of [true, false]) {
  test(`preserves legitimate ${nested ? "nested" : "flat"} event and provider instructions`, () => {
    const input = selection(nested);
    const result = parse(input, event);
    assert.deepEqual(result, input);
    assert.equal(result.configuration.specialRequest, "Provider instructions");
  });
}
test("rejects a non-enumerable own price field", () => {
  const input = selection();
  Object.defineProperty(input.configuration, "price", {value: undefined});
  assert.throws(() => parse(input, event), /must not supply price/);
});
test("accepts a configuration with a null prototype and no price", () => {
  const input = selection();
  input.configuration = Object.assign(Object.create(null), input.configuration);
  assert.equal(parse(input, event).serviceId, "service123");
});
