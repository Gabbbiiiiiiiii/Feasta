import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {render} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {BookingPolicySummary} from "@/components/shared/booking-policy-summary";
import {bookingPaymentStatusMismatch} from "@/lib/admin/payments/payment-review";
import {bookingPolicyV3Presentation} from "@/lib/payments/booking-policy-v3-presentation";

const event =
  new Date("2026-10-16T18:00:00+08:00");

const time = (hours: number) => ({
  toDate: () =>
    new Date(
      event.getTime() -
      hours * 3_600_000,
    ),
});

function paymentDefaultPolicy() {
  return bookingPolicyV3Presentation(
    {
      remainingBalanceTimingSchemaVersion: 3,
      balanceDueHoursBeforeEvent: 48,

      eventStartAt: time(0),
      remainingBalanceDueAt: time(48),
      hardPaymentDeadlineAt: time(24),
      preparationStartsAt: time(24),

      eventDate: time(0),
      eventEndTime: "20:00",

      bookingLifecyclePolicySnapshot: {
        schemaVersion: 3,
        preparationLeadTimeHours: 24,
        providerStartsManually: false,
        requiresFullPayment: true,
        autoStartAtScheduledTime: true,
        providerConfirmsCompletion: true,
      },

      status: "cancelled",
      settlementStatus: "deposit_settled",
      outstandingAmountInCentavos: 500000,

      cancellationReason:
        "remaining_balance_unpaid_at_deadline",

      remainingBalanceEnforcement: {
        status: "cancellation_pending",
      },

      paymentDefaultAllocation: {
        schemaVersion: 1,

        paidDepositInCentavos: 500000,

        customerRefundRateBps: 7000,
        providerReservationCompRateBps: 2000,
        feastaCancellationFeeRateBps: 1000,

        customerDefaultRefundAmountInCentavos:
          350000,

        providerReservationCompAmountInCentavos:
          100000,

        feastaCancellationFeeAmountInCentavos:
          50000,
      },
    },
    event,
  );
}

describe("Admin payment-default presentation", () => {
  it("shows the trusted 70/20/10 allocation through the shared Admin presentation", () => {
    const policy =
      paymentDefaultPolicy();

    expect(policy).not.toBeNull();

    render(
      <BookingPolicySummary
        policy={policy}
        audience="admin"
      />,
    );

    const content =
      document.body.textContent ?? "";

    expect(content).toMatch(
      /Refund status:\s*Processing/u,
    );

    expect(content).toMatch(
      /3,500/u,
    );

    expect(content).toMatch(
      /Reservation compensation[\s\S]*1,000/u,
    );

    expect(content).toMatch(
      /FEASTA cancellation[\s\S]*500/u,
    );

    expect(content).not.toMatch(
      /checkout_|pay_|reconciliation_required/u,
    );
  });

  it("keeps Admin Booking and Admin Payment wired to the shared trusted policy presentation", () => {
    const bookingDrawer =
      readFileSync(
        resolve(
          "src/components/admin/bookings/booking-details-drawer.tsx",
        ),
        "utf8",
      );

    const paymentDrawer =
      readFileSync(
        resolve(
          "src/components/admin/payments/payment-details-drawer.tsx",
        ),
        "utf8",
      );

    expect(bookingDrawer).toMatch(
      /<BookingPolicySummary\s+policy=\{request\.bookingPolicy\}\s+audience="admin"\s*\/>/u,
    );

    expect(paymentDrawer).toMatch(
      /<BookingPolicySummary\s+policy=\{visiblePayment\?\.bookingPolicy\}\s+audience="admin"\s*\/>/u,
    );
  });

  it("does not report valid deposit and refund states as booking mismatches", () => {
    expect(
      bookingPaymentStatusMismatch(
        true,
        "paid",
        "partially_paid",
      ),
    ).toBe(false);

    expect(
      bookingPaymentStatusMismatch(
        true,
        "paid",
        "paid",
      ),
    ).toBe(false);

    expect(
      bookingPaymentStatusMismatch(
        true,
        "partially_refunded",
        "partially_paid",
      ),
    ).toBe(false);

    expect(
      bookingPaymentStatusMismatch(
        true,
        "refunded",
        "partially_paid",
      ),
    ).toBe(false);

    expect(
      bookingPaymentStatusMismatch(
        true,
        "paid",
        "unpaid",
      ),
    ).toBe(true);
  });
});