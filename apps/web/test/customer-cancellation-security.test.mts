import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const webSourceRoot = new URL("../src/", import.meta.url);
const functionsSourceRoot = new URL("../../../functions/src/", import.meta.url);
const webSource = (path: string) => readFile(new URL(path, webSourceRoot), "utf8");
const functionSource = (path: string) => readFile(
  new URL(path, functionsSourceRoot),
  "utf8",
);

test("Customer cancellation uses only trusted callable boundaries", async () => {
  const client = await webSource(
    "lib/customer/bookings/customer-cancellation-client.ts",
  );

  assert.match(client, /getProviderRequestCancellationOptions/u);
  assert.match(client, /getProviderRequestCancellationStatus/u);
  assert.match(client, /submitProviderRequestCancellation/u);
  assert.match(client, /httpsCallable/u);
  assert.match(client, /initializeBrowserAppCheck\(\)/u);
  assert.doesNotMatch(
    client,
    /firebase\/firestore|collection\(|doc\(|getDoc\(|getDocs\(|onSnapshot\(|setDoc\(|addDoc\(|updateDoc\(|writeBatch\(/u,
  );
  assert.doesNotMatch(client, /paymongo|checkoutUrl|gatewayId|gatewayResource/iu);
});

test("Customer refund status UI has no browser financial authority or raw document reads", async () => {
  const [statusComponent, presentation] = await Promise.all([
    webSource(
      "components/customer/bookings/customer-booking-cancellation-status.tsx",
    ),
    webSource(
      "lib/customer/bookings/customer-cancellation-presentation.ts",
    ),
  ]);
  const source = `${statusComponent}\n${presentation}`;

  assert.match(source, /getCustomerProviderRequestCancellationStatus/u);
  assert.match(source, /This Provider service only/u);
  assert.doesNotMatch(
    source,
    /firebase\/firestore|collection\(|doc\(|getDoc\(|getDocs\(|onSnapshot\(|setDoc\(|addDoc\(|updateDoc\(|writeBatch\(/u,
  );
  assert.doesNotMatch(source, /paymongo|gatewayPaymentId|refundOperationId/iu);
  assert.doesNotMatch(
    source,
    /httpsCallable|refundAmount\s*:|refundPercentage\s*:|policyRules\s*:|eligibilityStage\s*:/u,
  );
  assert.doesNotMatch(
    presentation,
    /amountInCentavos\s*\*|completedAmountInCentavos\s*\*|refundBasisPoints/u,
  );
});

test("submission payload contains only request, reason, and idempotency authority", async () => {
  const client = await webSource(
    "lib/customer/bookings/customer-cancellation-client.ts",
  );
  const submitStart = client.indexOf(
    "export async function submitCustomerProviderRequestCancellation",
  );
  const submitEnd = client.indexOf(
    "export function createCustomerCancellationIdempotencyKey",
  );
  const submit = client.slice(submitStart, submitEnd);

  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  assert.match(
    submit,
    /cancellationCallable\(SUBMIT_FUNCTION\)\(\{\s*providerRequestId,\s*reason,\s*idempotencyKey,\s*\}\)/u,
  );
  assert.doesNotMatch(
    submit,
    /customerId\s*:|providerId\s*:|mainEventId\s*:|paymentId\s*:|refundAmount\s*:|refundPercentage\s*:|eligibilityStage\s*:|policySnapshot\s*:|policyRules\s*:|actorUid\s*:/u,
  );
});

test("browser eligibility follows preflight and targets one canonical Provider request", async () => {
  const [detail, dialog] = await Promise.all([
    webSource("components/customer/bookings/customer-booking-detail-content.tsx"),
    webSource("components/customer/bookings/customer-booking-cancellation-dialog.tsx"),
  ]);

  const cancellationAction = detail.slice(
    detail.indexOf("function cancellationActionForRequest"),
    detail.indexOf("function reviewActionForRequest"),
  );
  assert.match(cancellationAction, /request\.providerRequestId/u);
  assert.match(cancellationAction, /request\.mainEventId !== bookingId/u);
  assert.doesNotMatch(
    cancellationAction,
    /request\.status\s*===|mainEvent\.status|booking\.status/u,
  );
  assert.match(dialog, /options\?\.cancellationAllowed/u);
  assert.match(dialog, /options\.activeCancellation/u);
  assert.match(dialog, /Other Provider services in this event are not automatically cancelled/u);
  assert.doesNotMatch(dialog, /Cancel booking|Cancel event|whole event/iu);
});

test("legacy and invalid evidence remain fail-closed without fabricated financials", async () => {
  const [client, dialog] = await Promise.all([
    webSource("lib/customer/bookings/customer-cancellation-client.ts"),
    webSource("components/customer/bookings/customer-booking-cancellation-dialog.tsx"),
  ]);

  assert.match(client, /REFUND_POLICY_EVIDENCE_INVALID/u);
  assert.match(client, /CANCELLATION_POLICY_EVIDENCE_INVALID/u);
  assert.match(dialog, /Manual review required/u);
  assert.match(dialog, /No refund percentage or estimate is available/u);
  assert.doesNotMatch(dialog, /request\.amount\s*\*|payment\s*\*|refundAmountInCentavos\s*=/u);
  assert.doesNotMatch(dialog, /Requested refund amount|Desired refund|Partial refund amount/u);
});

test("backend revalidates Customer ownership and exact callable inputs", async () => {
  const [preflight, submit] = await Promise.all([
    functionSource("cancellations/get-provider-request-cancellation.ts"),
    functionSource("cancellations/submit-provider-request-cancellation.ts"),
  ]);

  for (const source of [preflight, submit]) {
    assert.match(source, /requireAuth\(request\)/u);
    assert.match(source, /requireRole/u);
    assert.match(source, /canonicalRequestLinkageReason/u);
    assert.match(source, /canonicalPaymentLinkageReason/u);
  }
  assert.match(preflight, /const INPUT_FIELDS = new Set\(\["providerRequestId"\]\)/u);
  assert.match(submit, /"providerRequestId",\s*"reason",\s*"idempotencyKey"/u);
  assert.match(submit, /existing\.customerId !== input\.actorUid/u);
  assert.match(submit, /providerRequestId: input\.providerRequestId/u);
});
