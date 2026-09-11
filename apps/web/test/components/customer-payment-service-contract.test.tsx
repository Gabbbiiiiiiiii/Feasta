import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("customer payment service contract", () => {
  const root = process.cwd();
  const service = readFileSync(
    join(
      root,
      "src/lib/customer/payments/customer-payment-service.ts",
    ),
    "utf8",
  );
  const action = readFileSync(
    join(root, "src/app/customer/payments/actions.ts"),
    "utf8",
  );
  const client = readFileSync(
    join(
      root,
      "src/lib/customer/payments/customer-payment-client.ts",
    ),
    "utf8",
  );
  const component = readFileSync(
    join(
      root,
      "src/components/customer/payments/customer-payments-client.tsx",
    ),
    "utf8",
  );
  const page = readFileSync(
    join(root, "src/app/customer/payments/page.tsx"),
    "utf8",
  );

  it("keeps Firebase Admin reads server-only and customer-authorized", () => {
    expect(service).toMatch(/^import "server-only";/u);
    expect(service).toContain("await requireCustomer()");
    expect(action).toContain("await requireCustomer()");
    expect(service).toContain(
      '.where("customerId", "==", customer.uid)',
    );
  });

  it("keeps list and search reads bounded", () => {
    expect(service).toContain("MAX_PAGE_SIZE = 30");
    expect(service).toContain("filters.pageSize + 1");
    expect(service).toContain(".limit(filters.pageSize)");
    expect(service).toContain("FieldPath.documentId()");
  });

  it("rechecks ownership before returning normalized payment records", () => {
    expect(service).toContain(
      "mapPaymentDocument(document, relations, customer.uid)",
    );
    expect(service).toContain(
      "providerRequestData.customerId === customerId",
    );
    expect(service).not.toMatch(
      /checkoutUrl|paymongoCheckoutId|gatewayResourceId/u,
    );
  });

  it("uses the protected callable and accepts only PayMongo HTTPS checkout URLs", () => {
    expect(client).toContain(
      'CREATE_PAYMENT_SESSION_FUNCTION = "createPaymentSession"',
    );
    expect(client).toContain("initializeBrowserAppCheck()");
    expect(client).toContain('url.protocol !== "https:"');
    expect(client).toContain('hostname === "paymongo.com"');
    expect(client).toContain(
      'hostname.endsWith(".paymongo.com")',
    );
    expect(client).toContain("url.username");
    expect(client).toContain("url.password");
  });

  it("creates a replay-safe client key and does not accept customer identity", () => {
    expect(client).toContain("crypto?.randomUUID?.()");
    expect(client).toContain('"customer-checkout"');
    expect(client).not.toMatch(/customerId\s*:/u);
  });

  it("stores only bounded checkout identifiers for a same-tab payment return", () => {
    expect(client).toContain(
      'PAYMENT_RETURN_STORAGE_KEY = "feasta.customer.payment-return.v1"',
    );
    expect(client).toContain(
      "PAYMENT_RETURN_MAX_AGE_MS = 4 * 60 * 60 * 1000",
    );
    expect(client).toContain(
      "rememberCustomerPaymentReturn({",
    );
    expect(client).toContain(
      "paymentId: result.paymentId",
    );
    expect(client).toContain(
      "providerRequestId: result.providerRequestId",
    );
    expect(client).toContain(
      "bookingId: result.bookingId",
    );
    expect(client).toContain(
      "window.sessionStorage.setItem(",
    );
    expect(client).not.toMatch(
      /rememberCustomerPaymentReturn\([\s\S]*?(?:amount|status|customerId|providerId)\s*:/u,
    );
  });

  it("treats browser return params as context rather than payment truth", () => {
    expect(page).toContain(
      "(await searchParams).payment",
    );
    expect(page).toContain('value === "success"');
    expect(page).toContain('value === "cancelled"');
    expect(page).toContain('return "invalid"');
    expect(page).not.toMatch(
      /status\s*=\s*["']paid["']/u,
    );
    expect(action).toContain(
      "getCustomerPaymentReturnDetails(lookup)",
    );
  });

  it("fails closed unless payment, request, event, and provider linkage agree", () => {
    expect(service).toContain(
      "payment.customerId !== customer.uid",
    );
    expect(service).toContain(
      "providerRequest.customerId !== customer.uid",
    );
    expect(service).toContain(
      "providerRequest.paymentId !== lookup.paymentId",
    );
    expect(service).toContain(
      "mainEvent.customerId !== customer.uid",
    );
    expect(service).toContain(
      "mainEvent.providerRequestIds.includes(providerRequestId)",
    );
    expect(service).toContain(
      "normalizeCanonicalProviderRequestIds(",
    );
    expect(service).toContain(
      "isCanonicalOwnedProviderRequest(",
    );
    expect(service).toContain(
      "areAllAssignedProvidersAcceptedForCheckout({",
    );
    expect(service).toContain(
      "providerRequestIds.length === 0",
    );
    expect(service).toContain(
      "providerRequestIds.length !== rawProviderRequestIds.length",
    );
    expect(service).toContain(
      "input.providerRequests.length !== providerRequestIds.length",
    );
    expect(service).toContain('"accepted",');
    expect(service).toContain(
      '"waiting_for_down_payment",',
    );
    expect(service).toContain(
      '"payment_processing",',
    );
    expect(service).toContain('"confirmed",');
    expect(service).toContain('"in_progress",');
    expect(service).toContain('"completed",');
    expect(service).toContain(
      "allAssignedProvidersAccepted &&",
    );
    expect(service).toContain(
      'payment.currency !== "PHP"',
    );
    expect(service).toContain(
      "amountInCentavos !== Math.round(downPaymentAmount * 100)",
    );
    expect(service).toContain(
      'input.providerRequestStatus === "waiting_for_down_payment"',
    );
    expect(service).toContain(
      'input.providerRequestPaymentStatus !== "processing"',
    );
    expect(service).toContain(
      '"waiting_for_down_payment",',
    );
    expect(action).toContain(
      "isCustomerPaymentReturnUnavailableError",
    );
    expect(action).toContain(
      'return {status: "unavailable"}',
    );
  });

  it("loads every canonical assigned provider request before enabling checkout", () => {
    expect(service).toContain(
      "loadBookingProviderRequests(bookings)",
    );
    expect(service).toContain(
      "bookingProviderRequests",
    );
    expect(service).toContain(
      "adminDb.getAll(",
    );
    expect(service).toContain(
      ".collection(COLLECTIONS.providerRequests)",
    );
    expect(service).toContain(
      ".doc(providerRequestId)",
    );
  });

  it("rechecks all assigned providers before payment-return retry", () => {
    expect(service).toContain(
      "assignedProviderRequestSnapshots",
    );
    expect(service).toContain(
      "canonicalProviderRequestIds.map(",
    );
    expect(service).toContain(
      "allAssignedProvidersAccepted",
    );
    expect(service).toMatch(
      /canStartCheckout:\s*allAssignedProvidersAccepted\s*&&\s*canRetryReturnedCheckout/u,
    );
  });

  it("keeps retry request-scoped and introduces no polling or snapshot listener", () => {
    expect(component).toContain(
      "createCustomerPaymentCheckout(selectedPayment.providerRequestId)",
    );
    expect(component).toContain(
      "payment.canStartCheckout",
    );
    expect(component).not.toMatch(
      /setInterval|onSnapshot/u,
    );
  });
});