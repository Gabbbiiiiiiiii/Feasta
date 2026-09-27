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

const service =
  readFileSync(
    join(
      root,
      "src/lib/customer/payments/customer-payment-service.ts",
    ),
    "utf8",
  );

const client =
  readFileSync(
    join(
      root,
      "src/components/customer/payments/customer-payments-client.tsx",
    ),
    "utf8",
  );

const receipt =
  readFileSync(
    join(
      root,
      "src/components/customer/payments/customer-payment-receipt.tsx",
    ),
    "utf8",
  );

const route =
  readFileSync(
    join(
      root,
      "src/app/customer/payments/[paymentId]/receipt/page.tsx",
    ),
    "utf8",
  );

it("projects trusted refund amounts into payment history", () => {
  expect(service).toContain(
    "customerReceiptRefundedAmount({",
  );

  expect(service).toContain(
    "receiptProjectionValid",
  );

  expect(service).toContain(
    "formattedRefundedAmount",
  );

  expect(service).toContain(
    "formattedNetPaid",
  );
});

it("shows receipts only from trusted receipt eligibility", () => {
  expect(client).toContain(
    "payment.canViewReceipt",
  );

  expect(client).toContain(
    "View receipt",
  );

  expect(client).toContain(
    'value="partially_refunded"',
  );
});

it("receipt route uses the Customer-authorized server service", () => {
  expect(route).toContain(
    "getCustomerPaymentReceipt(",
  );

  expect(route).toContain(
    "notFound()",
  );

  expect(route).not.toMatch(
    /adminDb|collection\(/u,
  );
});

it("uses Payment Receipt wording and browser printing", () => {
  expect(receipt).toContain(
    "Payment Receipt",
  );

  expect(receipt).toContain(
    "window.print()",
  );

  expect(receipt).not.toMatch(
    /Official Receipt|Official Invoice|Sales Invoice|BIR Invoice/iu,
  );
});