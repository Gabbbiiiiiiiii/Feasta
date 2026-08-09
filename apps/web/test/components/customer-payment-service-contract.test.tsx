import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("customer payment service contract", () => {
  const root = process.cwd();
  const service = readFileSync(join(root, "src/lib/customer/payments/customer-payment-service.ts"), "utf8");
  const action = readFileSync(join(root, "src/app/customer/payments/actions.ts"), "utf8");
  const client = readFileSync(join(root, "src/lib/customer/payments/customer-payment-client.ts"), "utf8");

  it("keeps Firebase Admin reads server-only and customer-authorized", () => {
    expect(service).toMatch(/^import "server-only";/u);
    expect(service).toContain("await requireCustomer()");
    expect(action).toContain("await requireCustomer()");
    expect(service).toContain('.where("customerId", "==", customer.uid)');
  });

  it("keeps list and search reads bounded", () => {
    expect(service).toContain("MAX_PAGE_SIZE = 30");
    expect(service).toContain("filters.pageSize + 1");
    expect(service).toContain(".limit(filters.pageSize)");
    expect(service).toContain("FieldPath.documentId()");
  });

  it("rechecks ownership before returning normalized payment records", () => {
    expect(service).toContain("mapPaymentDocument(document, relations, customer.uid)");
    expect(service).toContain("providerRequestData.customerId === customerId");
    expect(service).not.toMatch(/checkoutUrl|paymongoCheckoutId|gatewayResourceId/u);
  });

  it("uses the protected callable and accepts only PayMongo HTTPS checkout URLs", () => {
    expect(client).toContain('CREATE_PAYMENT_SESSION_FUNCTION = "createPaymentSession"');
    expect(client).toContain("initializeBrowserAppCheck()");
    expect(client).toContain('url.protocol !== "https:"');
    expect(client).toContain('hostname === "paymongo.com"');
    expect(client).toContain('hostname.endsWith(".paymongo.com")');
    expect(client).toContain("url.username");
    expect(client).toContain("url.password");
  });

  it("creates a replay-safe client key and does not accept customer identity", () => {
    expect(client).toContain("crypto?.randomUUID?.()");
    expect(client).toContain('"customer-checkout"');
    expect(client).not.toMatch(/customerId\s*:/u);
  });
});