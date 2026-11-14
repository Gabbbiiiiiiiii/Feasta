import {
  describe,
  expect,
  it,
} from "vitest";

import {
  summarizeAdminFinancialLedger,
  summarizeAdminGatewayFees,
  summarizeAdminProviderEarnings,
  summarizeAdminSettlementPayouts,
} from "@/lib/admin/reports/admin-financial-report-domain";

describe(
  "Admin financial report domain",
  () => {
    it(
      "reports accruals and reversals as period movements without rewriting history",
      () => {
        const summary =
          summarizeAdminFinancialLedger(
            [
              {
                ledgerEntryId:
                  "payment-one",

                entryType:
                  "payment_settled",

                paymentId:
                  "payment-one",

                providerRequestId:
                  "request-one",

                mainEventId:
                  "event-one",

                providerId:
                  "provider-one",

                currency:
                  "PHP",

                grossAmountInCentavos:
                  1000000,

                refundAmountInCentavos:
                  0,

                commissionAccruedInCentavos:
                  100000,

                commissionReversedInCentavos:
                  0,

                providerVatAccruedInCentavos:
                  107143,

                providerVatReversedInCentavos:
                  0,

                platformVatAccruedInCentavos:
                  12000,

                platformVatReversedInCentavos:
                  0,

                withholdingAccruedInCentavos:
                  0,

                withholdingReversedInCentavos:
                  0,

                createdAt:
                  "2026-09-01T00:00:00.000Z",
              },

              {
                ledgerEntryId:
                  "refund-one",

                entryType:
                  "refund_completed",

                paymentId:
                  "payment-one",

                providerRequestId:
                  "request-one",

                mainEventId:
                  "event-one",

                providerId:
                  "provider-one",

                currency:
                  "PHP",

                grossAmountInCentavos:
                  0,

                refundAmountInCentavos:
                  250000,

                commissionAccruedInCentavos:
                  0,

                commissionReversedInCentavos:
                  25000,

                providerVatAccruedInCentavos:
                  0,

                providerVatReversedInCentavos:
                  26786,

                platformVatAccruedInCentavos:
                  0,

                platformVatReversedInCentavos:
                  3000,

                withholdingAccruedInCentavos:
                  0,

                withholdingReversedInCentavos:
                  0,

                createdAt:
                  "2026-09-05T00:00:00.000Z",
              },
            ],
            0,
          );

        expect(
          summary,
        ).toMatchObject({
          paymentSettlementCount:
            1,

          completedRefundCount:
            1,

          grossCollectedInCentavos:
            1000000,

          completedRefundsInCentavos:
            250000,

          customerCashMovementInCentavos:
            750000,

          commissionAccruedInCentavos:
            100000,

          commissionReversedInCentavos:
            25000,

          commissionNetMovementInCentavos:
            75000,

          platformVatAccruedInCentavos:
            12000,

          platformVatReversedInCentavos:
            3000,

          platformVatNetMovementInCentavos:
            9000,
        });
      },
    );

    it(
      "allows a reporting period to have negative net movement",
      () => {
        const summary =
          summarizeAdminFinancialLedger(
            [
              {
                ledgerEntryId:
                  "refund-old-payment",

                entryType:
                  "refund_completed",

                paymentId:
                  "old-payment",

                providerRequestId:
                  "request-one",

                mainEventId:
                  "event-one",

                providerId:
                  "provider-one",

                currency:
                  "PHP",

                grossAmountInCentavos:
                  0,

                refundAmountInCentavos:
                  50000,

                commissionAccruedInCentavos:
                  0,

                commissionReversedInCentavos:
                  5000,

                providerVatAccruedInCentavos:
                  0,

                providerVatReversedInCentavos:
                  0,

                platformVatAccruedInCentavos:
                  0,

                platformVatReversedInCentavos:
                  600,

                withholdingAccruedInCentavos:
                  0,

                withholdingReversedInCentavos:
                  0,

                createdAt:
                  "2026-09-10T00:00:00.000Z",
              },
            ],
            0,
          );

        expect(
          summary.customerCashMovementInCentavos,
        ).toBe(
          -50000,
        );

        expect(
          summary.commissionNetMovementInCentavos,
        ).toBe(
          -5000,
        );
      },
    );

    it(
      "keeps Provider earning truth separate from payout truth",
      () => {
        const earnings =
          summarizeAdminProviderEarnings(
            [
              {
                earningId:
                  "earning-one",

                paymentId:
                  "payment-one",

                providerRequestId:
                  "request-one",

                mainEventId:
                  "event-one",

                providerId:
                  "provider-one",

                status:
                  "available",

                currency:
                  "PHP",

                originalEarningInCentavos:
                  900000,

                reversedAmountInCentavos:
                  100000,

                netEarningInCentavos:
                  800000,

                pendingAmountInCentavos:
                  0,

                availableAmountInCentavos:
                  800000,

                paidAmountInCentavos:
                  0,

                createdAt:
                  "2026-09-01T00:00:00.000Z",
              },
            ],
            0,
          );

        const payouts =
          summarizeAdminSettlementPayouts(
            [],
            0,
          );

        expect(
          earnings.netEarningInCentavos,
        ).toBe(
          800000,
        );

        expect(
          payouts.paidOutAmountInCentavos,
        ).toBe(
          0,
        );
      },
    );

    it(
      "never converts unavailable gateway fee evidence to zero-value observed evidence",
      () => {
        const summary =
          summarizeAdminGatewayFees(
            [
              {
                paymentId:
                  "payment-one",

                providerId:
                  "provider-one",

                currency:
                  "PHP",

                status:
                  "observed",

                amountInCentavos:
                  2500,

                paidAt:
                  "2026-09-01T00:00:00.000Z",
              },

              {
                paymentId:
                  "payment-two",

                providerId:
                  "provider-one",

                currency:
                  "PHP",

                status:
                  "unavailable",

                amountInCentavos:
                  null,

                paidAt:
                  "2026-09-02T00:00:00.000Z",
              },
            ],
          );

        expect(
          summary,
        ).toEqual({
          successfulPaymentCount:
            2,

          observedCount:
            1,

          unavailableCount:
            1,

          invalidCount:
            0,

          observedFeeInCentavos:
            2500,

          evidenceCompleteness:
            "partial",

          authoritativeNetPlatformRevenueInCentavos:
            null,
        });
      },
    );

    it(
      "marks invalid gateway evidence instead of calculating platform net revenue",
      () => {
        const summary =
          summarizeAdminGatewayFees(
            [
              {
                paymentId:
                  "payment-one",

                providerId:
                  "provider-one",

                currency:
                  "PHP",

                status:
                  "invalid",

                amountInCentavos:
                  null,

                paidAt:
                  "2026-09-01T00:00:00.000Z",
              },
            ],
          );

        expect(
          summary.evidenceCompleteness,
        ).toBe(
          "invalid",
        );

        expect(
          summary.authoritativeNetPlatformRevenueInCentavos,
        ).toBeNull();
      },
    );
  },
);