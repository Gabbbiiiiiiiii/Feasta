import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("provider payment service contract", () => {
  const root = process.cwd();
  const service = readFileSync(
    join(root, "src/lib/provider/payments/provider-payment-service.ts"),
    "utf8",
  );
  const types = readFileSync(
    join(root, "src/lib/provider/payments/provider-payment-types.ts"),
    "utf8",
  );
  const normalization = readFileSync(
    join(root, "src/lib/provider/payments/provider-payment-normalization.ts"),
    "utf8",
  );
  const indexes = JSON.parse(readFileSync(
    join(root, "../../firebase/firestore.indexes.json"),
    "utf8",
  )) as {
    indexes: Array<{
      collectionGroup: string;
      fields: Array<{fieldPath: string; order?: string}>;
    }>;
  };

  it("derives approved provider identity only from the trusted session", () => {
    expect(service).toMatch(/^import "server-only";/u);
    expect(service).toContain("await requireApprovedProvider()");
    expect(service).toContain("normalizeDocumentId(account.providerId)");
    expect(service).toContain('.where("providerId", "==", providerId)');
    expect(service).not.toMatch(
      /getProviderPaymentPage\s*\([^)]*providerId/u,
    );
    expect(service).not.toMatch(
      /getProviderPaymentSummary\s*\([^)]*providerId/u,
    );
  });

  it("uses only canonical payment statuses for filtering", () => {
    for (const status of [
      "pending",
      "processing",
      "paid",
      "failed",
      "expired",
      "refunded",
    ]) {
      expect(types).toContain("ProviderPaymentStatus");
      expect(normalization).toContain("PAYMENT_STATUSES");
      expect(service).toContain("PAYMENT_STATUSES");
      expect(status).not.toBe("");
    }
    expect(types).not.toContain("partially_refunded");
    expect(types).not.toMatch(/cancelled|payout|settlement|commission|earnings/iu);
  });

  it("keeps payment history bounded and cursor-paginated", () => {
    expect(service).toContain("DEFAULT_PAGE_SIZE = 10");
    expect(service).toContain("MAX_PAGE_SIZE = 30");
    expect(service).toContain("filters.pageSize + 1");
    expect(service).toContain('.orderBy("createdAt", "desc")');
    expect(service).toContain('.orderBy(FieldPath.documentId(), "desc")');
    expect(service).toContain("encodeCursor(");
    expect(service).toContain("decodeCursor(");
    expect(service).not.toMatch(/\.get\(\)[\s\S]*providerId\s*:\s*input/iu);
  });

  it("validates provider-request, main-event, and customer linkage", () => {
    expect(normalization).toContain(
      "providerRequest.providerId !== input.trustedProviderId",
    );
    expect(normalization).toContain(
      "providerRequest.customerId !== customerId",
    );
    expect(normalization).toContain("mainEvent.customerId !== customerId");
    expect(service).toContain("skippedMalformedCount");
    expect(service).toContain("duplicateSnapshot.size !== 1");
    expect(service).toContain("throw unavailablePayment()");
  });

  it("uses exact provider-scoped aggregate metrics without financial claims", () => {
    for (const metric of [
      "confirmedCustomerPayments",
      "processingPayments",
      "failedPayments",
      "expiredPayments",
      "fullyRefundedPayments",
      "paymentRecords",
      "refundAwaitingConfirmation",
    ]) {
      expect(types).toContain(metric);
    }
    expect(service).toContain("AggregateField.count()");
    expect(service).toContain('AggregateField.sum("amountInCentavos")');
    expect(service).toContain('.where("refundStatus", "==", "requested")');
    expect(`${types}\n${service}`).not.toMatch(
      /providerWallet|withdrawable|availableBalance|netEarnings|payoutCollection/iu,
    );
  });

  it("does not expose payment secrets or admin-only operational data", () => {
    for (const forbidden of [
      "checkoutUrl",
      "clientRequestHash",
      "rawWebhook",
      "refundRequestedBy",
      "adminLogs",
      "paymentWebhookEvents",
    ]) {
      expect(types).not.toContain(forbidden);
    }
    expect(service).not.toMatch(/collection\(["']bookings["']\)/u);
  });

  it("declares only the provider payment indexes used by the history queries", () => {
    const providerPaymentIndexes = indexes.indexes
      .filter((index) => index.collectionGroup === "payments")
      .map((index) => index.fields.map((field) =>
        `${field.fieldPath}:${field.order ?? ""}`,
      ))
      .filter((fields) => fields[0] === "providerId:ASCENDING");

    expect(providerPaymentIndexes).toContainEqual([
      "providerId:ASCENDING",
      "createdAt:DESCENDING",
      "__name__:DESCENDING",
    ]);
    expect(providerPaymentIndexes).toContainEqual([
      "providerId:ASCENDING",
      "status:ASCENDING",
      "createdAt:DESCENDING",
      "__name__:DESCENDING",
    ]);
  });
});
