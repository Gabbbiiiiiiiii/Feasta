import {act, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ProviderSetupGalleryV2Manager} from "@/app/provider/packages/provider-setup-gallery-v2-manager";
import {ProviderSetupGalleryManager} from "@/app/provider/packages/provider-setup-gallery-manager";
import {galleryErrorHelp, replacementRequest, selectionError, setupProposal} from "@/lib/provider/provider-setup-gallery-editor";
import type {PrivateSetup, SetupProposal} from "@/lib/provider/provider-setup-gallery-editor";
import type {PrivateGalleryResult} from "@/lib/provider/provider-setup-gallery-private-service";
import type {PrivateSetupGalleryV2, SavePrivateSetupGalleryV2Request} from "@/lib/provider/provider-setup-gallery-v2-writer";
import {parseProviderSetups, type ProviderSetup} from "@/lib/provider/provider-setup-gallery";
import {resolveSetupGalleryV2, type ProviderSetupV2} from "@/lib/provider/provider-setup-gallery-v2";

const actions = vi.hoisted(() => ({load: vi.fn(), save: vi.fn(), legacyLoad: vi.fn(), legacySave: vi.fn(), upload: vi.fn()}));
vi.mock("@/app/provider/packages/setup-gallery-actions", () => ({
  loadPrivateProviderSetupGalleryV2Action: actions.load, savePrivateProviderSetupGalleryV2Action: actions.save,
  loadProviderSetupGalleryAction: actions.legacyLoad, saveProviderSetupGalleryAction: actions.legacySave,
}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: actions.upload}));
const photo = "https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/owner/services/photo_one/image.png";
const legacy: ProviderSetup = {
  id: "setup_legacy", title: "Classic reception", description: "Original", eventType: "wedding",
  themeTags: ["Garden"], imageUrls: [photo], isPublished: true, setupOccasionSchemaVersion: 1,
};
const v2: ProviderSetupV2 = {
  id: "setup_private", title: "Occasion draft", description: "Private notes", themeTags: [], imageUrls: [photo], isPublished: false,
  setupOccasionSchemaVersion: 2, eventType: "wedding", occasionScope: "specific", occasionIds: ["occasion_wedding"],
  occasionMatchIds: ["occasion_wedding"], occasionCatalogRevision: 4, providerEligibilityRevision: 3, occasionEligibilityState: "valid",
};
function gallery(canSave = false, setups: PrivateSetup[] = [legacy, v2]): PrivateSetupGalleryV2 {
  return {
    galleryWriteSchemaVersion: 2, revision: 7, setups: structuredClone(setups),
    authority: {
      catalogRevision: 4, providerEligibilityRevision: 3, catalogComplete: true,
      catalog: [
        {id: "occasion_wedding", active: true, moderationState: "approved", sortOrder: 1,
          applicableServiceCategoryCodes: ["catering"], setupGalleryLegacyEventType: "wedding"},
        {id: "occasion_corporate", active: true, moderationState: "approved", sortOrder: 2,
          applicableServiceCategoryCodes: ["catering"], setupGalleryLegacyEventType: "corporate"},
        {id: "occasion_inactive", active: false, moderationState: "approved", sortOrder: 3, applicableServiceCategoryCodes: ["catering"]},
        {id: "occasion_addon", active: true, moderationState: "approved", sortOrder: 4, applicableServiceCategoryCodes: ["photography"]},
      ],
      approvedCateringCategoryCodes: ["catering"], approvedOccasionIds: ["occasion_wedding"],
      maxSpecificOccasions: 2, maxCatalogRecords: 2000, maxEffectiveMatches: 1000,
    },
    availability: {canSave, canPublishV2: false, reason: canSave ? null : "Private Setup Gallery V2 saving is disabled."},
  };
}
function successfulSave(base: PrivateSetupGalleryV2) {
  actions.save.mockImplementation(async (request: SavePrivateSetupGalleryV2Request): Promise<PrivateGalleryResult> => ({
    ok: true, gallery: {...base, revision: request.revision + 1, setups: (request.setups as SetupProposal[]).map((proposal) =>
      proposal.setupOccasionSchemaVersion === 2 ? resolveSetupGalleryV2(proposal, "owner", base.authority) : parseProviderSetups([proposal], "owner")[0])},
  }));
}
beforeEach(() => {
  Object.values(actions).forEach((mock) => mock.mockReset());
  actions.load.mockResolvedValue({ok: true, gallery: gallery()});
  actions.legacyLoad.mockResolvedValue({revision: 2, setups: [legacy]});
  actions.upload.mockResolvedValue({url: photo, publicId: "feasta/providers/owner/services/photo_one/image"});
});
async function edit(user: ReturnType<typeof userEvent.setup>, title = "Occasion draft") {
  await user.click(await screen.findByRole("button", {name: `Edit ${title}`}));
}
describe("mixed gallery proposals", () => {
  it("whitelists V1/V2 records and copies only backend revisions", () => {
    const loaded = gallery();
    const request = replacementRequest(loaded, loaded.setups);
    expect(request).toEqual({
      galleryWriteSchemaVersion: 2, revision: 7, expectedCatalogRevision: 4, expectedProviderEligibilityRevision: 3,
      setups: [legacy, {id: v2.id, title: v2.title, description: v2.description, themeTags: [], imageUrls: [photo], isPublished: false,
        setupOccasionSchemaVersion: 2, occasionScope: "specific", occasionIds: ["occasion_wedding"]}],
    });
    expect(setupProposal({...v2, occasionEligibilityState: "review_required" as const})).toEqual((request.setups as SetupProposal[])[1]);
    expect(setupProposal({...legacy, setupOccasionSchemaVersion: undefined})).not.toHaveProperty("setupOccasionSchemaVersion");
  });
  it("validates specific and Fits All selections against complete capabilities", () => {
    const authority = gallery().authority;
    expect(selectionError("specific", ["occasion_wedding"], authority)).toBeNull();
    expect(selectionError("specific", [], authority)).toMatch(/Choose between/);
    for (const id of ["occasion_corporate", "occasion_inactive", "occasion_addon", "occasion_missing"]) {
      expect(selectionError("specific", [id], authority)).toMatch(/approval/);
    }
    expect(selectionError("all", [], authority)).toMatch(/approval/);
    expect(selectionError("all", [], {...authority, approvedOccasionIds: ["occasion_wedding", "occasion_corporate"]})).toBeNull();
    expect(selectionError("specific", ["occasion_wedding"], {...authority, catalogComplete: false})).toMatch(/complete/);
  });
});
describe("private occasion editor", () => {
  it("does not initialize editor state before successful load", async () => {
    let resolve!: (value: PrivateGalleryResult) => void;
    actions.load.mockReturnValue(new Promise<PrivateGalleryResult>((done) => { resolve = done; }));
    render(<ProviderSetupGalleryV2Manager />);
    expect(screen.getByRole("button", {name: "Add setup"})).toBeDisabled();
    expect(screen.getByText("Loading setup gallery…")).toBeVisible();
    expect(actions.save).not.toHaveBeenCalled();
    await act(async () => resolve({ok: true, gallery: gallery()}));
    expect(screen.getByRole("button", {name: "Add setup"})).toBeEnabled();
    expect(actions.load).toHaveBeenCalledWith({galleryWriteSchemaVersion: 2});
  });
  it("renders mixed and review-required data plus capabilities", async () => {
    actions.load.mockResolvedValue({ok: true, gallery: gallery(false, [legacy, {...v2, occasionEligibilityState: "review_required" as const}])});
    render(<ProviderSetupGalleryV2Manager />);
    expect(await screen.findByRole("article", {name: "Classic reception"})).toHaveTextContent("Wedding");
    expect(screen.getByRole("article", {name: "Occasion draft"})).toHaveTextContent("occasion_wedding");
    expect(screen.getByText("Occasion approval needs review")).toBeVisible();
    await userEvent.click(screen.getByText("Approved occasion capabilities"));
    expect(screen.getByText("Approved catering categories: catering")).toBeVisible();
  });
  it("blocks save, removal, publication and uploads when disabled", async () => {
    const user = userEvent.setup();
    render(<ProviderSetupGalleryV2Manager />);
    expect(await screen.findByRole("button", {name: "Remove Occasion draft"})).toBeDisabled();
    await edit(user);
    await user.type(screen.getByLabelText("Setup title"), " local");
    expect(screen.getByRole("button", {name: "Save setup"})).toBeDisabled();
    expect(screen.getByRole("checkbox", {name: "Publish this setup"})).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(actions.save).not.toHaveBeenCalled(); expect(actions.upload).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Setup title")).toHaveValue("Occasion draft local");
  });
  it.each(Object.keys(galleryErrorHelp) as (keyof typeof galleryErrorHelp)[])("handles typed load error %s", async (code) => {
    actions.load.mockResolvedValue({ok: false, code, error: "Safe backend message"});
    render(<ProviderSetupGalleryV2Manager />);
    expect(await screen.findByRole("alert")).toHaveTextContent(galleryErrorHelp[code]);
    expect(screen.getByRole("button", {name: "Add setup"})).toBeDisabled();
    expect(actions.legacyLoad).not.toHaveBeenCalled(); expect(actions.save).not.toHaveBeenCalled();
  });
  it("recovers from a transport failure without leaking details", async () => {
    actions.load.mockRejectedValueOnce(new Error("private credential details"));
    render(<ProviderSetupGalleryV2Manager />);
    expect(await screen.findByRole("alert")).not.toHaveTextContent("credential");
    await userEvent.click(screen.getByRole("button", {name: "Reload gallery and occasions"}));
    expect(await screen.findByRole("article", {name: "Occasion draft"})).toBeVisible();
  });
  it("saves a V2 edit with mocked success, retaining all other records and adopting revisions", async () => {
    const untouched = {...v2, id: "setup_retained", title: "Retained draft", occasionEligibilityState: "review_required" as const};
    const loaded = gallery(true, [legacy, v2, untouched]);
    actions.load.mockResolvedValue({ok: true, gallery: loaded}); successfulSave(loaded);
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user);
    await user.clear(screen.getByLabelText("Setup title")); await user.type(screen.getByLabelText("Setup title"), "Updated draft");
    expect(screen.getByRole("checkbox", {name: "Publish this setup"})).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(await screen.findByRole("article", {name: "Updated draft"})).toBeVisible();
    expect(actions.save.mock.calls[0][0]).toEqual(replacementRequest(loaded, [legacy, {...v2, title: "Updated draft"}, untouched]));
    expect(actions.upload).not.toHaveBeenCalled();
    await edit(user, "Updated draft"); await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(2));
    expect(actions.save.mock.calls[1][0].revision).toBe(8);
  });
  it("creates Fits All using an empty selection while retaining existing records", async () => {
    const loaded = gallery(true); loaded.authority.approvedOccasionIds = [...loaded.authority.approvedOccasionIds, "occasion_corporate"];
    actions.load.mockResolvedValue({ok: true, gallery: loaded}); successfulSave(loaded);
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />);
    await user.click(await screen.findByRole("button", {name: "Add setup"}));
    await user.type(screen.getByLabelText("Setup title"), "Fits every occasion");
    await user.selectOptions(screen.getByLabelText("Occasion scope"), "all");
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(await screen.findByRole("article", {name: "Fits every occasion"})).toBeVisible();
    expect(actions.save.mock.calls[0][0].setups).toEqual([setupProposal(legacy), setupProposal(v2),
      expect.objectContaining({occasionScope: "all", occasionIds: [], isPublished: false})]);
  });
  it("allows unsupported selections to be removed and rejects invalid saves", async () => {
    const loaded = gallery(true, [{...v2, occasionIds: ["occasion_missing"], occasionEligibilityState: "review_required" as const}]);
    actions.load.mockResolvedValue({ok: true, gallery: loaded}); successfulSave(loaded);
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user);
    expect(screen.getByRole("option", {name: "Fits All"})).toBeDisabled();
    expect(screen.getByRole("checkbox", {name: /occasion_corporate/})).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(screen.getByRole("alert")).toHaveTextContent("approval"); expect(actions.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", {name: /occasion_missing/}));
    await user.click(screen.getByRole("checkbox", {name: "occasion_wedding"}));
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalledOnce());
    expect(actions.save.mock.calls[0][0].setups[0].occasionIds).toEqual(["occasion_wedding"]);
  });
  it("edits V1 in mixed galleries without conversion or V2 loss", async () => {
    const loaded = gallery(true); actions.load.mockResolvedValue({ok: true, gallery: loaded}); successfulSave(loaded);
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user, "Classic reception");
    expect(screen.getByLabelText("Event type")).toHaveValue("wedding");
    expect(screen.getByRole("checkbox", {name: "Publish this setup"})).toBeEnabled();
    await user.selectOptions(screen.getByLabelText("Event type"), "birthday");
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalledOnce());
    expect(actions.save.mock.calls[0][0].setups).toEqual([{...legacy, eventType: "birthday"}, setupProposal(v2)]);
    expect(actions.legacySave).not.toHaveBeenCalled();
  });
  it("removes only the explicitly confirmed record", async () => {
    const loaded = gallery(true); actions.load.mockResolvedValue({ok: true, gallery: loaded}); successfulSave(loaded);
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />);
    await user.click(await screen.findByRole("button", {name: "Remove Classic reception"}));
    expect(actions.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", {name: "Remove setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(replacementRequest(loaded, [v2])));
    await waitFor(() => expect(screen.queryByRole("article", {name: "Classic reception"})).not.toBeInTheDocument());
  });
  it("preserves conflicting drafts and requires explicit reconciliation with refreshed records and all revisions", async () => {
    const loaded = gallery(true); actions.load.mockResolvedValueOnce({ok: true, gallery: loaded});
    actions.save.mockResolvedValueOnce({ok: false, code: "CONFLICT", error: "The gallery changed."});
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user);
    await user.type(screen.getByLabelText("Setup title"), " local");
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload");
    expect(screen.getByLabelText("Setup title")).toHaveValue("Occasion draft local");
    expect(screen.getByRole("button", {name: "Save setup"})).toBeDisabled();
    const remote = {...legacy, id: "setup_new", title: "Added remotely"};
    const latest = gallery(true, [legacy, {...v2, description: "Remote edit"}, remote]);
    latest.revision = 11; latest.authority.catalogRevision = 9; latest.authority.providerEligibilityRevision = 6;
    actions.load.mockResolvedValueOnce({ok: true, gallery: latest});
    await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Reload gallery and occasions"}));
    const reconcile = await screen.findByRole("button", {name: "Keep draft with reloaded gallery"});
    expect(screen.getByRole("button", {name: "Save setup"})).toBeDisabled(); expect(actions.save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Setup title")).toHaveValue("Occasion draft local");
    await user.click(reconcile); successfulSave(latest); await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(2));
    expect(actions.save.mock.calls[1][0]).toEqual(replacementRequest(latest, [legacy, {...v2, title: "Occasion draft local"}, remote]));
  });
  it.each(["INVALID_SELECTION", "UNAVAILABLE", "FORBIDDEN", "INVALID_REQUEST", "IMAGE_VERIFICATION", "INTERNAL"] as const)(
    "preserves drafts and handles save code %s", async (code) => {
      actions.load.mockResolvedValue({ok: true, gallery: gallery(true)});
      actions.save.mockResolvedValue({ok: false, code, error: "Safe save failure"});
      const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user);
      await user.type(screen.getByLabelText("Description (optional)"), " local");
      await user.click(screen.getByRole("button", {name: "Save setup"}));
      expect(await screen.findByRole("alert")).toHaveTextContent(galleryErrorHelp[code]);
      expect(screen.getByLabelText("Description (optional)")).toHaveValue("Private notes local");
      if (["IMAGE_VERIFICATION", "INTERNAL"].includes(code)) expect(screen.getByRole("button", {name: "Save setup"})).toBeEnabled();
      else expect(screen.getByRole("button", {name: "Save setup"})).toBeDisabled();
      expect(actions.save).toHaveBeenCalledOnce();
    });
  it("adopts disabled availability returned after mocked success", async () => {
    actions.load.mockResolvedValue({ok: true, gallery: gallery(true)});
    actions.save.mockResolvedValue({ok: true, gallery: {...gallery(false), revision: 20}});
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user);
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await edit(user); expect(screen.getByRole("button", {name: "Save setup"})).toBeDisabled();
  });
  it("keeps classic V1 editing as an explicit option", async () => {
    const user = userEvent.setup(); render(<ProviderSetupGalleryManager />);
    expect(await screen.findByRole("article", {name: "Occasion draft"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Classic gallery"}));
    expect(await screen.findByRole("article", {name: "Classic reception"})).toBeVisible();
    expect(screen.queryByRole("article", {name: "Occasion draft"})).not.toBeInTheDocument();
    expect(actions.legacyLoad).toHaveBeenCalledOnce();
  });
  it("does not expose classic saving to providers awaiting review", async () => {
    render(<ProviderSetupGalleryManager allowLegacy={false} />);
    expect(await screen.findByRole("article", {name: "Occasion draft"})).toBeVisible();
    expect(screen.queryByRole("button", {name: "Classic gallery"})).not.toBeInTheDocument();
    expect(actions.legacyLoad).not.toHaveBeenCalled();
  });
});

describe("editor recovery boundaries", () => {
  it("preserves a conflicting draft through a failed reload and allows explicit discard after recovery", async () => {
    actions.load.mockResolvedValueOnce({ok: true, gallery: gallery(true)})
      .mockResolvedValueOnce({ok: false, code: "UNAVAILABLE", error: "Authority unavailable"})
      .mockResolvedValueOnce({ok: true, gallery: gallery(true)});
    actions.save.mockResolvedValueOnce({ok: false, code: "CONFLICT", error: "Changed"});
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user);
    await user.type(screen.getByLabelText("Setup title"), " unsaved");
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    await screen.findByRole("alert");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Reload gallery and occasions"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Authority unavailable");
    expect(screen.getByLabelText("Setup title")).toHaveValue("Occasion draft unsaved");
    expect(screen.getByRole("button", {name: "Save setup"})).toBeDisabled();
    expect(screen.queryByRole("button", {name: "Keep draft with reloaded gallery"})).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Reload gallery and occasions"}));
    await screen.findByRole("button", {name: "Keep draft with reloaded gallery"});
    expect(screen.getByText("Latest saved version of this setup")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Discard local draft"}));
    await edit(user);
    expect(screen.getByLabelText("Setup title")).toHaveValue("Occasion draft");
    expect(screen.getByRole("button", {name: "Save setup"})).toBeEnabled();
    expect(actions.save).toHaveBeenCalledOnce();
  });

  it("uses all three revisions from a successful save response on the next proposal", async () => {
    const loaded = gallery(true), saved = gallery(true);
    saved.revision = 25; saved.authority.catalogRevision = 15; saved.authority.providerEligibilityRevision = 18;
    actions.load.mockResolvedValue({ok: true, gallery: loaded});
    actions.save.mockResolvedValue({ok: true, gallery: saved});
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user);
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await edit(user); await user.click(screen.getByRole("button", {name: "Save setup"}));
    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(2));
    expect(actions.save.mock.calls[1][0]).toMatchObject({
      revision: 25, expectedCatalogRevision: 15, expectedProviderEligibilityRevision: 18,
    });
  });

  it("keeps records intact on a deletion conflict and blocks repeated confirmation", async () => {
    actions.load.mockResolvedValue({ok: true, gallery: gallery(true)});
    actions.save.mockResolvedValue({ok: false, code: "CONFLICT", error: "Gallery changed"});
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />);
    await user.click(await screen.findByRole("button", {name: "Remove Classic reception"}));
    await user.click(screen.getByRole("button", {name: "Remove setup"}));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Reload");
    expect(screen.getByRole("button", {name: "Remove setup"})).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Cancel"}));
    expect(screen.getByRole("article", {name: "Classic reception"})).toBeVisible();
    expect(screen.getByRole("article", {name: "Occasion draft"})).toBeVisible();
    expect(actions.save).toHaveBeenCalledOnce();
  });

  it("does not submit retained V2 publication or upload photos while publication is blocked", async () => {
    actions.load.mockResolvedValue({ok: true, gallery: gallery(true, [legacy, {...v2, isPublished: true}])});
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />); await edit(user, "Classic reception");
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(screen.getByRole("alert")).toHaveTextContent("V2 publication is unavailable");
    expect(actions.save).not.toHaveBeenCalled(); expect(actions.upload).not.toHaveBeenCalled();
  });

  it("creates a specific private draft and uploads only during a mocked permitted save", async () => {
    const loaded = gallery(true); actions.load.mockResolvedValue({ok: true, gallery: loaded}); successfulSave(loaded);
    const user = userEvent.setup(); render(<ProviderSetupGalleryV2Manager />);
    await user.click(await screen.findByRole("button", {name: "Add setup"}));
    await user.type(screen.getByLabelText("Setup title"), "New occasion setup");
    await user.click(screen.getByRole("checkbox", {name: "occasion_wedding"}));
    await user.upload(screen.getByLabelText("Setup photos"), new File(["photo"], "setup.png", {type: "image/png"}));
    expect(actions.upload).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", {name: "Save setup"}));
    expect(await screen.findByRole("article", {name: "New occasion setup"})).toBeVisible();
    expect(actions.upload).toHaveBeenCalledOnce();
    expect(actions.save.mock.calls[0][0].setups[2]).toMatchObject({
      setupOccasionSchemaVersion: 2, occasionScope: "specific", occasionIds: ["occasion_wedding"], imageUrls: [photo], isPublished: false,
    });
  });
});
