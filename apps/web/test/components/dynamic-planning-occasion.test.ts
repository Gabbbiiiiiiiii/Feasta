import {describe, expect, it} from "vitest";

import {
  appendCustomerPlanningContext,
  parseCustomerPlanningContext,
} from "@/lib/customer/planning/event-planning-context";

const minimumDate = "2026-01-01";

describe("dynamic occasion planning navigation", () => {
  it("preserves legacy occasion IDs", () => {
    for (const id of [
      "birthday",
      "wedding",
      "debut",
      "corporate",
      "anniversary",
      "other",
    ]) {
      expect(
        parseCustomerPlanningContext({eventType: id}, minimumDate)?.eventType,
      ).toBe(id);
    }
  });

  it("accepts canonical dynamic occasion IDs", () => {
    expect(
      parseCustomerPlanningContext(
        {eventType: "baby_shower"},
        minimumDate,
      )?.eventType,
    ).toBe("baby_shower");
  });

  it("preserves the occasion during URL navigation", () => {
    const context = parseCustomerPlanningContext(
      {eventType: "family_reunion", guestCount: "120"},
      minimumDate,
    );

    const params = appendCustomerPlanningContext(
      new URLSearchParams(),
      context,
    );

    expect(params.get("eventType")).toBe("family_reunion");
    expect(params.get("guestCount")).toBe("120");

    expect(
      parseCustomerPlanningContext(
        Object.fromEntries(params),
        minimumDate,
      ),
    ).toEqual(context);
  });

  it("rejects malformed occasion IDs", () => {
    for (const id of [
      "",
      "Baby Shower",
      "BABY_SHOWER",
      "../birthday",
      "birthday!",
      "a",
      "a".repeat(65),
    ]) {
      expect(
        parseCustomerPlanningContext({eventType: id}, minimumDate),
      ).toBeNull();
    }
  });

  it("preserves valid fields when the occasion is invalid", () => {
    const context = parseCustomerPlanningContext(
      {
        eventType: "../invalid",
        guestCount: "50",
        eventDate: "2026-12-01",
      },
      minimumDate,
    );

    expect(context?.eventType).toBeUndefined();
    expect(context?.guestCount).toBe(50);
    expect(context?.eventDate).toBe("2026-12-01");
  });
});