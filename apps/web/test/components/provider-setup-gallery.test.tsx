import {readFileSync} from "node:fs";
import {join} from "node:path";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {BookingOfferSelection} from "@/components/customer/bookings/booking-offer-selection";
import {ProviderSetupGallery} from "@/components/customer/providers/provider-setup-gallery";
import {ProviderSetupGalleryManager} from "@/app/provider/packages/provider-setup-gallery-manager";
import {clearStaleSetupReference} from "@/lib/customer/bookings/booking-customization-selection";
import {loadProviderSetupGallery, readPublishedProviderSetups, saveProviderSetupGallery} from "@/lib/provider/provider-setup-gallery-service";
import {parseProviderSetups, publicProviderSetups, type ProviderSetup} from "@/lib/provider/provider-setup-gallery";

const actions = vi.hoisted(() => ({load: vi.fn(), save: vi.fn()}));
const state = vi.hoisted(() => {
  const records = new Map<string, Record<string, unknown>>();
  const set = vi.fn();
  const auth = vi.fn();
  function reference(path: string) {
    const ref = {
      path,
      collection: (name: string) => reference(`${path}/${name}`),
      doc: (id: string) => reference(`${path}/${id}`),
      get: async () => {
        const data = records.get(path);
        return {exists: data !== undefined, data: () => data, ref};
      },
    };
    return ref;
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
vi.mock("@/app/provider/packages/setup-gallery-actions", () => ({
  loadProviderSetupGalleryAction: actions.load,
  saveProviderSetupGalleryAction: actions.save,
}));
vi.mock("@/lib/provider/provider-media-client", () => ({
  uploadProviderServiceImage: vi.fn(async (id: string) => ({
    url: `https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/owner/services/${id}/image.png`,
    publicId: `feasta/providers/owner/services/${id}/image`,
  })),
}));

const ownerId = "owner";
function photo(assetId: string, owner = ownerId) {
  return `https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/${owner}/services/${assetId}/image.png`;
}
function setup(overrides: Partial<ProviderSetup> = {}): ProviderSetup {
  return {
    id: "setup_ref_01",
    title: "Garden reception",
    description: "Lanterns",
    eventType: "wedding",
    themeTags: ["Garden"],
    imageUrls: [photo("photo-1")],
    isPublished: true,
    ...overrides,
  };
}
const account = {uid: ownerId, providerId: "provider-one", provider: {id: "provider-one", providerServiceType: "catering", serviceCategories: ["catering_service"]}};
const provider = {ownerId, verificationStatus: "approved", publiclyVisible: true, isActive: true, providerServiceType: "catering", serviceCategories: ["catering_service"]};
const setupPath = "providers/provider-one/catalog/setups";

beforeEach(() => {
  state.records.clear(); state.set.mockReset(); state.auth.mockReset().mockResolvedValue(account); actions.load.mockReset(); actions.save.mockReset();
  state.records.set("providers/provider-one", {...provider});
  state.records.set("users/owner", {role: "provider", providerId: "provider-one", accountStatus: "active", isActive: true});
  state.records.set(setupPath, {revision: 1, setups: [setup()]});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("setup gallery data contract", () => {
  it("accepts a valid setup and preserves its stable id", () => {
    const parsed = parseProviderSetups([setup({title: "  Garden   reception "})], ownerId);
    expect(parsed).toEqual([setup({title: "Garden reception"})]);
    expect(parsed[0]?.id).toBe("setup_ref_01");
  });

  it("rejects malformed and duplicate setup ids", () => {
    expect(() => parseProviderSetups([setup({id: "bad id"})], ownerId)).toThrow(/identifier/i);
    expect(() => parseProviderSetups([setup({id: "x"})], ownerId)).toThrow(/identifier/i);
    expect(() => parseProviderSetups([setup(), setup({imageUrls: [photo("photo-2")]})], ownerId)).toThrow(/unique/i);
  });

  it("rejects malformed titles and descriptions", () => {
    expect(() => parseProviderSetups([setup({title: "   "})], ownerId)).toThrow(/title/i);
    expect(() => parseProviderSetups([setup({title: "a".repeat(81)})], ownerId)).toThrow(/title/i);
    expect(() => parseProviderSetups([setup({description: "a".repeat(601)})], ownerId)).toThrow(/description/i);
  });

  it("enforces setup and image bounds and rejects duplicate photos", () => {
    expect(() => parseProviderSetups(Array.from({length: 9}, (_, index) => setup({
      id: `setup_${index + 10}`, imageUrls: [photo(`photo-${index}`)],
    })), ownerId)).toThrow(/at most 8/i);
    expect(() => parseProviderSetups([setup({imageUrls: Array.from({length: 7}, (_, index) => photo(`photo-${index}`))})], ownerId)).toThrow(/at most 6/i);
    expect(() => parseProviderSetups([setup({imageUrls: [photo("photo-1"), photo("photo-1")]})], ownerId)).toThrow(/duplicate photo/i);
  });

  it("allows a missing description and style list", () => {
    const record = setup();
    delete (record as {description?: string}).description;
    delete (record as {themeTags?: string[]}).themeTags;
    expect(parseProviderSetups([record], ownerId)).toEqual([setup({description: "", themeTags: []})]);
    expect(parseProviderSetups(undefined, ownerId)).toEqual([]);
  });

  it("rejects arbitrary image URLs and financial fields", () => {
    expect(() => parseProviderSetups([setup({imageUrls: ["https://example.com/setup.png"]})], ownerId)).toThrow(/invalid photo/i);
    expect(() => parseProviderSetups([setup({imageUrls: [photo("photo-1").replace("https:", "http:")]})], ownerId)).toThrow(/invalid photo/i);
    expect(() => parseProviderSetups([setup({imageUrls: [photo("photo-1", "other")]})], ownerId)).toThrow(/invalid photo/i);
    expect(() => parseProviderSetups([{...setup(), price: 1500}], ownerId)).toThrow(/pricing/i);
    expect(Object.keys(parseProviderSetups([setup()], ownerId)[0] ?? {})).toEqual([
      "id", "title", "description", "eventType", "themeTags", "imageUrls", "isPublished",
    ]);
  });

  it("shows only published setups that have photos and hides an invalid gallery", () => {
    expect(publicProviderSetups([
      setup(),
      setup({id: "setup_draft", isPublished: false, imageUrls: []}),
    ], ownerId).map((item) => item.id)).toEqual(["setup_ref_01"]);
    expect(publicProviderSetups([
      setup(),
      setup({id: "setup_empty", imageUrls: [], isPublished: true}),
    ], ownerId)).toEqual([]);
    expect(publicProviderSetups({price: 1}, ownerId)).toEqual([]);
  });
});

describe("setup gallery server authorization", () => {
  it("loads an empty gallery when the provider has no setups", async () => {
    state.records.delete(setupPath);
    expect(await loadProviderSetupGallery()).toEqual({revision: 0, setups: []});
    expect(await readPublishedProviderSetups("provider-one")).toEqual([]);
  });

  it("rejects an unauthenticated provider and the wrong owner", async () => {
    state.auth.mockRejectedValueOnce(new Error("Sign in"));
    await expect(loadProviderSetupGallery()).rejects.toThrow("Sign in");
    state.records.set("providers/provider-one", {...provider, ownerId: "someone-else"});
    await expect(saveProviderSetupGallery({revision: 1, setups: [setup({isPublished: false})]})).rejects.toThrow(/cannot manage/);
    expect(state.set).not.toHaveBeenCalled();
  });

  it("rejects a non-catering provider and a stale revision", async () => {
    state.auth.mockResolvedValue({...account, provider: {...account.provider, providerServiceType: "addon", serviceCategories: ["photographer"]}});
    await expect(saveProviderSetupGallery({revision: 1, setups: []})).rejects.toThrow(/catering/);
    state.auth.mockResolvedValue(account);
    await expect(saveProviderSetupGallery({revision: 0, setups: []})).rejects.toThrow(/another session/);
    expect(state.set).not.toHaveBeenCalled();
  });

  it("verifies a new Cloudinary photo and rejects an arbitrary or unverified URL", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "feasta");
    vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
    const next = setup({id: "setup_ref_02", imageUrls: [photo("photo-2")], isPublished: false});
    const resource = {public_id: "feasta/providers/owner/services/photo-2/image", secure_url: photo("photo-2"), resource_type: "image", bytes: 512, format: "png"};
    const fetch = vi.fn().mockResolvedValue({ok: true, json: async () => resource});
    vi.stubGlobal("fetch", fetch);
    await saveProviderSetupGallery({revision: 1, setups: [setup(), next]});
    expect(fetch).toHaveBeenCalledOnce();
    const saved = state.set.mock.calls[0]?.[1] as {setups: ProviderSetup[]};
    expect(saved.setups[1]).not.toHaveProperty("price");
    expect(saved.setups.map((item) => item.id)).toEqual(["setup_ref_01", "setup_ref_02"]);
    state.set.mockClear();
    fetch.mockResolvedValue({ok: true, json: async () => ({...resource, secure_url: "https://example.com/other.png"})});
    await expect(saveProviderSetupGallery({revision: 1, setups: [next]})).rejects.toThrow(/invalid/i);
    await expect(saveProviderSetupGallery({revision: 1, setups: [setup({imageUrls: ["https://example.com/setup.png"]})]})).rejects.toThrow(/invalid photo/i);
    expect(state.set).not.toHaveBeenCalled();
  });

  it("returns only published setups for a public provider", async () => {
    state.records.set(setupPath, {revision: 2, setups: [setup(), setup({id: "setup_draft", isPublished: false})]});
    expect((await readPublishedProviderSetups("provider-one")).map((item) => item.id)).toEqual(["setup_ref_01"]);
    state.records.set("providers/provider-one", {...provider, publiclyVisible: false});
    expect(await readPublishedProviderSetups("provider-one")).toEqual([]);
  });
});

describe("provider setup gallery manager", () => {
  it("adds, edits, and removes a setup without changing its id", async () => {
    actions.load.mockResolvedValue({revision: 4, setups: []});
    actions.save.mockImplementation(async (input: {revision: number; setups: ProviderSetup[]}) => ({ok: true, gallery: {revision: input.revision + 1, setups: input.setups}}));
    const user = userEvent.setup();
    const view = render(<ProviderSetupGalleryManager />);
    expect(await screen.findByText(/No setups yet/i)).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Add setup"}));
    await user.type(screen.getByLabelText("Setup title"), "Garden reception");
    await user.selectOptions(screen.getByLabelText("Event type"), "wedding");
    await user.type(screen.getByLabelText("Description (optional)"), "Lanterns");
    await user.type(screen.getByLabelText("Styles (optional)"), "Garden, Lanterns");
    await user.upload(screen.getByLabelText("Setup photos"), new File(["photo"], "setup.png", {type: "image/png"}));
    expect(screen.getByText("1 of 6 images selected")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalled());
    const created = actions.save.mock.calls[0]?.[0] as {revision: number; setups: ProviderSetup[]};
    expect(created.revision).toBe(4);
    expect(created.setups[0]).toMatchObject({title: "Garden reception", description: "Lanterns", eventType: "wedding", themeTags: ["Garden", "Lanterns"], isPublished: false});
    expect(created.setups[0]?.imageUrls[0]).toContain("res.cloudinary.com");
    expect(created.setups[0]?.id).toMatch(/^[A-Za-z0-9_-]{2,80}$/u);
    expect(created.setups[0]).not.toHaveProperty("price");
    view.unmount();

    actions.load.mockResolvedValue({revision: 5, setups: [setup({isPublished: false})]});
    actions.save.mockClear();
    render(<ProviderSetupGalleryManager />);
    await user.click(await screen.findByRole("button", {name: "Edit Garden reception"}));
    const title = screen.getByLabelText("Setup title");
    await user.clear(title);
    await user.type(title, "Evening reception");
    await user.click(screen.getByRole("checkbox", {name: "Publish this setup"}));
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalled());
    const edited = actions.save.mock.calls[0]?.[0] as {setups: ProviderSetup[]};
    expect(edited.setups[0]).toMatchObject({id: "setup_ref_01", title: "Evening reception", isPublished: true, imageUrls: [photo("photo-1")]});

    actions.save.mockClear();
    await user.click(screen.getByRole("button", {name: "Remove Evening reception"}));
    await user.click(screen.getByRole("button", {name: "Remove setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith({revision: 6, setups: []}));
  });

  it("shows save validation and keeps an unpublished setup without a photo", async () => {
    actions.load.mockResolvedValue({revision: 1, setups: []});
    const user = userEvent.setup();
    render(<ProviderSetupGalleryManager />);
    await user.click(await screen.findByRole("button", {name: "Add setup"}));
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a setup title.");
    expect(actions.save).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Setup title"), "Garden reception");
    await user.selectOptions(screen.getByLabelText("Event type"), "wedding");
    await user.click(screen.getByRole("checkbox", {name: "Publish this setup"}));
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one photo");
    expect(screen.getByLabelText("Setup photos")).toBeInTheDocument();
  });
});

describe("customer setup gallery", () => {
  const published = setup();
  it("renders published inspiration and a missing-photo fallback without treating it as a price", () => {
    const visible = [
      ...publicProviderSetups([
        published,
        setup({id: "setup_draft", title: "Draft setup", isPublished: false, imageUrls: [photo("photo-2")]}),
      ], ownerId),
      setup({id: "setup_plain", description: "<script>alert(1)</script>", imageUrls: []}),
    ];
    const {container} = render(<ProviderSetupGallery setups={visible} />);
    expect(screen.getByRole("heading", {name: "Previous event setups"})).toBeVisible();
    expect(screen.getByText(/not a price quote/i)).toBeVisible();
    expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("No setup photos available.")).toBeVisible();
    expect(screen.queryByText("Draft setup")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty gallery", () => {
    const {container} = render(<ProviderSetupGallery setups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("selects a published setup locally and clears a stale reference", async () => {
    const onThemeInspirationChange = vi.fn();
    const user = userEvent.setup();
    const view = render(<BookingOfferSelection
      availableTiers={["buffet_setup"]}
      serviceOptions={{buffet_setup: {price: 1000, includedServices: []}}}
      themesApplicable
      hasThemeOptions
      serviceTier="buffet_setup"
      packageThemeId={null}
      availableThemes={[]}
      themeInspiration={{notes: "", referenceSetupId: "setup_missing"}}
      publishedSetups={[published]}
      error={null}
      onServiceTierChange={vi.fn()}
      onPackageThemeChange={vi.fn()}
      onThemeInspirationChange={onThemeInspirationChange}
    />);
    await waitFor(() => expect(onThemeInspirationChange).toHaveBeenCalledWith({notes: "", referenceSetupId: null}));
    expect(clearStaleSetupReference({notes: "Lanterns", referenceSetupId: "setup_missing"}, ["setup_ref_01"])).toEqual({notes: "Lanterns", referenceSetupId: null});
    view.rerender(<BookingOfferSelection
      availableTiers={["buffet_setup"]}
      serviceOptions={{buffet_setup: {price: 1000, includedServices: []}}}
      themesApplicable
      hasThemeOptions
      serviceTier="buffet_setup"
      packageThemeId={null}
      availableThemes={[]}
      themeInspiration={{notes: "Lanterns", referenceSetupId: null}}
      publishedSetups={[published]}
      error={null}
      onServiceTierChange={vi.fn()}
      onPackageThemeChange={vi.fn()}
      onThemeInspirationChange={onThemeInspirationChange}
    />);
    expect(screen.getByText(/does not change the package price/i)).toBeVisible();
    await user.click(screen.getByRole("radio", {name: /Garden reception/u}));
    expect(onThemeInspirationChange).toHaveBeenCalledWith({notes: "Lanterns", referenceSetupId: "setup_ref_01"});
  });
});

describe("setup gallery trust boundary", () => {
  it("does not send setup references through the trusted booking request", () => {
    const root = join(process.cwd(), "../..");
    const booking = readFileSync(join(root, "functions/src/bookings/submit-booking-request.ts"), "utf8");
    const offer = readFileSync(join(root, "functions/src/bookings/booking-package-offer.ts"), "utf8");
    expect(booking).not.toContain("referenceSetupId");
    expect(offer).not.toContain("referenceSetupId");
    expect(offer).not.toContain("catalog/setups");
    expect(readFileSync(join(process.cwd(), "src/lib/customer/bookings/customer-booking-submission-client.ts"), "utf8")).not.toContain("referenceSetupId");
  });
});
