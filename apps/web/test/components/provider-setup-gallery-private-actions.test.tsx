import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({load: vi.fn(), save: vi.fn(), revalidate: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({revalidatePath: mocks.revalidate}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: vi.fn()}));
vi.mock("@/lib/provider/provider-setup-gallery-service", () => ({
  loadProviderSetupGallery: vi.fn(), saveProviderSetupGallery: vi.fn(),
}));
vi.mock("@/lib/provider/provider-setup-gallery-v2-writer", () => ({
  loadPrivateProviderSetupGalleryV2: mocks.load,
  savePrivateProviderSetupGalleryV2: mocks.save,
}));

import {loadPrivateProviderSetupGalleryV2Action, savePrivateProviderSetupGalleryV2Action}
  from "@/app/provider/packages/setup-gallery-actions";

const request = {galleryWriteSchemaVersion: 2 as const, revision: 7,
  expectedCatalogRevision: 4, expectedProviderEligibilityRevision: 3, setups: []};

describe("private gallery action contract", () => {
  beforeEach(() => vi.clearAllMocks());
  it("loads the private response without revalidation", async () => {
    const gallery = {revision: 7, setups: [], availability: {canSave: false}};
    mocks.load.mockResolvedValue(gallery);
    expect(await loadPrivateProviderSetupGalleryV2Action({galleryWriteSchemaVersion: 2}))
      .toEqual({ok: true, gallery});
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("delegates saves and revalidates only provider packages on success", async () => {
    const gallery = {revision: 8, setups: []};
    mocks.save.mockResolvedValue(gallery);
    expect(await savePrivateProviderSetupGalleryV2Action(request)).toEqual({ok: true, gallery});
    expect(mocks.save).toHaveBeenCalledWith(request);
    expect(mocks.revalidate.mock.calls).toEqual([["/provider/packages"]]);
  });
  it.each([
    ["NEXT_REDIRECT", "FORBIDDEN"],
    ["Invalid private gallery request.", "INVALID_REQUEST"],
    ["Setup Gallery V2 authority unavailable.", "UNAVAILABLE"],
    ["Setup Gallery V2 authority changed. Reload before saving.", "CONFLICT"],
    ["Setup occasion eligibility requires review.", "INVALID_SELECTION"],
    ["The setup image could not be verified.", "IMAGE_VERIFICATION"],
    ["Private Setup Gallery V2 saving is disabled.", "UNAVAILABLE"],
    ["secret backend path and credentials", "INTERNAL"],
  ])("returns safe typed errors for %s", async (message, code) => {
    mocks.save.mockRejectedValue(new Error(message));
    const result = await savePrivateProviderSetupGalleryV2Action(request);
    expect(result).toMatchObject({ok: false, code});
    expect(JSON.stringify(result)).not.toContain("secret backend");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
