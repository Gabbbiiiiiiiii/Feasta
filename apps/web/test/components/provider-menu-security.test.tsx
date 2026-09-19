import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {loadProviderMenu, saveProviderMenu} from "@/lib/provider/provider-menu-service";

const state = vi.hoisted(() => {
  const records = new Map<string, Record<string, unknown>>();
  const set = vi.fn();
  const auth = vi.fn();
  function reference(path: string) {
    return {
      path,
      collection: (name: string) => reference(`${path}/${name}`),
      doc: (id: string) => reference(`${path}/${id}`),
      get: async () => ({data: () => records.get(path)}),
    };
  }
  return {records, set, auth, db: {
    collection: (name: string) => reference(name),
    runTransaction: async (callback: (transaction: unknown) => Promise<void>) => callback({
      get: async (ref: ReturnType<typeof reference>) => ref.get(), set,
    }),
  }};
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: state.db}));
vi.mock("@/lib/auth/session", () => ({requireApprovedProvider: state.auth}));

const image = {id: "poster", title: "Chicken", isPublished: true,
  url: "https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/owner/services/poster/image.png"};
const account = {uid: "owner", provider: {id: "provider-one", providerServiceType: "catering", serviceCategories: ["catering_service"]}};
const provider = {ownerId: "owner", verificationStatus: "approved", publiclyVisible: true, isActive: true,
  providerServiceType: "catering", serviceCategories: ["catering_service"]};
const menuPath = "providers/provider-one/catalog/menu";

beforeEach(() => {
  state.records.clear(); state.set.mockReset(); state.auth.mockReset().mockResolvedValue(account);
  state.records.set("providers/provider-one", {...provider});
  state.records.set("users/owner", {role: "provider", providerId: "provider-one", accountStatus: "active", isActive: true});
  state.records.set(menuPath, {revision: 1, images: [image]});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("provider menu server authorization", () => {
  it.each(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"])("rejects new menu media when %s is unavailable", async (missing) => {
    for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) vi.stubEnv(key, key === missing ? "" : "test-value");
    state.records.set(menuPath, {revision: 1, images: []});
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(saveProviderMenu({revision: 1, images: [image]})).rejects.toThrow("Menu image verification is not configured");
    expect(fetch).not.toHaveBeenCalled();
    expect(state.set).not.toHaveBeenCalled();
  });
  it("derives read and write ownership from the authenticated account", async () => {
    expect(await loadProviderMenu()).toEqual({revision: 1, images: [image]});
    await saveProviderMenu({revision: 1, images: [{...image, title: "Updated", isPublished: false}]});
    expect(state.set).toHaveBeenCalledWith(expect.objectContaining({path: menuPath}), expect.objectContaining({
      providerId: "provider-one", revision: 2, images: [{...image, title: "Updated", isPublished: false}],
    }));
  });

  it("requires an approved session and canonical catering capability", async () => {
    state.auth.mockRejectedValueOnce(new Error("Sign in"));
    await expect(loadProviderMenu()).rejects.toThrow("Sign in");
    state.auth.mockResolvedValue({...account, provider: {...account.provider, providerServiceType: "addon", serviceCategories: ["photographer"]}});
    await expect(saveProviderMenu({revision: 1, images: []})).rejects.toThrow(/catering/);
    expect(state.set).not.toHaveBeenCalled();
  });

  it.each([
    {ownerId: "someone-else"}, {verificationStatus: "pending"}, {isActive: false},
    {isSuspended: true}, {isDeleted: true}, {providerServiceType: "addon", serviceCategories: ["event_coordinator"]},
  ])("rechecks current provider authorization in the transaction: %j", async (change) => {
    state.records.set("providers/provider-one", {...provider, ...change});
    await expect(saveProviderMenu({revision: 1, images: [image]})).rejects.toThrow(/cannot manage/);
    expect(state.set).not.toHaveBeenCalled();
  });

  it("rejects blocked owners, non-public publication and stale edits", async () => {
    state.records.set("users/owner", {role: "provider", providerId: "provider-one", accountStatus: "active", isBlocked: true});
    await expect(saveProviderMenu({revision: 1, images: []})).rejects.toThrow(/cannot manage/);
    state.records.set("users/owner", {role: "provider", providerId: "provider-one", accountStatus: "active"});
    state.records.set("providers/provider-one", {...provider, publiclyVisible: false});
    await expect(saveProviderMenu({revision: 1, images: [image]})).rejects.toThrow(/public providers/);
    await expect(saveProviderMenu({revision: 0, images: []})).rejects.toThrow(/another session/);
    expect(state.set).not.toHaveBeenCalled();
  });

  it("rejects other-owner assets before accessing Cloudinary", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(saveProviderMenu({revision: 1, images: [{...image, url: image.url.replace("/owner/", "/other/")}]})).rejects.toThrow(/Invalid menu/);
    expect(fetch).not.toHaveBeenCalled(); expect(state.set).not.toHaveBeenCalled();
  });

  it("verifies new assets against Cloudinary metadata, including size and exact URL", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "feasta"); vi.stubEnv("CLOUDINARY_API_KEY", "test-key"); vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
    state.records.set(menuPath, {revision: 1, images: []});
    const resource = {public_id: "feasta/providers/owner/services/poster/image", secure_url: image.url,
      resource_type: "image", bytes: 512, format: "png"};
    const fetch = vi.fn().mockResolvedValue({ok: true, json: async () => resource}); vi.stubGlobal("fetch", fetch);
    await saveProviderMenu({revision: 1, images: [image]});
    expect(fetch).toHaveBeenCalledOnce(); expect(state.set).toHaveBeenCalledOnce();
    state.set.mockClear();
    for (const invalid of [{bytes: 6 * 1024 * 1024}, {format: "svg"}, {secure_url: "https://example.test/other.png"}]) {
      fetch.mockResolvedValue({ok: true, json: async () => ({...resource, ...invalid})});
      await expect(saveProviderMenu({revision: 1, images: [image]})).rejects.toThrow(/invalid/);
    }
    expect(state.set).not.toHaveBeenCalled();
  });
});
