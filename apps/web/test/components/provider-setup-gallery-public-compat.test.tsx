import {describe, expect, it} from "vitest";
import {publicLegacyProviderSetupsFromMixed} from
  "@/lib/provider/provider-setup-gallery-public-compat";

const owner = "owner";
const photo = "https://res.cloudinary.com/feasta/image/upload/v1/" +
  "feasta/providers/owner/services/photo-1/image.png";
const legacy = {
  id: "setup_legacy_01", title: "Garden reception", description: "",
  eventType: "wedding", themeTags: ["Garden"], imageUrls: [photo],
  isPublished: true,
};
const v2 = {
  ...legacy, id: "setup_v2_01", setupOccasionSchemaVersion: 2,
  occasionScope: "specific", occasionIds: ["occasion_00"],
  occasionMatchIds: ["occasion_00"], occasionCatalogRevision: 1,
  providerEligibilityRevision: 1, occasionEligibilityState: "valid",
};

describe("Customer V1-only public projection of mixed Setup Galleries", () => {
  it("preserves published legacy setups when an authorized-shape V2 record is present", () => {
    expect(publicLegacyProviderSetupsFromMixed([legacy, v2], owner))
      .toEqual([legacy]);
  });

  it("never publishes a V2 record or reinterprets it as V1", () => {
    expect(publicLegacyProviderSetupsFromMixed([v2], owner)).toEqual([]);
    expect(publicLegacyProviderSetupsFromMixed([v2, legacy], owner))
      .toEqual([legacy]);
  });

  it("preserves legacy-only publication and draft filtering", () => {
    const draft = {...legacy, id: "setup_draft", isPublished: false};
    expect(publicLegacyProviderSetupsFromMixed([draft, legacy], owner))
      .toEqual([legacy]);
    expect(publicLegacyProviderSetupsFromMixed(undefined, owner)).toEqual([]);
  });

  it("fails closed if a V2 record is malformed, even when V1 is valid", () => {
    const forged = {...v2, occasionMatchIds: ["occasion_01"]};
    expect(publicLegacyProviderSetupsFromMixed([legacy, forged], owner))
      .toEqual([]);
    expect(publicLegacyProviderSetupsFromMixed([legacy,
      {...v2, setupOccasionSchemaVersion: 3}], owner)).toEqual([]);
  });

  it("retains valid V1 while excluding an unmapped private V2 draft", () => {
    const privateDraft = {...v2, eventType: null, isPublished: false,
      imageUrls: [], occasionEligibilityState: "review_required",
      occasionMatchIds: []};
    expect(publicLegacyProviderSetupsFromMixed([legacy, privateDraft], owner))
      .toEqual([legacy]);
  });

  it("fails closed on duplicate IDs, unknown fields and invalid image ownership", () => {
    expect(publicLegacyProviderSetupsFromMixed([legacy,
      {...v2, id: legacy.id}], owner)).toEqual([]);
    expect(publicLegacyProviderSetupsFromMixed([legacy,
      {...legacy, id: "setup_other", price: 2000}], owner)).toEqual([]);
    expect(publicLegacyProviderSetupsFromMixed([{
      ...legacy, imageUrls: [photo.replace("/owner/", "/other/")],
    }], owner)).toEqual([]);
  });
});
