/** Frozen contract SHA-256: cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06.
 * Additive definitions only; no deployed V2 API or activation is implied.
 * Timestamp is structural so this package has no Firebase/browser runtime dependency.
 */
export interface Timestamp {
    readonly seconds: number;
    readonly nanoseconds: number;
}
export type CatalogTransitionState = 'preparing' | 'withdrawn' | 'committed' | 'rebuilding' | 'completed' | 'blocked';
export type OccasionId = string;
export type Tier = 'drop_off' | 'buffet_setup' | 'full_service';
export interface OccasionV2 {
    occasionSchemaVersion: 2;
    occasionScope: 'specific' | 'all';
    occasionIds: OccasionId[];
    eventType: string;
    occasionMatchIds: OccasionId[];
    occasionCatalogRevision: number;
    providerEligibilityRevision: number;
    occasionEligibilityState: 'valid' | 'review_required';
}
export interface GlobalOccasion {
    id: OccasionId;
    label: string;
    normalizedName: string;
    aliases: string[];
    active: boolean;
    moderationState: 'approved';
    applicableServiceCategoryCodes: string[];
    sortOrder: number;
    revision: number;
    createdBy: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
export interface OccasionSuggestion {
    providerId: string;
    submittedBy: string;
    name: string;
    normalizedName: string;
    reason?: string;
    status: 'pending' | 'approved' | 'rejected' | 'mapped';
    resolvedOccasionId: OccasionId | null;
    reviewReason: string | null;
    reviewedBy: string | null;
    reviewedAt: Timestamp | null;
    revision: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
export interface ServiceOptionV2 {
    price: number;
    includedServices: string[];
    decorInclusions?: string[];
    furnitureInclusions?: string[];
    equipmentInclusions?: string[];
}
/** Provider-defined meal choices; private draft metadata, not yet bookable. */
export interface FoodChoiceOptionV2 {
    id: string;
    name: string;
}
export interface FoodChoiceGroupV2 {
    id: string;
    title: string;
    selectionCount: number;
    options: FoodChoiceOptionV2[];
}
export interface OfferV2 {
    offerSchemaVersion: 2;
    serviceOptions: Partial<Record<Tier, ServiceOptionV2>>;
    serviceInclusions: string[];
    decorInclusions: string[];
    furnitureInclusions: string[];
    equipmentInclusions?: string[];
    foodInclusions: string[];
    foodChoiceGroups?: FoodChoiceGroupV2[];
    pricingModel?: 'per_pax' | 'per_bundle';
    price: number;
}
export interface PublicOccasion {
    id: OccasionId;
    label: string;
    applicableServiceCategoryCodes: string[];
    sortOrder: number;
    revision: number;
}
export type SuggestionStatus = OccasionSuggestion['status'];
export type ApiSuggestion = Omit<OccasionSuggestion, 'createdAt' | 'updatedAt' | 'reviewedAt'> & {
    createdAt: string;
    updatedAt: string;
    reviewedAt: string | null;
};
export type OccasionSuggestionListItem = ApiSuggestion & {
    suggestionId: string;
};
export interface SubmitOccasionSuggestionRequest {
    name: string;
    reason?: string;
    idempotencyKey: string;
}
export type SubmitOccasionSuggestionResponse = {
    outcome: 'created';
    suggestion: OccasionSuggestionListItem & {
        status: 'pending';
    };
} | {
    outcome: 'idempotent_replay';
    originalOutcome: 'created' | 'own_duplicate' | 'canonical_match';
    result: SuggestionSubmissionRecordedResult;
} | {
    outcome: 'own_duplicate';
    suggestion: OccasionSuggestionListItem;
} | {
    outcome: 'canonical_match';
    match: SuggestionCatalogMatch;
};
export type SuggestionSubmissionRecordedResult = {
    outcome: 'created';
    suggestion: OccasionSuggestionListItem & {
        status: 'pending';
    };
} | {
    outcome: 'own_duplicate';
    suggestion: OccasionSuggestionListItem;
} | {
    outcome: 'canonical_match';
    match: SuggestionCatalogMatch;
};
export interface SuggestionCatalogMatch {
    occasionId: OccasionId;
    label: string;
    active: boolean;
    revision: number;
    catalogRevision: number;
}
export interface ListMyOccasionSuggestionsRequest {
    status?: SuggestionStatus;
    cursor?: string;
    pageSize?: number;
}
export interface ListOccasionSuggestionsForReviewRequest {
    status: 'pending';
    cursor?: string;
    pageSize?: number;
}
export interface OccasionSuggestionPage {
    items: OccasionSuggestionListItem[];
    nextCursor: string | null;
}
export interface SuggestionReviewBase {
    suggestionId: string;
    expectedRevision: number;
    expectedCatalogRevision: number;
    idempotencyKey: string;
    reason: string;
}
export interface NewInactiveOccasionInput {
    id: OccasionId;
    label: string;
    aliases: string[];
    applicableServiceCategoryCodes: string[];
    sortOrder: number;
}
export type ReviewOccasionSuggestionRequest = SuggestionReviewBase & ({
    decision: 'approve_new';
    newOccasion: NewInactiveOccasionInput;
    targetOccasionId?: never;
    targetExpectedRevision?: never;
} | {
    decision: 'approve_existing_inactive';
    targetOccasionId: OccasionId;
    targetExpectedRevision: number;
    newOccasion?: never;
} | {
    decision: 'map';
    targetOccasionId: OccasionId;
    targetExpectedRevision: number;
    newOccasion?: never;
} | {
    decision: 'reject';
    targetOccasionId?: never;
    targetExpectedRevision?: never;
    newOccasion?: never;
});
export type ReviewOccasionSuggestionResponse = {
    decision: 'approve_new' | 'approve_existing_inactive';
    suggestionId: string;
    status: 'approved';
    resolvedOccasionId: OccasionId;
    revision: number;
    targetRevision: number;
    catalogRevision: number;
    targetActive: false;
} | {
    decision: 'map';
    suggestionId: string;
    status: 'mapped';
    resolvedOccasionId: OccasionId;
    revision: number;
    targetRevision: number;
    catalogRevision: number;
    targetActive: true;
} | {
    decision: 'reject';
    suggestionId: string;
    status: 'rejected';
    resolvedOccasionId: null;
    revision: number;
    targetRevision: null;
    catalogRevision: number;
    targetActive: null;
};
export interface UpdateProviderOccasionCapabilitiesRequest {
    providerId: string;
    approveOccasionIds: OccasionId[];
    revokeOccasionIds: OccasionId[];
    expectedProviderEligibilityRevision: number;
    expectedCatalogRevision: number;
    reason: string;
    idempotencyKey: string;
}
export interface ProviderCapabilityChangeResult {
    operationId: string;
    providerId: string;
    state: CatalogTransitionState;
    providerEligibilityRevision: number;
    eventTypesSupported: OccasionId[];
    catalogRevision: number;
    revalidationJobId: string;
    affectedPackageCount: number | null;
    failureReason: string | null;
}
export interface PackageEditorProgressV2 {
    name?: string;
    description?: string;
    serviceCategoryCode?: string;
    occasion?: {
        occasionSchemaVersion: 2;
        occasionScope?: 'specific' | 'all';
        occasionIds?: string[];
    };
    pricingModel?: 'legacy' | 'per_pax' | 'per_bundle';
    priceText?: string;
    minimumGuestsText?: string;
    maximumGuestsText?: string;
    tiers?: Partial<Record<Tier, {
        enabled: boolean;
        priceText: string;
        includedServices: string[];
        decorInclusions: string[];
        furnitureInclusions: string[];
        equipmentInclusions: string[];
    }>>;
    foodInclusions?: string[];
    foodChoiceGroups?: FoodChoiceGroupV2[];
    serviceInclusions?: string[];
    decorInclusions?: string[];
    furnitureInclusions?: string[];
    equipmentInclusions?: string[];
    themes?: {
        editorThemeId: string;
        name: string;
        description: string;
        assetIds: string[];
    }[];
    marketingAssetIds?: string[];
    paymentPolicy?: 'full_payment' | 'deposit_then_balance';
    depositPercentageText?: string;
}
export interface PackageEditorDraftV2 {
    editorSchemaVersion: 2;
    editorDraftId: string;
    providerId: string;
    packageId: string | null;
    basePackageRevision: number | null;
    state: 'incomplete' | 'completed';
    progress: PackageEditorProgressV2;
    currentStep: 0 | 1 | 2 | 3 | 4;
    completedPackageId: string | null;
    completedPackageRevision: number | null;
    revision: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
export interface SavePackageEditorDraftRequest {
    editorDraftId: string | null;
    expectedRevision: number;
    packageId: string | null;
    expectedPackageRevision: number | null;
    editorSchemaVersion: 2;
    currentStep: 0 | 1 | 2 | 3 | 4;
    progress: PackageEditorProgressV2;
    idempotencyKey: string;
}
export interface CompletePackageEditorDraftRequest {
    editorDraftId: string;
    expectedRevision: number;
    expectedPackageRevision: number | null;
    idempotencyKey: string;
}
export type WritableOccasionV2 = Pick<OccasionV2, 'occasionSchemaVersion' | 'occasionScope' | 'occasionIds'>;
/** Snapshot of the existing browser write envelope, plus its backend legacy field.
 * Source: apps/web/src/lib/provider/provider-package-client.ts ProviderPackageInput.
 * No import from an application package is required by shared-types.
 */
export interface ExistingPackageWriteInput {
    pricingModel?: 'per_pax' | 'per_bundle';
    name: string;
    description: string;
    eventType: string;
    serviceCategoryCode: string;
    price: number;
    serviceOptions: Partial<Record<Tier, {
        price: number;
        includedServices: readonly string[];
    }>>;
    themeOptions: {
        id: string;
        name: string;
        description: string;
        imageUrls: readonly string[];
    }[];
    paymentPolicy: 'full_payment' | 'deposit_then_balance';
    depositPercentage: number;
    balanceDueDaysBeforeEvent?: number | null;
    downPaymentPercentage?: number;
    minimumGuests: number;
    maximumGuests: number;
    imageUrl: string;
    imageUrls?: string[];
    foodInclusions: string[];
    decorInclusions: string[];
    furnitureInclusions: string[];
    serviceInclusions: string[];
}
export type PackageV2Write = Omit<ExistingPackageWriteInput, 'eventType' | 'serviceOptions' | 'serviceInclusions' | 'decorInclusions' | 'furnitureInclusions' | 'foodInclusions' | 'price' | 'pricingModel'> & WritableOccasionV2 & OfferV2;
export type CreateProviderPackageV2Request = PackageV2Write & {
    sharedContractVersion: 2;
    idempotencyKey: string;
};
export type UpdateProviderPackageV2Request = CreateProviderPackageV2Request & {
    packageId: string;
    expectedRevision: number;
};
export interface PackageDiscoveryProjectionV2 {
    eventType: string;
    occasionMatchIds: OccasionId[];
    occasionCatalogRevision: number;
    providerEligibilityRevision: number;
    occasionEligibilityState: 'valid' | 'review_required';
}
export interface PackageMutationV2Response {
    success: true;
    packageId: string;
    status: 'draft';
    sharedContractVersion: 2;
    packageRevision: number;
    discoveryProjection: PackageDiscoveryProjectionV2;
}
export interface GetProviderOccasionCapabilityChangeRequest {
    operationId: string;
}
export interface ListApprovedOccasionsRequest {
    serviceCategoryCode?: string;
    cursor?: string;
    pageSize?: number;
}
export interface ListApprovedOccasionsResponse {
    revision: number;
    items: PublicOccasion[];
    nextCursor: string | null;
}
export interface GetPackageEditorDraftRequest {
    editorDraftId: string;
}
export type PackageEditorDraftApiV2 = Omit<PackageEditorDraftV2, 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
};
export interface SavePackageEditorDraftResponse {
    draft: PackageEditorDraftApiV2;
}
export interface GetPackageEditorDraftResponse {
    draft: PackageEditorDraftApiV2;
}
export interface CompletePackageEditorDraftResponse {
    editorDraftId: string;
    editorDraftRevision: number;
    packageId: string;
    packageRevision: number;
    status: 'draft';
}
/** Stable customer selections; rules and display names remain server-owned. */
export interface FoodChoiceSelectionV2 {
    groupId: string;
    optionIds: string[];
}
export interface FoodChoiceSnapshotV2 {
    groupId: string;
    title: string;
    selectionCount: number;
    options: FoodChoiceOptionV2[];
}
//# sourceMappingURL=provider-package-v2.d.cts.map