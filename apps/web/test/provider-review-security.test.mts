import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("review detail and every private file route require trusted admin context", async () => {
  const [page, service, documentRoute, mediaRoute] = await Promise.all([
    source("app/admin/providers/page.tsx"),
    source("lib/admin/provider-verification/provider-verification-service.ts"),
    source(
      "app/api/admin/provider-verifications/[verificationId]/documents/" +
      "[documentId]/route.ts",
    ),
    source("app/api/admin/providers/[providerId]/media/[kind]/route.ts"),
  ]);
  assert.match(page, /await requireAdmin\(\)/u);
  assert.match(service, /getProviderVerificationReview[\s\S]*await requireAdmin\(\)/u);
  for (const route of [documentRoute, mediaRoute]) {
    assert.match(route, /getOptionalAccountContext\(\{checkRevoked: true\}\)/u);
    assert.match(route, /account\.role !== "admin"/u);
  }
});

test("sensitive evidence is streamed privately without exposing signed URLs", async () => {
  const [documentRoute, storage] = await Promise.all([
    source(
      "app/api/admin/provider-verifications/[verificationId]/documents/" +
      "[documentId]/route.ts",
    ),
    source(
      "lib/admin/provider-verification/secure-provider-file.ts",
    ),
  ]);
  assert.match(documentRoute, /document\.providerId !== providerId/u);
  assert.match(
    documentRoute,
    /providers\/\$\{providerId\}\/verification\/\$\{documentType\}\//u,
  );
  assert.match(documentRoute, /application\/pdf/u);
  assert.match(documentRoute, /maximumDocumentBytes = 10 \* 1024 \* 1024/u);
  assert.match(storage, /\.download\(\)/u);
  assert.match(storage, /private, no-store/u);
  assert.match(storage, /X-Content-Type-Options/u);
  assert.doesNotMatch(storage, /getSignedUrl/u);
});

test("browser decisions use only the protected callable workflow", async () => {
  const [client, panel] = await Promise.all([
    source(
      "lib/admin/provider-verification/provider-verification-client.ts",
    ),
    source(
      "components/admin/provider-verification/" +
      "provider-verification-review-panel.tsx",
    ),
  ]);
  assert.match(client, /httpsCallable/u);
  assert.match(client, /"reviewProviderVerification"/u);
  assert.match(client, /idempotencyKey/u);
  assert.match(panel, /start_review/u);
  assert.match(panel, /require_resubmission/u);
  assert.match(panel, /remarks\.trim\(\)\.length < 10/u);
  assert.match(panel, /ConfirmationDialog/u);
});

test("provider and admin history expose structured audit references safely", async () => {
  const [adminPanel, providerStatus, auditPage, service] = await Promise.all([
    source(
      "components/admin/provider-verification/" +
      "provider-verification-review-panel.tsx",
    ),
    source("app/provider/status/page.tsx"),
    source("app/admin/audit-logs/[auditLogId]/page.tsx"),
    source("lib/admin/provider-verification/provider-verification-service.ts"),
  ]);
  assert.match(adminPanel, /Verification history/u);
  assert.match(adminPanel, /\/admin\/audit-logs\//u);
  assert.match(providerStatus, /Verification timeline/u);
  assert.match(providerStatus, /FEASTA remarks/u);
  assert.match(auditPage, /await requireAdmin\(\)/u);
  assert.match(service, /collection\("history"\)/u);
  assert.match(service, /\.limit\(50\)/u);
});
