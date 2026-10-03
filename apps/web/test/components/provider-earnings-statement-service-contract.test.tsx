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
  "P12 Provider Earnings Statement service contract",
  () => {
    const root =
      process.cwd();

    const service =
      readFileSync(
        join(
          root,
          "src/lib/provider/payments/provider-earnings-statement-service.ts",
        ),
        "utf8",
      );

    const types =
      readFileSync(
        join(
          root,
          "src/lib/provider/payments/provider-earnings-statement-types.ts",
        ),
        "utf8",
      );

    it(
      "is an approved-Provider server-only projection",
      () => {
        expect(service).toMatch(
          /^import "server-only";/u,
        );

        expect(service).toContain(
          "await requireApprovedProvider()",
        );

        expect(service).toContain(
          '.collection(\n        "providerEarnings",',
        );

        expect(service).toContain(
          '.collection(\n        "providerSettlements",',
        );

        expect(service).toContain(
          '.collection(\n          "providers",',
        );
      },
    );

    it(
      "uses a bounded Asia-Manila monthly statement period",
      () => {
        expect(service).toContain(
          '"Asia/Manila"',
        );

        expect(service).toContain(
          '">=",',
        );

        expect(service).toContain(
          '"<",',
        );

        expect(service).toContain(
          '.orderBy(\n        "createdAt",\n        "desc",',
        );

        expect(types).toContain(
          "endAtExclusive",
        );
      },
    );

    it(
      "projects existing Provider earning truth instead of recalculating commission",
      () => {
        for (
          const field of [
            "grossCollectedInCentavos",
            "commissionDeductedInCentavos",
            "withholdingDeductedInCentavos",
            "providerVatComponentInCentavos",
            "platformVatOnCommissionInCentavos",
            "earningAmountInCentavos",
            "reversedAmountInCentavos",
            "netEarningAmountInCentavos",
            "pendingAmountInCentavos",
            "availableAmountInCentavos",
            "paidAmountInCentavos",
          ]
        ) {
          expect(
            service,
          ).toContain(
            field,
          );
        }

        expect(service).not.toMatch(
          /platformCommissionRateBps|applyBasisPoints|inclusiveTaxComponent/u,
        );
      },
    );

    it(
      "keeps Provider settlement truth separate from earning truth",
      () => {
        expect(types).toContain(
          "ProviderEarningsStatementSettlement",
        );

        expect(types).toContain(
          "netSettlementAmountInCentavos",
        );

        expect(types).toContain(
          "settlementPaidOutInCentavos",
        );

        expect(service).toContain(
          "Customer payment truth, Provider earning truth, and",
        );

        expect(service).toContain(
          "Provider settlement truth are intentionally separate.",
        );
      },
    );

    it(
      "fails closed for malformed money instead of converting it to zero",
      () => {
        expect(service).toContain(
          "function strictMoney(",
        );

        expect(service).toContain(
          "return null;",
        );

        expect(service).toContain(
          "skippedMalformedCount",
        );
      },
    );

    it(
      "does not mix PayMongo gateway fees into Provider statements",
      () => {
        expect(service).not.toMatch(
          /gatewayProcessingFee|gatewayFeeInCentavos/iu,
        );

        expect(types).not.toMatch(
          /gatewayProcessingFee|gatewayFeeInCentavos/iu,
        );
      },
    );

    it(
      "uses Provider Earnings Statement terminology without claiming a statutory document",
      () => {
        expect(types).toContain(
          '"provider_earnings_statement"',
        );

        expect(service).toContain(
          "This Provider Earnings Statement is a FEASTA platform finance record.",
        );

        expect(service).not.toMatch(
          /Official Receipt|Official Invoice|Sales Invoice|BIR Invoice|Tax Invoice/iu,
        );
      },
    );
  },
);