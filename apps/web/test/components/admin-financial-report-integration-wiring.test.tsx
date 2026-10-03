import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  expect,
  it,
} from "vitest";

const root =
  process.cwd();

function source(
  path:
    string,
): string {
  return readFileSync(
    join(
      root,
      path,
    ),
    "utf8",
  );
}

it(
  "integrates the trusted Financial Report into the existing Admin report result",
  () => {
    const reportService =
      source(
        "src/lib/admin/reports/admin-report-service.ts",
      );

    const reportTypes =
      source(
        "src/lib/admin/reports/admin-report-types.ts",
      );

    expect(
      reportService,
    ).toContain(
      "getAdminFinancialReportForResolvedFilters(",
    );

    expect(
      reportService,
    ).toMatch(
      /providers:\s*buildProviderPerformance\([\s\S]*?\),\s*financial,\s*definitions:/u,
    );

    expect(
      reportTypes,
    ).toContain(
      'financial?: import("./admin-financial-report-types").AdminFinancialReport',
    );
  },
);

it(
  "replaces the stale visible revenue placeholder with the Financial Report",
  () => {
    const client =
      source(
        "src/components/admin/reports/admin-reports-executive-client.tsx",
      );

    expect(
      client,
    ).toContain(
      "AdminFinancialReportSummary",
    );

    expect(
      client,
    ).not.toContain(
      ">Not configured<",
    );
  },
);

it(
  "extends Excel and CSV exports with financial reporting",
  () => {
    const excel =
      source(
        "src/lib/admin/reports/admin-report-excel.ts",
      );

    const csv =
      source(
        "src/lib/admin/reports/admin-report-export.ts",
      );

    expect(
      excel,
    ).toContain(
      'addWorksheet("Financial Report")',
    );

    expect(
      excel,
    ).toContain(
      "function buildFinancialSheet",
    );

    expect(
      csv,
    ).toContain(
      'section(rows, "FINANCIAL REPORT")',
    );

    expect(
      excel,
    ).toContain(
      "Net FEASTA platform revenue",
    );

    expect(
      csv,
    ).toContain(
      "Not derived automatically",
    );
  },
);

it(
  "keeps financial reporting read-only and preserves gateway-fee uncertainty",
  () => {
    const component =
      source(
        "src/components/admin/reports/admin-financial-report-summary.tsx",
      );

    const financialService =
      source(
        "src/lib/admin/reports/admin-financial-report-service.ts",
      );

    expect(
      component,
    ).toContain(
      "gatewayFeeNotice",
    );

    expect(
      component,
    ).toContain(
      "Not derived automatically",
    );

    expect(
      financialService,
    ).not.toMatch(
      /\.set\(|\.update\(|\.delete\(/u,
    );

    expect(
      financialService,
    ).not.toMatch(
      /reserveProviderSettlementPayout|createRefund|batch_transfers|send payout|withdraw/iu,
    );
  },
);

it(
  "removes the obsolete claim that commission and payout records are not persisted",
  () => {
    const reportService =
      source(
        "src/lib/admin/reports/admin-report-service.ts",
      );

    const reportTypes =
      source(
        "src/lib/admin/reports/admin-report-types.ts",
      );

    expect(
      reportService,
    ).not.toContain(
      "does not yet persist commission",
    );

    expect(
      reportTypes,
    ).not.toContain(
      "does not yet persist commission",
    );
  },
);