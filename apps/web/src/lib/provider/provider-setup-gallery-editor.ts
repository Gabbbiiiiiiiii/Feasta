import type {ProviderSetup} from "./provider-setup-gallery";
import type {ProviderSetupV2, SetupGalleryAuthority, SetupGalleryOccasion} from "./provider-setup-gallery-v2";
import type {PrivateSetupGalleryV2, SavePrivateSetupGalleryV2Request} from "./provider-setup-gallery-v2-writer";
import type {PrivateGalleryResult} from "./provider-setup-gallery-private-service";

export type PrivateSetup = PrivateSetupGalleryV2["setups"][number];
export type SetupProposal = ProviderSetup | (Pick<ProviderSetupV2,
  "id" | "title" | "description" | "themeTags" | "imageUrls" | "isPublished" |
  "setupOccasionSchemaVersion" | "occasionScope" | "occasionIds">);

/** Full replacement: whitelist every retained record, including records not being edited. */
export function setupProposal(setup: PrivateSetup | SetupProposal): SetupProposal {
  const base = {
    id: setup.id, title: setup.title, description: setup.description,
    themeTags: [...setup.themeTags], imageUrls: [...setup.imageUrls], isPublished: setup.isPublished,
  };
  if (setup.setupOccasionSchemaVersion === 2) {
    return {...base, setupOccasionSchemaVersion: 2, occasionScope: setup.occasionScope, occasionIds: [...setup.occasionIds]};
  }
  return {...base, eventType: setup.eventType,
    ...(setup.setupOccasionSchemaVersion === 1 ? {setupOccasionSchemaVersion: 1 as const} : {})};
}

export function replacementRequest(gallery: PrivateSetupGalleryV2, setups: readonly (PrivateSetup | SetupProposal)[]): SavePrivateSetupGalleryV2Request {
  return {
    galleryWriteSchemaVersion: 2,
    revision: gallery.revision,
    expectedCatalogRevision: gallery.authority.catalogRevision,
    expectedProviderEligibilityRevision: gallery.authority.providerEligibilityRevision,
    setups: setups.map(setupProposal),
  };
}

export function occasionAllowed(occasion: SetupGalleryOccasion, authority: SetupGalleryAuthority): boolean {
  return occasion.active && occasion.moderationState === "approved" &&
    authority.approvedOccasionIds.includes(occasion.id) &&
    occasion.applicableServiceCategoryCodes.some((code) => authority.approvedCateringCategoryCodes.includes(code));
}

export function selectionError(scope: "all" | "specific", ids: readonly string[], authority: SetupGalleryAuthority): string | null {
  if (!authority.catalogComplete) return "The complete occasion catalog is unavailable. Reload before saving.";
  const applicable = authority.catalog.filter((occasion) => occasion.active &&
    occasion.applicableServiceCategoryCodes.some((code) => authority.approvedCateringCategoryCodes.includes(code)));
  const effective = scope === "all" ? applicable : applicable.filter((occasion) => ids.includes(occasion.id));
  if (scope === "specific" && (!ids.length || ids.length > authority.maxSpecificOccasions)) {
    return `Choose between 1 and ${authority.maxSpecificOccasions} approved occasions.`;
  }
  if (!effective.length || effective.length > authority.maxEffectiveMatches ||
    (scope === "specific" && effective.length !== ids.length) ||
    effective.some((occasion) => !occasionAllowed(occasion, authority))) {
    return "These occasions need approval. Remove unsupported selections or request a capability review.";
  }
  return null;
}

// This contract supplies stable IDs, not display labels. Never infer authority from a label.
export function occasionLabel(id: string): string {
  return id;
}

export type GalleryFailure = Extract<PrivateGalleryResult, {ok: false}>;
export const galleryErrorHelp: Record<GalleryFailure["code"], string> = {
  FORBIDDEN: "Sign in with the correct active provider account.",
  INVALID_REQUEST: "Reload the gallery. If stored records cannot be loaded, contact support.",
  UNAVAILABLE: "Saving is unavailable. Contact the backend owner before trying again.",
  CONFLICT: "Reload gallery and occasion choices, then review your unsaved draft against the latest records.",
  INVALID_SELECTION: "Reload occasion choices. Remove unsupported selections or request a capability review.",
  IMAGE_VERIFICATION: "Remove or upload the affected photos again, then retry.",
  INTERNAL: "Try again or contact support if the problem continues.",
};
