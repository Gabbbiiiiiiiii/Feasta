import {describe, expect, it} from "vitest";
import {parseProviderSetups, publicProviderSetups} from "@/lib/provider/provider-setup-gallery";
import {parsePrivateProviderSetups, resolveSetupGalleryV2, type SetupGalleryAuthority} from "@/lib/provider/provider-setup-gallery-v2";

const writable = {id: "setup_1", title: "Garden", description: "", themeTags: [], imageUrls: [], isPublished: false,
  setupOccasionSchemaVersion: 2, occasionScope: "specific", occasionIds: ["occasion_00"]};
function authority(count = 12): SetupGalleryAuthority {
  return {catalogComplete: true, catalogRevision: 3, providerEligibilityRevision: 4,
    maxSpecificOccasions: 10, maxCatalogRecords: 100, maxEffectiveMatches: 100,
    approvedCateringCategoryCodes: ["catering_service"],
    approvedOccasionIds: Array.from({length: count}, (_, i) => `occasion_${String(i).padStart(2, "0")}`),
    catalog: Array.from({length: count}, (_, i) => ({id: `occasion_${String(i).padStart(2, "0")}`, active: true,
      moderationState: "approved", applicableServiceCategoryCodes: ["catering_service"], sortOrder: i,
      setupGalleryLegacyEventType: i === 0 ? "wedding" : i === 1 ? "birthday" : null}))};
}
describe("private Setup Gallery V2 extension", () => {
  it("validates every specific selection and configurable bounds", () => {
    for (let count = 1; count <= 10; count++) {
      expect(resolveSetupGalleryV2({...writable, occasionIds: authority().approvedOccasionIds.slice(0, count)}, "owner", authority()).occasionMatchIds).toHaveLength(count);
    }
    for (const occasionIds of [[], ["occasion_00", "occasion_00"], ["unknown"], ["BAD"], authority().approvedOccasionIds]) {
      expect(() => resolveSetupGalleryV2({...writable, occasionIds}, "owner", authority())).toThrow();
    }
    expect(() => resolveSetupGalleryV2({...writable, occasionIds: ["occasion_00", "occasion_01"]}, "owner", {...authority(), maxSpecificOccasions: 1})).toThrow();
  });
  it("resolves the complete Fits All set beyond ten, without narrowing", () => {
    const all = {...writable, occasionScope: "all", occasionIds: []};
    expect(resolveSetupGalleryV2(all, "owner", authority()).occasionMatchIds).toHaveLength(12);
    for (const a of [{...authority(), approvedOccasionIds: authority().approvedOccasionIds.slice(0, 11)},
      {...authority(), catalogComplete: false}, {...authority(), maxCatalogRecords: 11}, {...authority(), maxEffectiveMatches: 11}]) {
      expect(() => resolveSetupGalleryV2(all, "owner", a)).toThrow();
    }
    expect(() => resolveSetupGalleryV2({...all, occasionIds: ["occasion_00"]}, "owner", authority())).toThrow();
  });
  it("preserves an eligible explicit scalar, otherwise sorts by order and ID", () => {
    const input = {...writable, occasionScope: "all", occasionIds: []};
    expect(resolveSetupGalleryV2(input, "owner", authority(), "birthday").eventType).toBe("birthday");
    expect(resolveSetupGalleryV2(input, "owner", authority(), "other").eventType).toBe("wedding");
    const a = authority();
    a.catalog = [...a.catalog].reverse().map((o) => ({...o, sortOrder: 1}));
    expect(resolveSetupGalleryV2(input, "owner", a).eventType).toBe("wedding");
  });
  it("uses null for unmapped private drafts and never infers other", () => {
    const a = authority(); a.catalog = a.catalog.map((o) => ({...o, setupGalleryLegacyEventType: null}));
    const draft = resolveSetupGalleryV2(writable, "owner", a, "other");
    expect(draft.eventType).toBeNull();
    expect(parsePrivateProviderSetups([draft], "owner", 10)).toEqual([draft]);
    expect(() => parsePrivateProviderSetups([{...draft, isPublished: true}], "owner", 10)).toThrow();
    expect(() => parseProviderSetups([draft], "owner")).toThrow();
    expect(publicProviderSetups([draft], "owner")).toEqual([]);
    a.catalog = a.catalog.map((o) => ({...o, setupGalleryLegacyEventType: "other"}));
    expect(resolveSetupGalleryV2(writable, "owner", a).eventType).toBe("other");
  });
  it("rejects forged metadata, malformed stored versions, revisions and states", () => {
    const draft = resolveSetupGalleryV2(writable, "owner", authority());
    for (const extra of [{eventType: "other"}, {occasionMatchIds: []}, {occasionCatalogRevision: 3},
      {providerEligibilityRevision: 4}, {occasionEligibilityState: "valid"}]) {
      expect(() => resolveSetupGalleryV2({...writable, ...extra}, "owner", authority())).toThrow();
    }
    for (const extra of [{occasionEligibilityState: "invalid"}, {occasionCatalogRevision: 0},
      {providerEligibilityRevision: 1.5}, {setupOccasionSchemaVersion: 3}, {occasionMatchIds: []},
      {occasionIds: ["occasion_01"]}, {surprise: true}, {imageUrls: undefined}]) {
      expect(() => parsePrivateProviderSetups([{...draft, ...extra}], "owner", 10)).toThrow();
    }
    expect(() => parsePrivateProviderSetups([draft, draft], "owner", 10)).toThrow();
  });
  it("rejects inactive, ineligible and malformed catalog authority", () => {
    for (const patch of [{active: false}, {applicableServiceCategoryCodes: ["addon"]},
      {setupGalleryLegacyEventType: "party"}, {sortOrder: NaN}]) {
      const a = authority(); a.catalog = a.catalog.map((o, i) => i === 0 ? {...o, ...patch} : o) as SetupGalleryAuthority["catalog"];
      expect(() => resolveSetupGalleryV2(writable, "owner", a)).toThrow();
    }
    expect(() => resolveSetupGalleryV2(writable, "owner", {...authority(), providerEligibilityRevision: 0})).toThrow();
    expect(() => resolveSetupGalleryV2(writable, "owner", {...authority(), approvedOccasionIds: []})).toThrow();
  });
});
