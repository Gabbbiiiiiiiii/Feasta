import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("refund disclosures use the trusted callable without browser Firestore policy reads", async () => {
  const client = await source(
    "lib/customer/bookings/customer-refund-policy-client.ts",
  );
  assert.match(client, /getBookingRefundPolicyDisclosures/u);
  assert.match(client, /httpsCallable/u);
  assert.match(client, /initializeBrowserAppCheck\(\)/u);
  assert.doesNotMatch(
    client,
    /firebase\/firestore|collection\(|getDoc\(|getDocs\(|onSnapshot\(|setDoc\(|updateDoc\(/u,
  );
});

test("trusted disclosures are normalized to exact stages and unique Providers", async () => {
  const client = await source(
    "lib/customer/bookings/customer-refund-policy-client.ts",
  );
  assert.match(client, /REFUND_ELIGIBILITY_STAGES/u);
  assert.match(client, /value\.length !== REFUND_ELIGIBILITY_STAGES\.length/u);
  assert.match(client, /seenProviders\.has\(providerId\)/u);
  assert.match(client, /sourceKind !== "provider_default"/u);
  assert.match(client, /sourceKind !== "package_override"/u);
  assert.doesNotMatch(client, /effectiveAt|actorUid|ownerId/u);
});

test("booking submission sends acknowledgements without client-authored policy authority", async () => {
  const [submission, experience] = await Promise.all([
    source("lib/customer/bookings/customer-booking-submission-client.ts"),
    source("components/customer/bookings/event-customization-experience.tsx"),
  ]);
  assert.match(submission, /policyAcknowledgements:/u);
  assert.match(experience, /buildRefundPolicyAcknowledgements/u);
  assert.match(experience, /effectivePolicyKey/u);
  assert.doesNotMatch(
    experience.slice(
      experience.indexOf("function buildSubmissionInput"),
      experience.indexOf("function currentSubmissionDraftKey"),
    ),
    /refundPolicySnapshot|refundPolicyAgreement|refundBasisPoints|policyVersion|effectiveAt/u,
  );
});

test("stale policies refresh disclosures and clear all prior acknowledgements", async () => {
  const [submission, experience] = await Promise.all([
    source("lib/customer/bookings/customer-booking-submission-client.ts"),
    source("components/customer/bookings/event-customization-experience.tsx"),
  ]);
  assert.match(submission, /REFUND_POLICY_CHANGED/u);
  assert.match(submission, /bookingSubmissionRequiresRefundPolicyRefresh/u);
  assert.match(experience, /setAcknowledgedPolicyKeys\(\{\}\)/u);
  assert.match(experience, /await loadRefundPolicyDisclosures\(message\)/u);
  assert.match(experience, /acknowledge it again before submitting/u);
});

test("booking review adds disclosure only and does not add cancellation controls", async () => {
  const experience = await source(
    "components/customer/bookings/event-customization-experience.tsx",
  );
  assert.match(experience, /Refund Policy/u);
  assert.match(experience, /later Provider policy changes will not alter this existing booking/u);
  assert.doesNotMatch(experience, />\s*(?:Cancel Booking|Request Refund)\s*</u);
});
