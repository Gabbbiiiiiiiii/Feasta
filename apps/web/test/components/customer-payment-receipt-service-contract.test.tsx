import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "P12 Customer Payment Receipt service contract",
  () => {
    const root =
      process.cwd();

    const service =
      readFileSync(
        join(
          root,
          "src/lib/customer/payments/customer-payment-service.ts",
        ),
        "utf8",
      );

    const actions =
      readFileSync(
        join(
          root,
          "src/app/customer/payments/actions.ts",
        ),
        "utf8",
      );

    const types =
      readFileSync(
        join(
          root,
          "src/lib/customer/payments/customer-payment-types.ts",
        ),
        "utf8",
      );

    it(
      "uses Payment Receipt terminology",
      () => {
        expect(types).toContain(
          '"payment_receipt"',
        );

        expect(service).toContain(
          "This Payment Receipt is a FEASTA platform payment record",
        );

        expect(service).not.toMatch(
          /Official Receipt|Official Invoice|Sales Invoice|BIR Invoice/iu,
        );
      },
    );

    it(
      "keeps receipt reads server-only and Customer-authorized",
      () => {
        expect(service).toMatch(
          /^import "server-only";/u,
        );

        expect(service).toContain(
          "getCustomerPaymentReceipt(",
        );

        expect(service).toContain(
          "await requireCustomer()",
        );

        expect(service).toContain(
          "payment.customerId !==",
        );

        expect(service).toContain(
          "customer.uid",
        );

        expect(actions).toContain(
          "await requireCustomer()",
        );
      },
    );

    it(
      "requires payment, Provider request, booking, and Provider linkage",
      () => {
        for (
          const evidence of [
            "providerRequestContainsPayment(",
            "providerRequest.providerRequestId",
            "providerRequest.mainEventId",
            "providerRequest.customerId",
            "providerRequest.providerId",
            "booking.mainEventId",
            "booking.customerId",
            "booking.providerRequestIds",
            "providerSnapshot.id",
          ]
        ) {
          expect(
            service,
          ).toContain(
            evidence,
          );
        }
      },
    );

    it(
      "supports full and partial Customer refund receipt amounts",
      () => {
        expect(service).toContain(
          '"partially_refunded"',
        );

        expect(service).toContain(
          "refundedAmountInCentavos",
        );

        expect(service).toContain(
          "netPaidInCentavos",
        );

        expect(service).toMatch(
          /canonical ===\s*input\.amountPaidInCentavos/u,
        );

        expect(service).toMatch(
          /return input\s*\.amountPaidInCentavos;/u,
        );
      },
    );

    it(
      "does not expose internal finance or gateway-fee evidence in the receipt DTO",
      () => {
        const receiptType =
          types.match(
            /export type CustomerPaymentReceipt = \{([\s\S]*?)\n\};/u,
          );

        expect(
          receiptType,
        ).not.toBeNull();

        const dto =
          receiptType?.[1] ??
          "";

        expect(dto).not.toMatch(
          /commission|providerVat|platformVat|earning|settlement|payout|gatewayProcessingFee|gatewayFee/iu,
        );

        expect(dto).not.toMatch(
          /paymongoResourceId|gatewayResourceId|checkoutUrl|paymentIntentId/iu,
        );
      },
    );

    it(
      "returns unavailable instead of leaking an invalid receipt lookup",
      () => {
        expect(actions).toContain(
          "isCustomerPaymentReceiptUnavailableError",
        );

        expect(actions).toContain(
          'status: "unavailable"',
        );
      },
    );
  },
);