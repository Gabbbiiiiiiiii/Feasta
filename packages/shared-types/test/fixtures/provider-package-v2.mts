import type {
  OccasionV2, GlobalOccasion, PublicOccasion, OccasionSuggestion, ServiceOptionV2, OfferV2,
  UpdateProviderOccasionCapabilitiesRequest, ProviderCapabilityChangeResult,
  ReviewOccasionSuggestionRequest, ReviewOccasionSuggestionResponse,
  SubmitOccasionSuggestionResponse, SavePackageEditorDraftRequest, PackageEditorDraftV2,
  CompletePackageEditorDraftRequest, WritableOccasionV2,
} from "@feasta/shared-types";
import type {OfferV2 as SubpathOffer} from "@feasta/shared-types/provider-package-v2";

const input: WritableOccasionV2 = {occasionSchemaVersion: 2, occasionScope: "all", occasionIds: []};
// @ts-expect-error Server-only projections are not writable occasion inputs.
const forged: WritableOccasionV2 = {...input, occasionMatchIds: ["birthday"]};
// @ts-expect-error Optional fields are absent or defined, not null.
const option: ServiceOptionV2 = {price: 1, includedServices: [], equipmentInclusions: null};
// @ts-expect-error Reject review branch forbids target fields.
const review: ReviewOccasionSuggestionRequest = {suggestionId: "id", expectedRevision: 1,
  expectedCatalogRevision: 1, idempotencyKey: "key", reason: "review", decision: "reject", targetOccasionId: "birthday"};
// @ts-expect-error Completed drafts have explicit nullable binding fields, not omitted ones.
const draft: PackageEditorDraftV2 = {editorSchemaVersion: 2};
export type Contracts = [OccasionV2, GlobalOccasion, PublicOccasion, OccasionSuggestion,
  OfferV2, SubpathOffer, ProviderCapabilityChangeResult, UpdateProviderOccasionCapabilitiesRequest,
  ReviewOccasionSuggestionResponse, SubmitOccasionSuggestionResponse, SavePackageEditorDraftRequest,
  CompletePackageEditorDraftRequest];
void [input, forged, option, review, draft];
