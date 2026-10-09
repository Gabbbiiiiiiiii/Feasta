import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("review detail and private verification documents require trusted admin context", async () => {
  const [page, service, documentRoute] = await Promise.all([
    source("app/admin/providers/page.tsx"),
    source("lib/admin/provider-verification/provider-verification-service.ts"),
    source(
      "app/api/admin/provider-verifications/[verificationId]/documents/" +
      "[documentId]/route.ts",
    ),
  ]);
  assert.match(page, /await requireAdmin\(\)/u);
  assert.match(service, /getProviderVerificationReview[\s\S]*await requireAdmin\(\)/u);
  assert.match(documentRoute, /getOptionalAccountContext\(\{checkRevoked: true\}\)/u);
  assert.match(documentRoute, /account\.role !== "admin"/u);
  await assert.rejects(
    access(new URL(
      "app/api/admin/providers/[providerId]/media/[kind]/route.ts",
      sourceRoot,
    )),
  );
  assert.match(service, /cloudinaryProviderImageUrl/u);
  assert.match(service, /parsed\.hostname !==\s*"res\.cloudinary\.com"/u);
  assert.match(service, /publicId !== expectedPublicId/u);
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
