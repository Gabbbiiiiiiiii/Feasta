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
  "Admin financial report service contract",
  () => {
    const root =
      process.cwd();

    const service =
      readFileSync(
        join(
          root,
          "src/lib/admin/reports/admin-financial-report-service.ts",
        ),
        "utf8",
      );

    const types =
      readFileSync(
        join(
          root,
          "src/lib/admin/reports/admin-financial-report-types.ts",
        ),
        "utf8",
      );

    it(
      "authorizes Admin before querying financial records",
      () => {
        expect(service).toMatch(
          /^import "server-only";/u,
        );

        expect(service).toContain(
          "await requireAdmin()",
        );

        expect(service.indexOf(
          "await requireAdmin()",
        )).toBeLessThan(
          service.indexOf(
            "await Promise.all",
          ),
        );
      },
    );

    it(
      "uses four selected-period bounded and field-projected finance queries",
      () => {
        expect(
          service.match(
            /\.where\(\s*"createdAt",\s*">="/gu,
          ),
        ).toHaveLength(
          2,
        );

        expect(
          service.match(
            /\.where\(\s*"createdAt",\s*"<"/gu,
          ),
        ).toHaveLength(
          2,
        );

        expect(service).toContain(
          '.where(\n          "paidOutAt",\n          ">=",',
        );

        expect(service).toContain(
          '.where(\n          "paidAt",\n          ">=",',
        );

        expect(
          service.match(
            /\.select\(/gu,
          ),
        ).toHaveLength(
          4,
        );
      },
    );

    it(
      "reads immutable financial ledger movements and separate Provider settlement truth",
      () => {
        expect(service).toContain(
          '"financialLedgerEntries"',
        );

        expect(service).toContain(
          '"providerEarnings"',
        );

        expect(service).toContain(
          '"providerSettlements"',
        );

        expect(service).toContain(
          '"payments"',
        );

        expect(types).toContain(
          "customerCashMovementInCentavos",
        );

        expect(types).toContain(
          "settlementPayouts",
        );
      },
    );

    it(
      "keeps gateway fee evidence separate and never manufactures net platform revenue",
      () => {
        expect(service).toContain(
          "gatewayProcessingFeeEvidence",
        );

        expect(service).toContain(
          '"unavailable"',
        );

        expect(types).toContain(
          "authoritativeNetPlatformRevenueInCentavos",
        );

        expect(types).toMatch(
          /authoritativeNetPlatformRevenueInCentavos:\s*\n\s*null;/u,
        );
      },
    );

    it(
      "does not apply operational filters to immutable financial movements",
      () => {
        expect(service).toContain(
          "Financial reporting is intentionally period-based and",
        );

        expect(service).toContain(
          "platform-wide.",
        );
      },
    );

    it(
      "is read-only and contains no payout or refund mutation authority",
      () => {
        expect(service).not.toMatch(
          /\.set\(|\.update\(|\.delete\(/u,
        );

        expect(service).not.toMatch(
          /reserveProviderSettlementPayout|createRefund|batch_transfers|send payout|withdraw/iu,
        );
      },
    );

    it(
      "uses Financial Report terminology instead of pretending to issue a statutory document",
      () => {
        expect(types).toContain(
          '"admin_financial_report"',
        );

        expect(service).toContain(
          "This Financial Report is a FEASTA administrative platform record",
        );

        expect(service).not.toMatch(
          /Official Receipt|Official Invoice|Sales Invoice|BIR Invoice|Tax Invoice/iu,
        );
      },
    );
  },
);