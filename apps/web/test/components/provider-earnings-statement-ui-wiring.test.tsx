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

const route =
  readFileSync(
    join(
      root,
      "src/app/provider/payments/statements/page.tsx",
    ),
    "utf8",
  );

const client =
  readFileSync(
    join(
      root,
      "src/app/provider/payments/statements/provider-earnings-statement-client.tsx",
    ),
    "utf8",
  );

const financePanel =
  readFileSync(
    join(
      root,
      "src/app/provider/payments/provider-finance-panel.tsx",
    ),
    "utf8",
  );

it(
  "loads the monthly statement only through the trusted Provider server service",
  () => {
    expect(route).toContain(
      "getProviderEarningsStatement(",
    );

    expect(route).toContain(
      "normalizeProviderEarningsStatementMonth(",
    );

    expect(route).toContain(
      "notFound()",
    );

    expect(route).not.toMatch(
      /adminDb|collection\(/u,
    );
  },
);

it(
  "exports only the trusted statement projection as CSV",
  () => {
    expect(client).toContain(
      "downloadStatementCsv",
    );

    expect(client).toContain(
      "new Blob(",
    );

    expect(client).toContain(
      "URL.createObjectURL(",
    );

    expect(client).toContain(
      ".csv`",
    );

    expect(client).toContain(
      "csvCell",
    );

    expect(client).toContain(
      "/^[=+\\-@]/u",
    );
  },
);

it(
  "keeps Customer payment and Provider settlement truth distinguishable",
  () => {
    expect(client).toContain(
      "Customer gross collected",
    );

    expect(client).toContain(
      "Net Provider earnings",
    );

    expect(client).toContain(
      "Confirmed settlement paid out",
    );

    expect(client).toContain(
      "Provider Earning Paid Bucket PHP",
    );

    expect(client).toContain(
      "Confirmed Settlement Paid Out PHP",
    );
  },
);

it(
  "adds the statement entry point to existing Provider finance",
  () => {
    expect(financePanel).toContain(
      'href="/provider/payments/statements"',
    );

    expect(financePanel).toContain(
      "View earnings statement",
    );
  },
);

it(
  "contains no payout mutation or statutory invoice behavior",
  () => {
    expect(client).not.toMatch(
      /reserveProviderSettlementPayout|send payout|withdraw|batch_transfers/iu,
    );

    expect(client).not.toMatch(
      /Official Receipt|Official Invoice|Sales Invoice|BIR Invoice|Tax Invoice/iu,
    );

    expect(route).not.toMatch(
      /\.set\(|\.update\(|\.delete\(/u,
    );
  },
);