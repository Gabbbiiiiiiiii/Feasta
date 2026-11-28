import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(
  new URL("../src/app/provider/refund-policy/page.tsx", import.meta.url),
  "utf8",
);
const serviceSource = await readFile(
  new URL("../src/lib/provider/refund-policy/provider-refund-policy-service.ts", import.meta.url),
  "utf8",
);
const clientSource = await readFile(
  new URL("../src/lib/provider/refund-policy/provider-refund-policy-client.ts", import.meta.url),
  "utf8",
);

test("refund policy route is protected by the approved Provider server loader", () => {
  assert.match(pageSource, /getProviderRefundPolicyPage/u);
  assert.match(serviceSource, /requireApprovedProvider/u);
});

test("refund policy data is loaded as one provider read and one platform default read", () => {
  assert.match(serviceSource, /Promise\.all/u);
  assert.match(serviceSource, /adminDb\.collection\("providers"\)\.doc\(providerId\)\.get\(\)/u);
  assert.match(serviceSource, /getAdminDefaultCancellationPolicy/u);
  assert.doesNotMatch(serviceSource, /ownerId:/u);
});

test("browser mutations use only trusted callables and safe input fields", () => {
  assert.match(clientSource, /publishProviderRefundPolicy/u);
  assert.match(clientSource, /saveProviderCancellationPolicy/u);
  assert.doesNotMatch(clientSource, /setDoc|updateDoc|addDoc|collection\(db/u);
  assert.doesNotMatch(
    clientSource,
    /\b(?:providerId|ownerId|policyVersion|effectiveAt|actorUid)\s*:/u,
  );
});
