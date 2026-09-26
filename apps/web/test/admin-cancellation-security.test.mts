import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../src/", import.meta.url);
const functionsRoot = new URL("../../../functions/src/", import.meta.url);
const webSource = (path: string) => readFile(new URL(path, webRoot), "utf8");
const functionSource = (path: string) => readFile(new URL(path, functionsRoot), "utf8");

test("Admin cancellation decisions and refund execution use exact trusted callables", async () => {
  const [client, execution, inspection] = await Promise.all([
    webSource("lib/admin/cancellations/admin-cancellation-client.ts"),
    functionSource("refunds/refund-execution.ts"),
    functionSource("refunds/inspect-refund-reconciliation.ts"),
  ]);

  for (const operation of [
    "approveProviderRequestCancellationRefund",
    "rejectProviderRequestCancellation",
    "executeProviderRequestRefund",
    "inspectProviderRequestRefundReconciliation",
  ]) assert.match(client, new RegExp(operation, "u"));

  assert.match(client, /httpsCallable/u);
  assert.match(client, /initializeBrowserAppCheck\(\)/u);
  assert.doesNotMatch(client, /firebase\/firestore|setDoc\(|addDoc\(|updateDoc\(|writeBatch\(/u);
  assert.doesNotMatch(client, /paymongo|gatewayPaymentId|gatewayRefundId/iu);
  assert.doesNotMatch(client, /amountInCentavos\s*:|refundBasisPoints\s*:|percentage\s*:|policyRules\s*:|currency\s*:/u);

  assert.match(execution, /requireRole\(actor\.uid, \[USER_ROLES\.admin\]\)/u);
  assert.match(execution, /exactInput\(request, \[\s*"cancellationRequestId",\s*"idempotencyKey",\s*\]\)/u);
  assert.match(execution, /"cancellationRequestId",\s*"reason",\s*"idempotencyKey"/u);
  assert.match(inspection, /requireRole\(actor\.uid, \[USER_ROLES\.admin\]\)/u);
  assert.match(inspection, /Object\.keys\(input\)\.length !== 1/u);
});

test("Customer and Provider roles cannot invoke Admin financial operations", async () => {
  const execution = await functionSource("refunds/refund-execution.ts");
  const adminRoleChecks = execution.match(/requireRole\(actor\.uid, \[USER_ROLES\.admin\]\)/gu) ?? [];
  assert.equal(adminRoleChecks.length, 3);
  assert.doesNotMatch(execution, /requireRole\(actor\.uid, \[USER_ROLES\.(customer|provider)\]\)/u);
});

test("Admin queue reads are server-authorized and expose a bounded projection", async () => {
  const [service, types, component, page] = await Promise.all([
    webSource("lib/admin/cancellations/admin-cancellation-service.ts"),
    webSource("lib/admin/cancellations/admin-cancellation-types.ts"),
    webSource("components/admin/bookings/cancellation-management-client.tsx"),
    webSource("app/admin/bookings/page.tsx"),
  ]);

  assert.match(service, /import "server-only"/u);
  assert.match(service, /await requireAdmin\(\)/u);
  assert.match(service, /\.limit\(QUEUE_LIMIT\)/u);
  assert.doesNotMatch(types, /customerId:|providerId:|actorUid:|gatewayPaymentId:|gatewayRefundId:/u);
  assert.doesNotMatch(component, /collection\(|doc\(|setDoc\(|updateDoc\(|PayMongo/iu);
  assert.match(component, /one Provider service at a time/u);
  assert.match(page, /Promise\.all/u);
  assert.match(page, /getAdminCancellationQueue/u);
  assert.match(page, /supplementalContent/u);
});

test("Provider preparation UI is factual, forward-only, and non-financial", async () => {
  const [client, drawer, backend] = await Promise.all([
    webSource("lib/provider/bookings/provider-booking-client.ts"),
    webSource("app/provider/bookings/provider-booking-detail-drawer.tsx"),
    functionSource("cancellations/advance-refund-eligibility-stage.ts"),
  ]);

  assert.match(client, /advanceProviderRequestRefundEligibilityStage/u);
  assert.match(client, /targetStage: "preparation_started"/u);
  assert.doesNotMatch(client, /refundAmount|refundPercentage|refundBasisPoints|gatewayPaymentId/iu);
  assert.match(drawer, /factual preparation progress only/u);
  assert.match(drawer, /locked by an active cancellation request/u);
  assert.doesNotMatch(drawer, /Approve cancellation|Reject cancellation|Process refund|Retry refund/u);
  assert.match(backend, /requireRole\(actor\.uid, \[USER_ROLES\.provider\]\)/u);
  assert.match(backend, /targetStage !== "preparation_started"/u);
  assert.match(backend, /assertRefundEligibilityUnlocked/u);
});
