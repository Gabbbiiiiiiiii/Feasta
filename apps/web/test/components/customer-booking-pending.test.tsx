import {describe, expect, it} from "vitest";

import {
  countPendingProviderResponses,
} from "@/lib/customer/bookings/customer-booking-pending";

describe("customer booking pending provider responses", () => {
  it.each([
    {
      name: "single declined provider",
      booking: {
        status: "needs_provider_replacement",
        pendingProviderRequestCount: 0,
      },
      expected: 0,
    },
    {
      name: "declined provider with another request pending",
      booking: {
        status: "needs_provider_replacement",
        pendingProviderRequestCount: 1,
      },
      expected: 1,
    },
    {
      name: "two provider requests awaiting review",
      booking: {
        status: "pending_provider_approval",
        pendingProviderRequestCount: 2,
      },
      expected: 2,
    },
    {
      name: "all providers already responded",
      booking: {
        status: "pending_provider_approval",
        pendingProviderRequestCount: 0,
      },
      expected: 0,
    },
    {
      name: "confirmed booking",
      booking: {
        status: "confirmed",
        pendingProviderRequestCount: 0,
      },
      expected: 0,
    },
    {
      name: "cancelled booking with stale pending count",
      booking: {
        status: "cancelled",
        pendingProviderRequestCount: 1,
      },
      expected: 0,
    },
    {
      name: "completed booking",
      booking: {
        status: "completed",
        pendingProviderRequestCount: 0,
      },
      expected: 0,
    },
    {
      name: "missing pending count",
      booking: {
        status: "needs_provider_replacement",
      },
      expected: 0,
    },
    {
      name: "invalid pending count",
      booking: {
        status: "pending_provider_approval",
        pendingProviderRequestCount: -1,
      },
      expected: 0,
    },
    {
      name: "fractional pending count",
      booking: {
        status: "pending_provider_approval",
        pendingProviderRequestCount: 1.5,
      },
      expected: 0,
    },
  ])("$name", ({booking, expected}) => {
    expect(countPendingProviderResponses(booking)).toBe(expected);
  });

  it("does not confuse declined and unanswered requests", () => {
    const declinedOnly = countPendingProviderResponses({
      status: "needs_provider_replacement",
      pendingProviderRequestCount: 0,
    });

    const mixed = countPendingProviderResponses({
      status: "needs_provider_replacement",
      pendingProviderRequestCount: 1,
    });

    expect(declinedOnly).toBe(0);
    expect(mixed).toBe(1);
  });
});
