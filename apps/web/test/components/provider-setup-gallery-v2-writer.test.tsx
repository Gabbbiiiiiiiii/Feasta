import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({account: vi.fn(), collection: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: mocks.account}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {collection: mocks.collection}}));

import {savePrivateProviderSetupGalleryV2} from
  "@/lib/provider/provider-setup-gallery-v2-writer";

const writer = readFileSync(join(process.cwd(),
  "src/lib/provider/provider-setup-gallery-v2-writer.ts"), "utf8");
const v1 = readFileSync(join(process.cwd(),
  "src/lib/provider/provider-setup-gallery-service.ts"), "utf8");
const actions = readFileSync(join(process.cwd(),
  "src/app/provider/packages/setup-gallery-actions.ts"), "utf8");

describe("Setup Gallery V2 transactional writer isolation", () => {
  it("fails closed before authentication or Firebase calls", async () => {
    mocks.account.mockClear();
    mocks.collection.mockClear();
    await expect(savePrivateProviderSetupGalleryV2({galleryWriteSchemaVersion: 2,
      revision: 1, expectedCatalogRevision: 1,
      expectedProviderEligibilityRevision: 1, setups: []})).rejects.toThrow(/disabled/i);
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("keeps V1 saving independent and rejects V2 in its action", () => {
    expect(v1).toContain("input.galleryWriteSchemaVersion === 2");
    expect(v1).toMatch(/Private Setup Gallery V2 writes are disabled/u);
    expect(actions).toContain("loadPrivateProviderSetupGalleryV2Action");
    expect(actions).toContain("savePrivateProviderSetupGalleryV2Action");
  });

  it("does not accept caller-supplied revisions or complete-catalog evidence", () => {
    expect(writer).toContain("exactRequest(rawInput)");
    expect(writer).toContain("tx.get(eligibilityRef)");
    expect(writer).toContain("tx.get(catalogRef)");
    expect(writer).toContain("tx.get(policyRef)");
    expect(writer).toContain("tx.get(query)");
    expect(writer).toContain("if (!complete)");
    expect(writer).toContain("tx.get(adminDb.collection(\"serviceCategories\")");
  });

  it("keeps two independent release guards disabled", () => {
    expect(writer).toContain("PRIVATE_V2_WRITER_COVERAGE_VERIFIED = false");
    expect(writer).toContain("MIXED_GALLERY_PUBLIC_V1_COMPATIBILITY_VERIFIED = false");
    expect(writer).toContain("tx.set(galleryRef,");
  });
});
