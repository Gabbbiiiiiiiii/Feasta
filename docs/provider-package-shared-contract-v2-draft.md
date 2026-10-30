# Provider package shared contract v2 — draft for approval

2026-10-23 · `feat/provider-ui-improvements` · Gabriel has approved the development direction; exact schema/API freeze and public activation remain pending.

**Every new interface, operation, collection and limit below is a proposal, not an implemented API.** Architecture approval does not authorize production implementation or activation. Normative language describes the proposed target.

## 1. Approved Architecture Decisions

- Multiple approved occasions and mutually exclusive Fits All Occasions, with administrator-reviewed custom suggestions.
- Dynamic authoritative catalog, explicit provider capabilities, server-maintained discovery membership and legacy scalar compatibility.
- Retain Cloudinary; scalable galleries use paginated membership records, without a permanent 20-image schema maximum.
- Preserve independent `drop_off`, `buffet_setup`, `full_service` prices and services; add categorized inclusions.
- Server-authoritative, immutable booking terms; occasion choice never changes tier price.

Baseline: `provider-package-occasions-theme-compatibility.md` and `provider-package-tier-inclusions-audit.md`. Current source verified in `packages/shared-types/src/provider.ts`, `functions/src/shared/constants.ts`, `functions/src/packages/{package-domain,create-provider-package,update-provider-package}.ts`, `functions/src/bookings/{booking-contract,booking-package-offer,booking-payment-agreement,submit-booking-request}.ts`, `functions/src/providers/provider-media.ts`, `apps/web/src/lib/provider/{provider-package-client,catalog-media}.ts`, customer `discovery/package-discovery-service.ts`, and `firebase/firestore.indexes.json`.

Confirmed restrictions: approved provider ownership; draft-only package edits; 12 themes, four images/theme, eight package marketing images; inclusion groups <=50 entries, each <=160 characters; picker JPEG/PNG/WebP, 1–5,242,880 bytes. Discovery currently uses scalar equality. Both publication and booking currently reject packages with a defined canonical `pricingModel`. Preserve these restrictions. Shared types do not yet own the complete offer schema.

## 2. Final Proposed Schemas

The versioned contracts below remain proposed. Initial operational limits are a maximum of 10 individually selected occasions/package and three pending occasion suggestions/provider. Both are server-configurable, not permanent schema restrictions. Backend rejects duplicate, inactive, malformed or unauthorized selections and suggestions; private duplicate retry resolution below is idempotency, not permission to create duplicates. Preserve existing rate limits unless Gabriel explicitly approves changes.

Storage timestamps are Firestore Timestamp; API timestamps are RFC3339 UTC. `?` means absent allowed, not null unless specified. Reject unknown input fields. All new records have server `createdAt`, `updatedAt`, and safe-integer monotonic `revision`; nested value objects and immutable event/snapshot values do not. Gallery/asset/reservation/reference interfaces omit these common fields for brevity; persisted records include them. Retention state and transition jobs explicitly follow the same convention. Server metadata, projections, ownership and counters are not writable inputs.

```typescript
// DRAFT shared contracts, not deployed definitions.
type OccasionId = string;
type Tier = 'drop_off' | 'buffet_setup' | 'full_service';
interface OccasionV2 {
  occasionSchemaVersion: 2;
  occasionScope: 'specific' | 'all';
  occasionIds: OccasionId[];
  eventType: string; // derived legacy primary
  occasionMatchIds: OccasionId[]; // server only
  occasionCatalogRevision: number; // server only
  providerEligibilityRevision: number; // server only
  occasionEligibilityState: 'valid' | 'review_required'; // server only
}
interface GlobalOccasion {
  id: OccasionId;
  label: string;
  normalizedName: string;
  aliases: string[];
  active: boolean; // server-only; guarded lifecycle operations only
  moderationState: 'approved'; // rejected/pending ideas stay in suggestions
  applicableServiceCategoryCodes: string[];
  sortOrder: number;
  revision: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
interface OccasionSuggestion {
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
interface ServiceOptionV2 {
  price: number; // PHP, existing independent field
  includedServices: string[];
  decorInclusions?: string[];
  furnitureInclusions?: string[];
  equipmentInclusions?: string[];
}
interface OfferV2 {
  offerSchemaVersion: 2;
  serviceOptions: Partial<Record<Tier, ServiceOptionV2>>;
  serviceInclusions: string[];
  decorInclusions: string[];
  furnitureInclusions: string[];
  equipmentInclusions?: string[]; // YES: optional shared equipment
  foodInclusions: string[]; // existing shared food rules retained
  pricingModel?: 'per_pax' | 'per_bundle';
  price: number; // minimum enabled tier unit price, otherwise standalone legacy price
}
```

Catalog: `occasions/{id}`, with `occasionCatalog/current` containing global revision, activation state and update timestamp. Immutable IDs match `^[a-z][a-z0-9_]{1,63}$`; admin/server allocates with collision checks, never treats display names as identity. Seed exactly `birthday`, `wedding`, `debut`, `anniversary`, `reunion`, `corporate`, `baptism`, `graduation`, `other`. Fiesta / Holiday needs approval, not invented mapping. Deactivate referenced IDs instead of deleting/reusing them. Labels/aliases: proposed 2–80 Unicode code points, <=20 aliases. Applicability is a nonempty subset of canonical service category codes, reviewed explicitly for seeds.

Provider capabilities remain explicitly approved `eventTypesSupported`, migrated to dynamic IDs with server eligibility revision. Let A be current active occasions applicable to the package category. Specific requires 1–10 unique IDs, all in A and approved capabilities. All requires `occasionIds: []`, nonempty A and provider approval for **every** ID in A. Ten is a provisional server-configurable specific-selection maximum, not a permanent hardcoded schema restriction or a universal projection limit. Preserve stricter existing restrictions until coordinated authorization. Valid specific projects its IDs; valid all projects A. Invalidated packages project `[]` with review-required state.

Legacy primary: preserve prior `eventType` if still eligible, otherwise choose eligible ID by catalog sortOrder then ID. Never use `all` or map universal scope to `other`. Existing invalidated packages retain the historical scalar while being withdrawn from public eligibility; it no longer asserts current eligibility. Creating a completed all contract without a valid primary fails. Clients must use scope/IDs to describe v2 eligibility.

Suggestions: `providerOccasionSuggestions/{id}`. Approve creates a new inactive catalog ID (`active: false`) and records approved + target; approval may reuse an existing inactive approved record only with its expected revision and matching canonical name/alias, without editing that catalog record; it must never deactivate or modify an active record through moderation. Administrator approval accepts the identity, name and applicability but does not authorize public activation; map records existing active target; reject records null target and required explanation. Lifecycle is pending → approved/rejected/mapped, with immutable terminal records. A revised rejected idea is a new submission with predecessor in audit metadata. Approval/mapping never automatically grants provider capability or changes a package.

```typescript
// DRAFT gallery records; common revision/timestamps as specified above.
interface ImageAsset {
  providerId: string;
  cloudinaryAssetId: string;
  publicId: string;
  version: number;
  resourceType: 'image';
  format: 'jpg' | 'png' | 'webp';
  bytes: number;
  width: number;
  height: number;
  cloudName: string;
  deliveryType: 'upload' | 'authenticated' | 'private';
  contentSha256: string; // trusted verified source digest
  deliveryUrl: string; // verified versioned HTTPS
  thumbnailUrl: string; // allowlisted derivative
  state: 'ready' | 'quarantined' | 'deleting' | 'deleted';
  referenceCount: number;
}
interface ThemeGallery {
  gallerySchemaVersion: 2;
  providerId: string;
  packageId: string;
  themeId: string;
  coverMembershipId: string | null;
  imageCount: number;
}
interface GalleryMembership { assetId: string; position: number }
interface UploadReservation {
  providerId: string;
  packageId: string;
  themeId: string;
  reservedPublicId: string;
  expectedBytes: number;
  expectedMime: 'image/jpeg' | 'image/png' | 'image/webp';
  state: 'reserved' | 'uploaded' | 'finalized' | 'expired' | 'cleanup_pending';
  assetId: string | null;
  membershipId: string | null;
  expiresAt: Timestamp;
}
interface AssetReference {
  assetId: string;
  kind: 'gallery' | 'booking' | 'editor_draft';
  targetPath: string;
}
```

Paths: `imageAssets/{id}`, `packages/{packageId}/themeGalleries/{themeId}` and its `images/{membershipId}`, private `uploadReservations/{id}`, private `assetReferences/{deterministicTargetHash}`. Reference records are authoritative; counters require reconciliation. Gallery, booking and private editor-draft references all prevent deletion; reference enumeration/reconciliation must include every kind. All gallery mutations use the common mutation idempotency key; membership/cover/reorder changes compare the gallery expectedRevision, while upload finalize uses its reservation identity plus a transactionally checked current gallery revision and capacity. Replayed finalized reservations never attach again, even after removal; status returns the recorded identity.

Retain existing theme identity/name/description and current limits (name 80, description 500, 12 themes). No growing membership array on package documents. Removing membership does not delete the asset.

Illustrative Firestore fragments; Timestamp(...) denotes native timestamp, not a string:

```javascript
// occasions/birthday
{id:'birthday',label:'Birthday',normalizedName:'birthday',aliases:[],active:true,moderationState:'approved',
 applicableServiceCategoryCodes:['catering_service'],sortOrder:10,revision:1,
 createdBy:'admin_1',createdAt:Timestamp(...),updatedAt:Timestamp(...)}
// packages/pkg_1; existing required package fields omitted here
{occasionSchemaVersion:2,occasionScope:'specific',occasionIds:['birthday','wedding'],
 eventType:'birthday',occasionMatchIds:['birthday','wedding'],occasionCatalogRevision:7,
 providerEligibilityRevision:3,occasionEligibilityState:'valid',offerSchemaVersion:2,
 serviceOptions:{drop_off:{price:250,includedServices:['Delivery'],equipmentInclusions:['Food warmers']}},
 serviceInclusions:[],decorInclusions:[],furnitureInclusions:[],equipmentInclusions:[]}
// providerOccasionSuggestions/sug_1, common timestamps omitted
{providerId:'provider_1',submittedBy:'owner_1',name:'Birthday party',normalizedName:'birthday party',
 status:'mapped',resolvedOccasionId:'birthday',reviewReason:'Existing category',
 reviewedBy:'admin_1',reviewedAt:Timestamp(...),revision:2}
// packages/pkg_1/themeGalleries/theme_1/images/member_1
{assetId:'asset_1',position:1000,revision:1,createdAt:Timestamp(...),updatedAt:Timestamp(...)}
```

Additional Firestore fragments matching the proposed gallery and evidence contracts (common metadata omitted only where noted):

```javascript
// imageAssets/asset_1; common revision/createdAt/updatedAt omitted
{providerId:'provider_1',cloudinaryAssetId:'trusted-cloudinary-id',publicId:'providers/provider_1/design_1',
 cloudName:'verified-account',version:1,resourceType:'image',deliveryType:'upload',format:'jpg',
 bytes:3145728,width:2400,height:1600,contentSha256:'<verified-sha256>',
 deliveryUrl:'https://<verified-cloudinary-host>/<versioned-path>',
 thumbnailUrl:'https://<verified-cloudinary-host>/<allowlisted-thumbnail-path>',
 state:'ready',referenceCount:1}
// packages/pkg_1/themeGalleries/theme_1; common metadata omitted
{gallerySchemaVersion:2,providerId:'provider_1',packageId:'pkg_1',themeId:'theme_1',
 coverMembershipId:'member_1',imageCount:1}
// Fragment of BookingPackageSnapshotV2.theme; evidence_1 is a separate protected registry copy
{id:'theme_1',name:'Agreed design',description:'Disclosed design',galleryRevision:1,
 coverAssetId:'evidence_1',legacyImageUrls:[],evidence:{storage:'inline',assets:[{
 assetId:'evidence_1',cloudName:'verified-account',cloudinaryAssetId:'trusted-evidence-id',
 publicId:'protected-evidence/unique_1',version:1,resourceType:'image',deliveryType:'authenticated',
 format:'jpg',contentSha256:'<verified-sha256>',
 deliveryUrl:'https://<verified-cloudinary-host>/<protected-versioned-path>'}]}}
```

Placeholders above are illustrative, never accepted without backend verification. Protected registry copies have the full ImageAsset record, common metadata and booking references; generated thumbnail URLs are authorized locators where assets are private. Neither API nor storage accepts caller-authored Cloudinary identities or locators.

### Public catalog projection and canonical categories

```typescript
interface PublicOccasion {
  id: OccasionId;
  label: string;
  applicableServiceCategoryCodes: string[];
  sortOrder: number;
  revision: number; // record revision; response revision is global catalog revision
}
```

`listApprovedOccasions` returns this explicit allowlist only: active approved records, optionally filtered by an active canonical service category, ordered by sortOrder then ID. Provider Web uses IDs/labels/applicability for selection, Customer Web and Flutter for filters/display; aliases and normalizedName are internal matching inputs, not needed public fields. No createdBy, administrative timestamps, moderation state or authorization metadata is returned. Public reads require no provider role; gateway rate limits and visibility apply. Unknown/inactive category filters fail INVALID_SERVICE_CATEGORY; catalog changes invalidate revision-bound cursors (REVISION_CONFLICT). The response revision binds all pages to one catalog generation. Public selection is advisory: every write/booking independently checks current catalog and approved provider capabilities. Full GlobalOccasion records remain server/private admin data; no direct public collection access or new unrestricted internal-read API is proposed.

Source verification: `packages/shared-types/src/service-category.ts`, `functions/src/scripts/seed-service-categories.ts` and `functions/src/shared/service-category-policy.ts` agree on `catering_service`, `food_trays_packed_meals` and `catering_event_styling` as the three default catering category codes. `catering` is a serviceType, not a category ID. The birthday example now uses `catering_service`; this does not migrate stored values. The runtime authority is validated `serviceCategories/{code}` with matching document ID/code, active status and correct serviceType, not the bootstrap list. Before seeding each of the nine occasions, administrators must approve its explicit nonempty applicability set; validate every code against that authority and record reviewed catalog evidence. Do not assume every occasion applies to all three categories or invent mappings for unknown/discontinued categories. Category discontinuation/applicability changes use eligibility revalidation and withdrawal barriers.

## 3. Callable and API Contracts

Names below are proposed logical APIs, not claims of deployed exports. Mutations carry `idempotencyKey` (16–128 safe ASCII characters); revision-guarded mutations carry safe integer `expectedRevision`. Same actor + operation + key + canonical request returns original result; changed payload conflicts. Proposed management idempotency retention: 30 days; existing booking ledger guarantees remain unchanged. Transactionally reserve idempotency keys and rate slots.

| Operation | Request, besides common mutation key | Response |
| --- | --- | --- |
| `listApprovedOccasions` | `{serviceCategoryCode?,cursor?,pageSize?}` | `{revision,items:PublicOccasion[],nextCursor}`; default/max 50 |
| `createProviderPackage` / `updateProviderPackage` extensions | `CreateProviderPackageV2Request` / `UpdateProviderPackageV2Request` below | `PackageMutationV2Response` below; inherited draft envelope plus proposed revision/projection |
| `submitProviderOccasionSuggestion` | `SubmitOccasionSuggestionRequest` below | `SubmitOccasionSuggestionResponse`; four discriminated outcomes |
| `listMyOccasionSuggestions` | `ListMyOccasionSuggestionsRequest` below | `OccasionSuggestionPage`; default/max 20; owner only |
| `listOccasionSuggestionsForReview` | `ListOccasionSuggestionsForReviewRequest` below | `OccasionSuggestionPage`; admin, default/max 20 |
| `reviewOccasionSuggestion` | `ReviewOccasionSuggestionRequest` below | `ReviewOccasionSuggestionResponse`; moderation never activates |
| `updateGlobalOccasion` | `{occasionId,expectedRevision,expectedCatalogRevision,releaseApprovalId?,patch:{label?,aliases?,applicableServiceCategoryCodes?,sortOrder?}}` | `{revision,catalogRevision,revalidationJobId}`; cannot write active; applicability patch requires releaseApprovalId and uses the same staged withdrawal/revalidation barrier in section 4 |
| `activateGlobalOccasion` / `deactivateGlobalOccasion` | `OccasionTransitionRequest` in section 4 | `OccasionTransitionResult`; guarded admin operations, names pending approval |
| `getOccasionTransition` | `{operationId}` | `OccasionTransitionResult`; admin read |
| `updateProviderOccasionCapabilities` | `UpdateProviderOccasionCapabilitiesRequest` (section 4) | `ProviderCapabilityChangeResult`; admin mutation |
| `getProviderOccasionCapabilityChange` | `{operationId:string}` | `ProviderCapabilityChangeResult`; admin read |
| `saveProviderPackageEditorDraft` | `SavePackageEditorDraftRequest` (section 4) | `{draft:PackageEditorDraftV2}`; approved owner |
| `getProviderPackageEditorDraft` | `{editorDraftId:string}` | `{draft:PackageEditorDraftV2}`; approved owner read |
| `completeProviderPackageEditorDraft` | `CompletePackageEditorDraftRequest` (section 4) | `{editorDraftId,editorDraftRevision,packageId,packageRevision,status:'draft'}`; approved owner |
| `reserveThemeImageUpload` | `{packageId,themeId,expectedBytes,expectedMime}` | `{reservationId,expiresAt,upload:{url,publicId,signedFields}}` |
| `getThemeUploadReservation` | `{reservationId}` | `{state,expiresAt,assetId,membershipId}`; owner only |
| `finalizeThemeImageUpload` | `{reservationId}` | `{assetId,membershipId,galleryRevision}` |
| `listThemeGalleryImages` | `{packageId,themeId,cursor?,pageSize?}` | `{items:{membershipId,assetId,position,url,thumbnailUrl}[],coverMembershipId,revision,nextCursor}`; default 24, max 48 |
| `moveThemeGalleryImage` | `{packageId,themeId,membershipId,beforeMembershipId:string|null,expectedRevision}` | `{revision}`; null appends |
| `setThemeGalleryCover` | `{packageId,themeId,membershipId,expectedRevision}` | `{revision}` |
| `removeThemeGalleryImage` | `{packageId,themeId,membershipId,expectedRevision}` | `{revision,assetDeletion:'retained'|'queued'}` |
| `requestUnusedImageDeletion` | `{assetId}` | `{state:'retained'|'queued'|'deleted'}` |
| `getBookingPaymentAgreementDisclosures` / `submitBookingRequest` extensions | `BookingDisclosureV2Request` / `BookingSubmissionV2Request` below | `BookingDisclosureV2Response` / `BookingSubmissionV2Response` below |

Reads have no mutation key. Null cursor means end; opaque cursors bind query filters and reject malformed/tampered values. Create and update require complete canonical payloads, as their current source does; neither package mutation is PATCH. Only explicitly named patch operations retain omitted fields; `[]` clears writable inclusion contributions. Client-writable occasion fields are only version, scope and IDs. Legacy scalar writes are allowed only by the legacy adapter on packages without v2 data. Reject old-writer edits to v2 packages with CLIENT_UPGRADE_REQUIRED, preventing data erasure. Server assigns compatibility scalar.

Incomplete wizard progress uses only the separate private editor-draft resource defined below; it never writes an incomplete canonical package. No direct Firestore bypass or relaxed approved-owner requirement is permitted.

### Exact suggestion submission, listing and moderation variants

```typescript
type SuggestionStatus = OccasionSuggestion['status'];
type ApiSuggestion = Omit<OccasionSuggestion, 'createdAt'|'updatedAt'|'reviewedAt'> & {
  createdAt:string; updatedAt:string; reviewedAt:string|null;
};
// Identity is projected from the document ID, NOT added to the stored document schema.
type OccasionSuggestionListItem = ApiSuggestion & {suggestionId:string};
interface SubmitOccasionSuggestionRequest {name:string; reason?:string; idempotencyKey:string}
type SubmitOccasionSuggestionResponse =
  | {outcome:'created'; suggestion:OccasionSuggestionListItem & {status:'pending'}}
  | {outcome:'idempotent_replay'; originalOutcome:'created'|'own_duplicate'|'canonical_match';
      result:SuggestionSubmissionRecordedResult}
  | {outcome:'own_duplicate'; suggestion:OccasionSuggestionListItem}
  | {outcome:'canonical_match'; match:SuggestionCatalogMatch};
type SuggestionSubmissionRecordedResult =
  | {outcome:'created'; suggestion:OccasionSuggestionListItem & {status:'pending'}}
  | {outcome:'own_duplicate'; suggestion:OccasionSuggestionListItem}
  | {outcome:'canonical_match'; match:SuggestionCatalogMatch};
interface SuggestionCatalogMatch {
  occasionId:OccasionId; label:string; active:boolean;
  revision:number; catalogRevision:number;
}
interface ListMyOccasionSuggestionsRequest {status?:SuggestionStatus; cursor?:string; pageSize?:number}
interface ListOccasionSuggestionsForReviewRequest {status:'pending'; cursor?:string; pageSize?:number}
interface OccasionSuggestionPage {items:OccasionSuggestionListItem[]; nextCursor:string|null}
// submitProviderOccasionSuggestion(SubmitOccasionSuggestionRequest): SubmitOccasionSuggestionResponse
// listMyOccasionSuggestions(ListMyOccasionSuggestionsRequest): OccasionSuggestionPage
// listOccasionSuggestionsForReview(ListOccasionSuggestionsForReviewRequest): OccasionSuggestionPage
interface SuggestionReviewBase {
  suggestionId:string; expectedRevision:number; expectedCatalogRevision:number;
  idempotencyKey:string; reason:string;
}
interface NewInactiveOccasionInput {
  id:OccasionId; label:string; aliases:string[];
  applicableServiceCategoryCodes:string[]; sortOrder:number;
}
type ReviewOccasionSuggestionRequest = SuggestionReviewBase & (
  | {decision:'approve_new'; newOccasion:NewInactiveOccasionInput;
      targetOccasionId?:never; targetExpectedRevision?:never}
  | {decision:'approve_existing_inactive'; targetOccasionId:OccasionId;
      targetExpectedRevision:number; newOccasion?:never}
  | {decision:'map'; targetOccasionId:OccasionId;
      targetExpectedRevision:number; newOccasion?:never}
  | {decision:'reject'; targetOccasionId?:never; targetExpectedRevision?:never; newOccasion?:never}
);
type ReviewOccasionSuggestionResponse =
  | {decision:'approve_new'|'approve_existing_inactive'; suggestionId:string;
      status:'approved'; resolvedOccasionId:OccasionId; revision:number;
      targetRevision:number; catalogRevision:number; targetActive:false}
  | {decision:'map'; suggestionId:string; status:'mapped'; resolvedOccasionId:OccasionId;
      revision:number; targetRevision:number; catalogRevision:number; targetActive:true}
  | {decision:'reject'; suggestionId:string; status:'rejected'; resolvedOccasionId:null;
      revision:number; targetRevision:null; catalogRevision:number; targetActive:null};
// reviewOccasionSuggestion(ReviewOccasionSuggestionRequest): ReviewOccasionSuggestionResponse
```

Every union branch is exact: all displayed nonoptional fields are required; unknown fields and fields belonging to another branch are forbidden, including caller-supplied `active`, capability sets and server review metadata. `originalOutcome` must equal the nested recorded result's `outcome`; replay never nests replay. For submission only, an idempotent retry wraps the original recorded result, including its original suggestion status/revision, rather than rereading a now-moderated suggestion. This explicitly overrides the common identical-response envelope rule; it preserves the original identity and performs no second mutation. A later key with the same normalized provider-owned suggestion returns `own_duplicate` with its current item. Match precedence after replay lookup: exact catalog label/alias (active or inactive approved identity), own normalized suggestion duplicate (any status), then create pending. A canonical match creates no suggestion, has no suggestionId, grants no capability and does not activate an inactive identity. The match response discloses only the displayed catalog fields, never another provider's submission. Inactive identity reuse is available to administrators reviewing pending suggestions created before that identity existed; providers cannot bypass moderation by creating a duplicate inactive catalog identity.

Owner listing derives providerId from authenticated approved ownership and applies that scope before every page/filter; no providerId input is accepted. Admin review listing requires the existing active platform administrator check. Neither public catalog nor another provider's listing includes private suggestions. Status filters use exactly SuggestionStatus; only pending is accepted by the review queue. API timestamps use RFC3339 UTC. Opaque cursors bind actor scope, status and ordering (owner: `createdAt DESC`, document ID DESC; admin queue: `createdAt ASC`, document ID ASC); malformed/tampered cursors fail INVALID_CURSOR. Preserve rate checks, proposed five new submissions per rolling 24 hours and three pending per provider, bounded by stricter current policy; replay, canonical match and own duplicate do not consume new-submission slots. Common abuse/request rate checks still apply.

Every review requires auth, App Check and server-verified active platform administrator authority, a pending suggestion at expectedRevision, the exact current expectedCatalogRevision (all supplied expected revision fields are positive safe integers), and a trimmed plain-text reason of minimum 1 and maximum 500 Unicode code points with no controls/invisible formatting. This reason rule covers approvals/maps as well as rejection and is separate from the capability reason rule. Revision mismatches abort with REVISION_CONFLICT; already-terminal review under a different key fails SUGGESTION_NOT_PENDING. Common idempotency lookup occurs after current authorization but before stale-revision validation: same actor/operation/key/request returns the original response, even after moderation/catalog changes; changed payload gives IDEMPOTENCY_CONFLICT. No retry duplicates audit/outbox records.

| Decision | Target constraints and revision effects | Result and audit |
| --- | --- | --- |
| approve_new | ID and normalized label/aliases must be unreserved; validate canonical categories. Create approved inactive catalog identity at revision 1, increment global catalog revision once. No existing target allowed. | Suggestion becomes approved, revision +1; response targetActive false. |
| approve_existing_inactive | Target must exist, be approved and inactive at targetExpectedRevision; suggestion normalized name must equal target's normalized name/alias. Reuse without editing label, applicability or target revision; catalog revision unchanged. Different identity or active target fails INVALID_REVIEW_TARGET. | Suggestion becomes approved, revision +1; response contains existing target revision and targetActive false. |
| map | Target must be approved, active, at targetExpectedRevision, applicable to a current approved provider category; no catalog mutation/revision increment. Mapping itself grants no capability. | Suggestion becomes mapped, revision +1; response targetActive true. |
| reject | No target or catalog mutation; catalog revision unchanged. | Suggestion becomes rejected, revision +1; resolvedOccasionId and target metadata null. |

Invalid branch/target shape yields invalid-argument INVALID_REVIEW_TARGET; invalid review reason yields invalid-argument INVALID_REVIEW_REASON. Missing catalog target uses the existing not-found owned-target convention; active/inactive mismatch is INVALID_REVIEW_TARGET.

All four branches transactionally append one immutable review audit and one outbox entry keyed by the moderation operation identity: actor, reason, decision, suggestion ID, before/after suggestion revisions/status, resolved target/null and before/after catalog/target revisions. Set reviewedBy/reviewedAt/reviewReason on the suggestion once. Name reservations, catalog creation (if any), terminal suggestion, audit/outbox and original idempotency result commit together. Suggestions never activate a catalog entry, modify packages or grant capabilities. Separate administrator capability management and separately approved guarded activation remain mandatory.

### Exact package mutation extensions and source envelopes

The authoritative existing browser types are ProviderPackageInput and the local PackageMutationResponse in `apps/web/src/lib/provider/provider-package-client.ts`. Backend authority is each callable's ALLOWED_FIELDS, parseCanonicalPackageWrite and return literal in `functions/src/packages/{create-provider-package,update-provider-package}.ts`; the browser input omits the backend's optional legacy downPaymentPercentage. The existing callable result is exactly `{success:true, packageId:string, status:'draft'}`; the browser type widens success/status. No existing revision/projection or package-management idempotency field is claimed.

```typescript
// Source aliases below refer to the existing types just cited, not new implementations.
type ExistingPackageWriteInput = ProviderPackageInput & {downPaymentPercentage?:number};
type WritableOccasionV2 = Pick<OccasionV2,'occasionSchemaVersion'|'occasionScope'|'occasionIds'>;
type PackageV2Write = Omit<ExistingPackageWriteInput,
  'eventType'|'serviceOptions'|'serviceInclusions'|'decorInclusions'|
  'furnitureInclusions'|'foodInclusions'|'price'|'pricingModel'> & WritableOccasionV2 & OfferV2;
type CreateProviderPackageV2Request = PackageV2Write & {
  sharedContractVersion:2; idempotencyKey:string;
};
type UpdateProviderPackageV2Request = CreateProviderPackageV2Request & {
  packageId:string; expectedRevision:number;
};
interface PackageDiscoveryProjectionV2 {
  eventType:string; occasionMatchIds:OccasionId[];
  occasionCatalogRevision:number; providerEligibilityRevision:number;
  occasionEligibilityState:'valid'|'review_required';
}
interface PackageMutationV2Response {
  // Inherited existing callable fields:
  success:true; packageId:string; status:'draft';
  // Newly proposed fields, required for sharedContractVersion 2:
  sharedContractVersion:2; packageRevision:number;
  discoveryProjection:PackageDiscoveryProjectionV2;
}
// createProviderPackage(CreateProviderPackageV2Request): PackageMutationV2Response
// updateProviderPackage(UpdateProviderPackageV2Request): PackageMutationV2Response
```

Proposed persisted `packages/{packageId}.revision` is the canonical safe-integer package revision; API packageRevision is its projection. Create starts at 1; each committed canonical edit increments once, same-key retries do not. Update compares expectedRevision. Before first V2 bound use, a legacy package lacking revision receives initial revision 1 under CAS without rewriting offer/status; a following edit produces 2. Projection refreshes also increment canonical revision when stored package fields change, preventing a concurrent full write from erasing projection updates. Catalog and provider eligibility revisions remain independent generations. Server recomputes discoveryProjection; it is returned for reconciliation, never accepted as input or treated as public eligibility. Draft flags stay false. sharedContractVersion is the exact proposed request/response capability discriminator, not a claim that the deployed callables accept it; legacy requests retain their existing response shape and old writers cannot edit V2 records. Both V2 package mutations use the common management idempotency contract, in addition to full canonical validation.

### Exact booking disclosure, submission and snapshot boundary

Source authority: SubmitPackageBookingRequestInput and SubmitBookingRequestResult in `apps/web/src/lib/customer/bookings/customer-booking-submission-client.ts`, and BookingPaymentAgreementDisclosure in `functions/src/bookings/booking-payment-agreement.ts`. `getBookingPaymentAgreementDisclosures` is exported from `submit-booking-request.ts`, uses the same selection parser as submission, and returns `{bookingId,mainEventId,providerRequestIds:[],created:false,agreements:BookingPaymentAgreementDisclosure[]}` for a fresh disclosure. Current submission returns `{bookingId,mainEventId,providerRequestIds,created}` only. Its early idempotent-result branch returns that envelope before building disclosures; it does not currently return snapshots or agreements. This differs from `getBookingRefundPolicyDisclosures`, whose rolloutMode/acknowledgementsRequired/policies response remains unchanged. The following additive V2 definitions do not invent existing deployed fields.

```typescript
type BookingSelectionV2 = Omit<SubmitPackageBookingRequestInput,'agreementAcknowledgements'> & {
  sharedContractVersion:2; // required on the V2 path, not a trusted release attestation
  // Inherited eventType:string is the actual requested occasion.
  // Inherited serviceTier?:Tier and packageThemeId?:string retain current selection rules.
};
type BookingDisclosureV2Request = BookingSelectionV2;
interface PackageTermsDisclosureV2 {
  providerId:string; packageId:string; packageRevision:number; catalogRevision:number;
  preparationId:string; termsHash:string; evidenceHash:string; paymentAgreementKey:string;
  // Same resolved contractual values as the committed snapshot; not yet an agreement.
  snapshot:Omit<BookingPackageSnapshotV2,'agreedAt'>;
}
interface BookingDisclosureV2Response {
  bookingId:string; mainEventId:string; providerRequestIds:[]; created:false;
  sharedContractVersion:2;
  agreements:BookingPaymentAgreementDisclosure[]; // inherited existing typed disclosure
  packageTerms:PackageTermsDisclosureV2[]; // new; package-bearing relationships only
}
interface PackageTermsAcknowledgementV2 {
  providerId:string; packageId:string; preparationId:string;
  termsHash:string; evidenceHash:string; paymentAgreementKey:string;
}
type BookingSubmissionV2Request = BookingSelectionV2 & {
  agreementAcknowledgements:readonly {providerId:string; agreementKey:string}[];
  packageTermsAcknowledgements:readonly PackageTermsAcknowledgementV2[];
};
interface BookingSnapshotReferenceV2 {
  providerRequestId:string;
  snapshotPath:string; // providerRequests/{providerRequestId}/packageSnapshots/v2
  snapshotHash:string;
}
interface BookingSubmissionV2Response extends SubmitBookingRequestResult {
  sharedContractVersion:2;
  packageSnapshots:{reference:BookingSnapshotReferenceV2;
    snapshot:Omit<BookingPackageSnapshotV2,'agreedAt'> & {agreedAt:string};
    binding:BookingPackageEvidenceBindingApiV2}[];
}
// Logical callable signatures; all are proposals:
// getBookingPaymentAgreementDisclosures(BookingDisclosureV2Request): BookingDisclosureV2Response
// submitBookingRequest(BookingSubmissionV2Request): BookingSubmissionV2Response
```

All nonoptional fields above are required. No packageTerms entry is invented for add-on-only provider requests; exactly one entry is required per package-bearing provider relationship (currently the selected catering package). `packageSnapshots` contains exactly those committed relationships; providerRequestId must be in the inherited providerRequestIds. snapshotPath is a server-issued immutable private document reference, checked against booking association on every read; it is not a public URL. The submission response includes the committed snapshot as well as its reference. Evidence binding API timestamps follow the API type in section 8. Disclosure uses the same immutable snapshot value shape without agreedAt; agreedAt is assigned only on commit.

The existing agreement identity is `agreementKey:string` in BookingPaymentAgreementDisclosure (schemaVersion 1, timingSchemaVersion 3); paymentAgreementKey is the same string, never a new competing payment identity. Proposed V2 agreement construction includes sharedContractVersion, termsHash and evidenceHash in its trusted selection fingerprint before computing agreementKey. To avoid a hash cycle, termsHash is SHA-256 of deterministic canonical UTF-8 JSON `{schemaVersion:2,terms:<snapshot fields excluding paymentAgreementKey,termsHash,agreedAt>}`; evidenceHash is SHA-256 of the canonical evidence identities/digests or manifest tuple and cover ID defined in section 8. snapshotHash hashes the full committed snapshot including assigned agreement key/hash/time. Canonicalization sorts object keys, preserves contractual array order and uses UTC RFC3339 for timestamps; hashes are lowercase 64-character hex. This proposed hash algorithm must be approved with fixtures at freeze. No live URLs/ephemeral delivery tokens enter a changing hash: stored evidence locators are immutable trusted values; issued signed URLs are outside snapshot identity.

Submission must match both existing agreementAcknowledgements and the exact packageTermsAcknowledgements, including preparationId, provider/package identities and hashes. Server validates current disclosure and protection; new first submissions with changed terms fail TERMS_CHANGED and require fresh customer acknowledgement. Never accept caller-authored amounts/snapshots/asset identities. Booking continues to use existing clientRequestId/ledger and submissionFingerprint, not the management idempotencyKey. Fingerprint V2 includes sharedContractVersion and the new acknowledgement tuples, with deterministic relationship ordering; historical absent fields preserve the existing algorithm. Successful same-key/same-payload retry returns the originally committed snapshot/binding response (created is false per existing retry behavior), even after live edits or later stage changes; changed payload conflicts under the existing already-exists behavior. Durable original response identity/reference must be retained with the booking ledger, not limited by 30-day management retention. The V2 disclosure retry path must load the original committed disclosure (persisted with the original submission result) instead of the production early branch's bare envelope; its created remains false and providerRequestIds remains [] as in BookingDisclosureV2Response, while agreements/packageTerms come from that original disclosure. It never constructs a fresh live snapshot. Before submission, the private preparation identity is scoped to customer, clientRequestId and selection fingerprint; identical disclosure retries reuse the same ready evidence identities. Submission looks up the acknowledged preparation, never generates replacement evidence IDs for hash comparison. V2 extensions apply only to package requests; existing legacy/custom-menu responses remain unchanged. Unverified older clients remain blocked by section 6's release gates; sharedContractVersion alone does not bypass them.

| Callable error | Stable `details.reason` / rejection |
| --- | --- |
| `unauthenticated` | Missing auth; invalid/missing App Check rejected by platform enforcement |
| `permission-denied` | NOT_OWNER (non-private resources), ADMIN_REQUIRED |
| `invalid-argument` | UNKNOWN_FIELD, INVALID_OCCASION_SELECTION, INVALID_NAME, INVALID_INCLUSION, INVALID_PRICE, INVALID_CURSOR, UNSUPPORTED_FORMAT, INVALID_SERVICE_CATEGORY, INVALID_EDITOR_PROGRESS, EDITOR_DRAFT_TOO_LARGE, INVALID_CAPABILITY_CHANGE, INVALID_REVIEW_TARGET, INVALID_REVIEW_REASON, client financial/snapshot fields |
| `failed-precondition` | OCCASION_INACTIVE, PROVIDER_OCCASION_INELIGIBLE, UNIVERSAL_REVALIDATION_REQUIRED, CLIENT_UPGRADE_REQUIRED, FEATURE_DISABLED, RESERVATION_EXPIRED, ASSET_NOT_READY, ASSET_REFERENCED, TERMS_CHANGED, PROVIDER_NOT_APPROVED, PROVIDER_STATUS_INVALID, DRAFT_REQUIRED, EDITOR_DRAFT_COMPLETED, SUGGESTION_NOT_PENDING, EVIDENCE_NOT_READY, EVIDENCE_BINDING_MISMATCH, CONFIG_UNAVAILABLE |
| `aborted` | REVISION_CONFLICT (editor and/or canonical base revision included), TRANSITION_CONFLICT; re-read before retry |
| `already-exists` | IDEMPOTENCY_CONFLICT, CATALOG_NAME_CONFLICT |
| `resource-exhausted` | RATE_LIMITED, UPLOAD_CONCURRENCY_LIMIT, STORAGE_QUOTA_REQUIRED, STORAGE_QUOTA_EXCEEDED |
| `not-found` | RESOURCE_NOT_FOUND for missing or inaccessible private editor draft/bound private package/media identity; identical response, no existence leakage. Existing non-private owned-target behavior remains unchanged. |
| `unavailable` | VERIFICATION_UNAVAILABLE for retryable external verification/job failure |

Preserve existing booking PACKAGE_UNAVAILABLE, PACKAGE_CONDITIONS_INVALID, guest-bound and EVENT_TYPE_NOT_SUPPORTED codes, financial errors and payment rejection semantics. Optional error metadata: safe field, currentRevision, retryAfterSeconds.

This table plus explicitly listed guarded-operation reasons in section 4 is the authoritative proposed V2 callable mapping. PROVIDER_NOT_APPROVED always maps to failed-precondition: `authorizeProviderForPackageManagement` in package-domain.ts already uses failed-precondition for an owned provider that is not operationally approved; wrong ownership is permission-denied. Production does not emit this new symbolic reason there; adding it is a proposal, not a deployed behavior change. Existing missing user, missing provider and ownership codes remain as implemented. Likewise existing service-category-policy.ts distinguishes malformed input (invalid-argument) and unavailable categories (failed-precondition); V2's unified INVALID_SERVICE_CATEGORY (unknown/inactive filter or invalid capability/category input) is proposed invalid-argument only on new V2 boundaries, not a rewrite of existing validators.

Editor error precedence: authenticate/authorize caller's provider first; unapproved provider gives failed-precondition PROVIDER_NOT_APPROVED; then conceal missing/foreign private target as not-found RESOURCE_NOT_FOUND. Malformed save JSON/enums/bounds or strictly invalid completion values give invalid-argument INVALID_EDITOR_PROGRESS; size over 128 KiB gives invalid-argument EDITOR_DRAFT_TOO_LARGE. Unfinished business fields are valid saved progress; completing them fails INVALID_EDITOR_PROGRESS with safe field metadata, never a partial canonical write. Specific canonical validation errors retain their named mappings (INVALID_PRICE/INVALID_OCCASION_SELECTION/INVALID_SERVICE_CATEGORY: invalid-argument; DRAFT_REQUIRED/ASSET_NOT_READY/FEATURE_DISABLED/CLIENT_UPGRADE_REQUIRED/CONFIG_UNAVAILABLE: failed-precondition). A save/complete targeting an already completed draft with a new key gives failed-precondition EDITOR_DRAFT_COMPLETED; the successful original key replays. Editor revision, expectedPackageRevision/base revision or immutable binding mismatch gives aborted REVISION_CONFLICT. Existing canonical payment/category errors delegated during completion keep their production callable code; do not relabel a production failed-precondition as invalid-argument. Unexpected infrastructure completion failure returns internal with no new business reason and no partial commit; it is not a catch-all validation success or permission bypass. Every named editor reason is mapped here; no ambiguous EDITOR_COMPLETION_FAILED catch-all is introduced.


## 4. Validation Rules

### Provider capability management - proposed exact contract

Source review: `review-provider-verification.ts` reviews verification/status and visibility; registration/onboarding collect `eventTypesSupported`, while business-profile updates preserve existing capability values. None is an administrator delta/revision contract for occasion grants/revocations. Recommend a dedicated operation using the existing server administrator role/audit infrastructure, rather than changing verification review semantics. Verification approval alone must not grant new dynamic capabilities; migration must explicitly review existing values.

```typescript
interface UpdateProviderOccasionCapabilitiesRequest {
  providerId: string;
  approveOccasionIds: OccasionId[];
  revokeOccasionIds: OccasionId[];
  expectedProviderEligibilityRevision: number;
  expectedCatalogRevision: number;
  reason: string; // trimmed minimum 10, maximum 500 Unicode code points; no controls/invisible formatting; PROPOSED pending Gabriel confirmation
  idempotencyKey: string;
}
interface ProviderCapabilityChangeResult {
  operationId: string;
  providerId: string;
  state: CatalogTransitionState;
  providerEligibilityRevision: number; // committed revision, or base before commit
  eventTypesSupported: OccasionId[]; // committed full approved set in catalog order
  catalogRevision: number;
  revalidationJobId: string;
  affectedPackageCount: number | null; // null until inventory complete
  failureReason: string | null;
}
// updateProviderOccasionCapabilities(request): ProviderCapabilityChangeResult
// getProviderOccasionCapabilityChange({operationId:string}): ProviderCapabilityChangeResult
```

Both endpoints require authenticated, App-Check-verified active platform administrator authority. Mutation uses common idempotency; read has none. Validate provider existence and identity, active approved operational status for grants, and current canonical provider categories. Revocations remain available to administrators for suspended/inactive providers to remove authority without restoring status. Require unique disjoint arrays, at least one actual change, existing IDs, and safe revisions. Grants require active approved occasions applicable to at least one approved provider category; revoking an already-held inactive ID is permitted. Reject unknown IDs, redundant grants/revocations or overlap with INVALID_CAPABILITY_CHANGE. This never changes provider verification, categories or ownership. Unreviewed onboarding claims cannot become grants.

Serialize through the catalog/eligibility coordinator with fencing and provider eligibility generation. Persist server-only `providerOccasionCapabilityChanges/{operationId}` with common metadata, request hash, actor/reason, before/target sets, base revisions, evidence/checkpoints and result. Prepare affected-set coverage (including legacy scalar, specific and every all package); stage resulting capabilities, withdraw affected packages through predicates honored by all supported readers, then verify withdrawal before committing the set/revision and audit/outbox in one guarded transaction. No large package update is assumed atomic. Gateway/booking/write guards fail closed on the fenced provider throughout preparation; unsupported direct readers require verified existing visibility withdrawal. If withdrawal cannot be established, remain blocked and keep provider public access blocked through a verified existing barrier. An uncommitted revocation is never reported successful.

On commit increment providerEligibilityRevision once and advance eligibility generation; catalog revision is unchanged. Rebuild against current provider/catalog/package revisions. Specific packages retaining a revoked ID become review_required with empty membership; all packages require every currently applicable active ID and are blocked as a whole if any is missing. Preserve historical scalar and existing bookings, never remove selected IDs automatically. Grants do not automatically restore publication or publish drafts. Restore only independently valid packages with existing publication authorization and compatible readers; completed requires verified coverage. Concurrent changes invalidate checkpoints; failures leave packages withdrawn and resume the durable operation. Replay returns original operation result; poll for current progress. Retention expiry never creates a duplicate in-progress operation.

Capability reason validation failures use invalid-argument INVALID_CAPABILITY_CHANGE. After trimming, count Unicode code points (not UTF-16 code units); minimum 10 and maximum 500 inclusive, with no controls/invisible formatting. This replaces the ambiguous separator as a proposed range, not evidence of prior approval. Existing provider-tax-profile-domain.ts uses a rejection minimum of 10 and a maximum of 1000 UTF-16 code units; no existing occasion-capability reason validator exists, so that different domain does not authorize this bound. Gabriel must confirm 10/500 and the code-point unit at freeze.

Audit each state transition once, including actor, reason, before/after sets and revisions, affected counts and correlation identity. Common errors apply, plus invalid-argument INVALID_CAPABILITY_CHANGE/INVALID_SERVICE_CATEGORY; failed-precondition PROVIDER_NOT_APPROVED, PROVIDER_STATUS_INVALID, WITHDRAWAL_INCOMPLETE, COMPATIBILITY_UNVERIFIED; aborted REVISION_CONFLICT/TRANSITION_CONFLICT; unavailable VERIFICATION_UNAVAILABLE. Capability grants are never a side effect of suggestion approval, mapping or occasion activation.

### Private incomplete editor progress - proposed exact contract

Current `create-provider-package.ts` and `update-provider-package.ts` parse complete canonical writes, validate offer/payment/category/capabilities and approved ownership; update requires an owned draft. Create and update enforce non-public draft flags. The current form uses React useState, uploads media before calling those complete saves, and has no server-backed unfinished wizard persistence. Save Readiness separates missing information from backend compatibility; it cannot authorize a partial save. Recommend a separate resource so incomplete values cannot weaken canonical validation.

```typescript
interface PackageEditorProgressV2 {
  // All fields optional; empty text and unfinished numeric text are allowed.
  name?: string; description?: string; serviceCategoryCode?: string;
  occasion?: {occasionSchemaVersion:2; occasionScope?:'specific'|'all'; occasionIds?:string[]};
  pricingModel?: 'legacy'|'per_pax'|'per_bundle';
  priceText?: string; minimumGuestsText?: string; maximumGuestsText?: string;
  tiers?: Partial<Record<Tier, {enabled:boolean; priceText:string;
    includedServices:string[]; decorInclusions:string[];
    furnitureInclusions:string[]; equipmentInclusions:string[]}>>;
  foodInclusions?:string[]; serviceInclusions?:string[];
  decorInclusions?:string[]; furnitureInclusions?:string[]; equipmentInclusions?:string[];
  themes?: {editorThemeId:string; name:string; description:string; assetIds:string[]}[];
  marketingAssetIds?:string[];
  paymentPolicy?: 'full_payment'|'deposit_then_balance'; depositPercentageText?:string;
}
interface PackageEditorDraftV2 {
  editorSchemaVersion:2;
  editorDraftId:string; providerId:string; packageId:string|null;
  basePackageRevision:number|null;
  state:'incomplete'|'completed'; progress:PackageEditorProgressV2;
  currentStep:0|1|2|3|4;
  completedPackageId:string|null; completedPackageRevision:number|null;
  revision:number; createdAt:Timestamp; updatedAt:Timestamp;
}
interface SavePackageEditorDraftRequest {
  editorDraftId:string|null; // null creates; server allocates ID
  expectedRevision:number; // 0 for create, otherwise current saved revision
  packageId:string|null; // immutable binding; null for new package
  expectedPackageRevision:number|null; // required current revision for a bound draft
  editorSchemaVersion:2; currentStep:0|1|2|3|4;
  progress:PackageEditorProgressV2; // full replacement, omitted fields clear progress only
  idempotencyKey:string;
}
// saveProviderPackageEditorDraft(request): {draft:PackageEditorDraftV2}
// getProviderPackageEditorDraft({editorDraftId:string}): {draft:PackageEditorDraftV2}
interface CompletePackageEditorDraftRequest {
  editorDraftId:string; expectedRevision:number;
  expectedPackageRevision:number|null;
  idempotencyKey:string;
}
// completeProviderPackageEditorDraft(request):
// {editorDraftId:string,editorDraftRevision:number,packageId:string,
//  packageRevision:number,status:'draft'}
```

Persist only in private `providerPackageEditorDrafts/{editorDraftId}` with server metadata/ownership. All operations require auth, App Check and current approved provider ownership; bound package operations also require ownership and draft-only state, including reads of resumed progress. Server denies direct client writes and public collection reads. Common mutation idempotency applies to save/complete; get is owner-only without a key. Unknown fields/unsupported schema fail UNKNOWN_FIELD/CLIENT_UPGRADE_REQUIRED. Strictly validate JSON structure, enum/types, safe text (plain text, no controls), nesting and bounded storage even though business completeness is not required. Proposed storage bounds: 128 KiB canonical UTF-8 JSON progress; name/theme name 80 code points, description 5,000, theme description 500, numeric text 64, category/ID strings 128, <=50 entries/group and <=160 code points/entry, 12 themes, eight marketing assets, active four-image theme cap. These are editor storage bounds, not relaxed canonical acceptance; configured stricter limits prevail. Occasion IDs may be unfinished/ineligible but remain structurally bounded by effective policy; saving them never grants eligibility. Missing required policy fails CONFIG_UNAVAILABLE; no arbitrary map, binary, file object, URL or Cloudinary identity input is allowed.

Server allocates IDs, increments revision once per successful save and records basePackageRevision. Resume returns exact saved progress/revision; clients reconcile conflicts by rereading, never blind overwriting. Binding and package base revision must match; concurrent canonical edit yields REVISION_CONFLICT and requires explicit refresh/rebase. Completed editor drafts are immutable; subsequent editing creates a new editor draft. Reject old writers rather than discarding unknown v2 state. Existing completed legacy saves through create/update remain unchanged; the proposed V2 canonical revision adapter assigns an initial revision under CAS for legacy records that lack one before bound-editor use.

Completion reads the stored revision, converts numeric text strictly and runs the full current canonical create/update validators plus V2 catalog/capability/media/payment checks. Atomically create/update the owned non-public canonical draft and mark the editor record completed with package identity/revision and idempotency result. Any failure leaves progress intact and writes no partial package; errors include INVALID_EDITOR_PROGRESS, EDITOR_DRAFT_TOO_LARGE, INVALID_PRICE/INVALID_OCCASION_SELECTION, DRAFT_REQUIRED, ASSET_NOT_READY, REVISION_CONFLICT and existing ownership/feature errors. Completion cannot publish, bypass canonical-pricing restrictions or count an incomplete occasion tuple as valid.

Assets must already have trusted owner-scoped verified registry identities under the existing approved upload path; this proposal does not create a draft-upload API or relax reservations requiring a canonical draft package/theme. Local pending files require reselection after reload until such a separately approved upload contract exists. Referenced assets gain authoritative `AssetReference.kind:'editor_draft'` records with deterministic targets, attached/detached atomically with progress and protected against deletion. The kind union above includes this private reference type; no external locator is accepted. Completion transfers/adds canonical references before dropping editor references. Abandoned drafts remain private; cleanup/expiry requires approved policy and live reference checks, never TTL deletion of assets or invented retention defaults. Unconfigured cleanup retains references and reports resource usage; quotas still block additions.

Frontend actions are separate: **Save progress** invokes save without asserting canonical readiness; **Save package draft** uses complete (or existing complete create/update for legacy editors) and requires full current server validation; **Publish** remains the existing separately authorized publication flow with all current gates. Save Readiness must display progress-saved versus validated-draft-saved accurately and surface revision/compatibility failures. No new public eligibility follows from either save action.

### Occasion lifecycle

Admin reviews, approves, rejects or maps suggestions; approval and public activation are separate operations. Backend owns eligibility validation and the server-maintained `occasionMatchIds` projection. New occasion activation requires explicit Backend, Customer Web and Flutter Mobile compatibility verification. Adding or activating occasions triggers revalidation, never automatic provider capability grants. Fits All Occasions requires approval for every applicable active occasion; preserve legacy `eventType` compatibility.

Only complete absence of v2 occasion fields permits recognized legacy scalar fallback to specific singleton. Partial tuple, unsupported version, wrong types, unknown IDs or conflicting scope is malformed: reject writes, show repair state privately, exclude publicly and reject booking. Never silently drop IDs or fall back from malformed v2. Specific IDs are canonicalized into catalog order after uniqueness checks. Validate catalog and provider capabilities on every create/edit/publish/booking; legacy fallback also requires active, eligible ID at booking.

All scope is universal only within applicable category, not a copy of today's selections. New catalog approval creates an inactive record, increments its revision and the global catalog revision, and never grants provider capabilities. A revision change alone does not make an occasion active; A includes only active records. Activation is a separate administrator action after the checks below, not a side effect of suggestion review. Revalidate universal eligibility on catalog/applicability/capability changes. If any applicable active occasion lacks provider approval, block the whole all package, clear discovery membership and require review; never silently convert it to specific. Deactivations also trigger specific-package revalidation. Existing bookings remain valid historical agreements.

Projection jobs are resumable and revision-guarded. Booking always revalidates independently. Server discovery compares catalog/provider revisions and revalidates or excludes stale candidates before return. Direct mobile Firestore queries cannot guarantee this transition: upgraded discovery uses the server gateway. For old public readers, catalog changes require a withdrawal barrier: stage change, withdraw affected packages, verify withdrawal, activate catalog, rebuild, restore only valid compatible packages. If safe withdrawal cannot be guaranteed, activation remains blocked. An asynchronous job alone is insufficient protection.

Before activating a new occasion or changed applicability, stage the proposed active catalog and capture its base catalog/provider revisions. Revalidate affected providers' explicitly approved capabilities and all affected packages against that proposed catalog; providers missing capability remain unapproved, and affected all packages must be withdrawn with empty membership and review-required state. Complete and verify the withdrawal barrier for every supported public reader before switching the active catalog. Readiness requires available indexes, authorized gateway queries, compatible Web/Flutter readers or an enforceable compatibility projection/version gate, and verified stale-candidate exclusion. Atomically guard activation against the captured revisions, set `active: true`, increment the occasion and global catalog revisions, and invalidate catalog caches. Rebuild projections against the activated catalog and current provider revisions while packages remain withdrawn; restore only independently verified valid, compatible packages. Concurrent catalog/capability changes require revalidation before activation or restoration. Failed revalidation, unverified withdrawal or missing discovery readiness keeps activation blocked. Gabriel's separate public-release approval and all publication/booking gates still apply.

### Guarded catalog operations - exact proposed freeze contract

Names in this subsection are pending Gabriel's final approval. `active` is never accepted in generic catalog patches or moderation inputs. Catalog changes affecting eligibility share one serialized coordinator; metadata-only changes still increment revisions. Approved inactive full records are readable privately by authorized moderators, hidden from public catalog and provider selection. The owner-authorized exact-match submission response may return only SuggestionCatalogMatch for an inactive identity, as section 3 explicitly allows; this is not a selectable catalog listing.

```typescript
type CatalogTransitionState = 'preparing' | 'withdrawn' | 'committed' | 'rebuilding' | 'completed' | 'blocked';
interface OccasionTransitionRequest {
  occasionId: OccasionId;
  expectedRevision: number; // occasion record
  expectedCatalogRevision: number;
  releaseApprovalId: string; // backend resolves protected evidence, not a readiness assertion
  reason: string;
  idempotencyKey: string;
}
interface OccasionTransitionResult {
  operationId: string;
  occasionId: OccasionId;
  action: 'activate' | 'deactivate';
  state: CatalogTransitionState;
  occasionRevision: number;
  catalogRevision: number;
  revalidationJobId: string;
  failureReason: string | null;
}
// activateGlobalOccasion(OccasionTransitionRequest): OccasionTransitionResult
// deactivateGlobalOccasion(OccasionTransitionRequest): OccasionTransitionResult
// getOccasionTransition({operationId:string}): OccasionTransitionResult
```

Both mutations require authenticated, App-Check-verified platform administrator authority under FEASTA's existing server role model; possession of a record ID is no authority. The read is admin-only. A protected `occasionTransitions/{operationId}` job stores the result plus actor, base revisions, affected-set/checkpoint hashes, evidence IDs, reason and server timestamps. It has common revision metadata. APIs serialize timestamps as specified above. Initial response can be preparing/blocked; completed is reported only after restoration verification. A repeated key returns the original operation identity/result; poll the read for current progress. Different payload under the same key conflicts. An in-progress transition must be resumed rather than recreated after idempotency retention expires; durable transition identity prevents duplicate commits.

Backend-managed release evidence must bind target occasion/proposed catalog hash, deployed backend validator and eligibility versions, Customer Web build, Flutter supported build range and old-client strategy, rules/index readiness, discovery projection/gateway checks, test results, withdrawal verification and separate authorized release approval. Evidence includes issuer, immutable artifact/hash, environment, verified time, approved validity window and revocation status. Trusted release automation and authorized release approvers write evidence; callers cannot supply readiness booleans, self-attest checks or repoint artifacts. Backend verifies deployed artifacts and live index/read-path readiness against the attestation; missing, expired, revoked or mismatched evidence blocks. Gabriel must approve evidence issuers, validity windows and release authority before implementation.

Activation requires an approved existing inactive occasion, explicit administrator request, backend catalog/eligibility readiness, universal-package revalidation or verified withdrawal, Web and Flutter/old-client compatibility, ready indexes/projections, and unchanged publication/booking safeguards. Already-active requests with a new key fail precondition; replay of the successful key remains successful.

No cross-service atomic transaction is assumed. Prepare immutable target catalog and affected-set plan, acquire coordinator lease/fencing token, and persist resumable checkpoints. Withdraw every affected package through predicates actually honored by each supported reader, including scalar readers; verify the barrier before commit. In one Firestore transaction compare occasion/global revisions, current evidence and fencing token, record the committed transition, change active state and bump revisions with audit/outbox. Capability/package mutations concurrent with preparation invalidate affected checkpoints; transactionally maintained eligibility generation guards the commit. During transition, writes/publish/booking affecting the fenced set revalidate against the coordinator or fail closed. Gateway excludes pending/stale generations; legacy readers require verified withdrawal. Restore each package only with current package/provider/catalog revisions and existing publication authorization, atomically publishing its correct membership; never publish a draft as a side effect. Completed requires verified rebuild coverage. Failures before commit leave the old catalog with affected packages safely withdrawn; failures after commit leave the new catalog with affected packages withdrawn until retry. Workers use leases, CAS and bounded retry/backoff; a crash cannot expose a half-prepared catalog. Audit each state change once by operation/state identity, including actor, reason, revisions, evidence hashes and affected counts.

Deactivation uses the same request/result, role, evidence and revision guards, allowing an approved emergency rollback evidence bundle under a separately approved release procedure. Stage the catalog without the occasion, withdraw affected specific and universal packages, commit inactive + revision changes atomically, rebuild membership without the ID and restore only still-valid packages. Specific packages containing an inactive ID require repair; never silently drop it. Universal packages are revalidated against remaining active applicability; empty applicability remains invalid. Deactivation never deletes identities, capabilities, booked evidence or agreements. Rollback of a committed activation is a new audited deactivation, never a revision rewind. If external legacy readers cannot be withdrawn, keep public access blocked through a verified existing visibility barrier; no unsafe transition is authorized.

Additional stable errors: `failed-precondition` reasons OCCASION_NOT_APPROVED, ALREADY_ACTIVE, ALREADY_INACTIVE, RELEASE_EVIDENCE_INVALID, COMPATIBILITY_UNVERIFIED, INDEX_NOT_READY, WITHDRAWAL_INCOMPLETE, CONFIG_UNAVAILABLE; `aborted` REVISION_CONFLICT or TRANSITION_CONFLICT; `unavailable` VERIFICATION_UNAVAILABLE. Existing authorization, not-found and idempotency errors apply. Blocked jobs retain safe checkpoints and failureReason; remediation resumes the same operation only after fresh evidence/revalidation. Changed base revisions require a new guarded request, leaving the old operation blocked/superseded in audit.

### Configurable validation policy

Proposed protected source: `contractPolicies/providerPackageV2`, server-written only by authorized configuration administrators, with monotonic revision, effective environment, approved release reference and audit. Fields include `maxSpecificOccasions` (initial 10), `maxPendingSuggestionsPerProvider` (initial 3), and `maxThemeImages` (future target 50), plus explicit enabled feature gates and required media/evidence budgets. These are deployment settings, not immutable schema bounds. Backend validates policy types/ranges and pins policy revision in each mutation; counters include concurrent pending submissions and reserved gallery slots. Provider UI receives only sanitized effective limits/revision and displays remaining capacity and server validation errors; cached UI values cannot authorize writes.

Absent or disabled V2 policy preserves current production behavior, including four images/theme. No expanded path inherits an unlimited or guessed default. If an enabled operation needs missing, invalid or stale required policy/budget, reject CONFIG_UNAVAILABLE (or existing quota-required error for media), without relaxing legacy validation. A trusted last-known policy is usable only within an explicitly approved validity window; otherwise fail closed. Lowering a limit never truncates saved data or historical contracts: block additions, allow safe removals under existing draft rules, and require review for publish eligibility. Duplicate/inactive/unauthorized IDs, malformed tuples, capability checks and recognized legacy validation remain independently enforced.

### Suggestion lifecycle

Require authenticated approved provider owner and App Check. Normalize Unicode NFKC, trim, collapse whitespace, locale-independent lowercase; reject controls/invisible formatting, empty names and unsafe input. Render plain text. Proposed name length 2–80 Unicode code points; optional submission reason is trimmed plain text, maximum 500 Unicode code points, with empty text normalized to absence; reject controls/invisible formatting. Review reason is separately required by section 3. Compare exact normalized labels/aliases, including inactive catalog entries; private `occasionNameKeys/{hash}` transactionally reserves uniqueness. Fuzzy matches only inform reviewers, never auto-map. Inactive conflicts require admin review/reactivation.

Own duplicates and exact approved catalog matches return the precise section 3 variants; catalog matches take precedence and create no suggestion, including inactive matches requiring separate activation. Do not expose another provider's suggestion. Proposed five new submissions/provider/rolling 24h, maximum three pending; retries/own duplicates do not consume additional slots. Review follows the four section 3 branches: only approve_new reserves new names, creates an inactive catalog record and increments catalog revision; approve_existing_inactive reuses the unchanged inactive identity. Every branch checks pending/revisions and atomically transitions the suggestion with audit/outbox. Concurrent reviewers cannot both approve. Mapping requires an active applicable target. Rejection requires explanation. Status retrieval is sufficient initially; optional notification worker deduplicates by outbox ID. Pending/rejected suggestions never enter catalog selection or discovery; approved/mapped targets still require capability approval.

### Tier resolution and money

The numeric pricing and guest-count bounds below are proposed targets subject to Gabriel's final approval and all existing validation constraints. Apply any stricter current constraint; these values do not expand currently accepted inputs or authorize canonical pricing, publication or booking.

Each group permits <=50 raw entries, <=160 characters after trim/whitespace collapse; reject wrong types, blank/control entries. Stable dedupe key is Unicode NFKC + whitespace collapse + locale-independent lowercase; keep first display wording. Enforce raw count before dedupe. No cross-category dedupe and no heuristic migration of legacy wording.

Services = dedupe(shared serviceInclusions + selected includedServices); decor/furniture/equipment use shared + selected corresponding field. Shared first, effective category <=100 entries. Absent optional and empty arrays both contribute nothing; empty tier list cannot subtract shared promises. No tier inheritance or union with other tiers. New tiered catering requires >=1 enabled tier; historical no-tier packages retain standalone legacy price and null tier. Selected tier is required whenever options exist. Unknown/disabled tier, malformed options or invalid price fail closed, never fall back to cheaper base price.

Customization selections must belong to the effective selected-tier lists, with existing food rules unchanged. Tier switches clear/revalidate incompatible selections; service filters resolve selected tier rather than union all options. Equipment is an inclusion, not a new priced add-on. Legacy shared text remains intact but needs provider review before tier-isolated v2 publication; do not infer that Buffet-only wording belongs elsewhere.

V2 PHP prices: positive, <=10,000,000, <=2 decimals, finite; convert once to safe integer centavos, reject excess precision/overflow. Preserve any stricter existing legacy validation. Guests integer 1–100,000 within min/max, min <= max. Per Pax = selected unit centavos × guests; Fixed Bundle (`per_bundle`) = selected unit once. Absent model preserves fixed legacy calculation. Starting price = minimum enabled unit price, otherwise standalone price, labeled with unit/model and guest assumptions. Occasion/theme do not change it. Add-ons and payment totals remain independently server-validated. Formula specification does not lift canonical draft-only restrictions.

### Gallery lifecycle and resources

Retain the approved Cloudinary paginated asset registry. The proposed initial rollout target is 50 images/theme, with configurable server-enforced capacity and no permanent 20-image or 50-image schema restriction. Preserve the existing four-image limit across UI, reservations and backend validation until coordinated activation is authorized. The 50-image target must remain inactive until Gabriel confirms Cloudinary account capacity, provider/global quotas, file-size limits, upload concurrency and customer compatibility, including Customer Web and Flutter Mobile. Continue thumbnails, compression, pagination, lazy loading, ownership-verified reservations, safe retries, reference-aware deletion and controlled parallel uploads within approved storage quotas.

The proposed 40 MP decoded ceiling, 2400px downscale, 320/960/1600px derivatives, three concurrent reservations and reservation timing are subject to existing validation constraints and Gabriel's final approval. Preserve stricter current limits, including the current four-image cap and upload size/format/rate checks; these processing and concurrency proposals authorize no capacity increase.

Reserve under approved ownership and writable draft state; transactionally reserve bytes and an upload slot. Proposed three concurrent reservations/provider across devices, 15-minute expiry. Sign only server-generated owner-scoped public ID and image resource; no arbitrary URL imports.

Server verifies Cloudinary identity/account/path, actual decoded format, bytes, dimensions and completion using trusted API or authenticated webhook, not browser claims. Proposed decoded ceiling 40 megapixels. Verify externally before Firestore transaction; never call external APIs inside retried transactions. Finalize idempotently attaches asset, membership, reference, count and initial cover. Failed attachment leaves tracked orphan. Duplicate finalize/webhook returns the same membership.

Order by position ASC then ID ASC. Cursor binds gallery revision; reorder requires restart with REVISION_CONFLICT. Server assigns spaced integer positions and rebalances under revision guard; large work uses bounded worker jobs. Cover must be ready membership in same gallery. Removing cover selects first remaining image or null. Legacy projection puts cover first.

Detach membership/reference atomically. Worker can mark asset deleting only when authoritative references are absent; attachment rejects deleting state. Recheck references before idempotent Cloudinary destroy, then tombstone. Counter alone is insufficient. Crash after destroy safely resumes. Booking references always protect assets despite theme/package removal. No direct client destroy permission.

Reservation status supports reload/retry; retain successful asset IDs and retry only pending files. Expired reservation cannot accept fresh upload/finalization. Reconciler verifies uploads completed before expiry and safely renews authorization or queues cleanup. Proposed orphan grace 24h, no references before deletion; TTL must not bypass cleanup. Retry with bounded exponential backoff, dead-letter alerts and reserved/used-byte reconciliation.

| Resource | Confirmed existing | Proposed initial | Gabriel/account confirmation |
| --- | --- | --- | --- |
| Capacity | Four images/theme, 12 themes | Provisional 50 images/theme via configurable server capacity; keep four until coordinated activation is authorized | Cloudinary capacity, provider/global quotas, file size, concurrency and customer compatibility; no permanent 20/50 schema limit |
| Input | JPEG/PNG/WebP, <=5 MiB picker | Same size/formats server-verified; reject SVG/GIF; 40 MP decoded ceiling | Upload/preset and processing capacity |
| Processing | Existing Cloudinary URLs | Optional client downscale <=2400px longest edge; server orientation/metadata processing; thumbnails/detail 320/960/1600px with allowlisted format/quality | Eager/on-demand costs, private source retention and visual quality |
| Concurrency | No new global guarantee established | Three/provider; 15-minute reservation | Tune after load review |
| Pagination | Inline four-image readers | Default 24/max 48; lazy thumbnails | CDN/derived asset bandwidth/storage budget |
| Rate/storage | Service signature 30/10min; generic signature 20/10min | No weaker applicable existing rate, plus reservations and byte checks | Daily count/bytes, provider/global stored-byte quotas unset until approved |
| Recovery | No scalable lifecycle established | 24h orphan grace, resumable sweeps | Booking retention, backups and costs |

No production storage quota is invented or capacity assumed unlimited. Future scalable reservation fails closed while required approved provider/global byte/count budgets are unset. Include reserved + used bytes, transformation credits, derived assets, verification API volume and bandwidth in capacity review. Compression is an optimization, not validation. Disallow user-authored transformation strings; rate-limit reads/derivatives. Never load the full scalable gallery into one Firestore document or response.

### Illustrative Cloudinary resource planning - assumptions, not account usage

This arithmetic is a planning example only. It does not assert FEASTA's plan, credits, measured traffic, transformation billing rules or production cost. MiB = 1,048,576 bytes; delivery sizes below are assumed averages, not upload policy. Gabriel must verify actual originals/derivatives, account metering, cache behavior and billing before approving capacity.

Assume one full 50-image gallery; average original 3 MiB; one 0.06 MiB thumbnail and two optimized display variants of 0.25/0.60 MiB per source. Assume each variant is generated once and physically retained for the storage illustration. No evidence copies, backups, alternative codecs, regeneration or metadata overhead are included.

| Resource | Formula | Illustrative result |
| --- | --- | --- |
| Original storage | 50 * 3 MiB | 150 MiB/gallery |
| Thumbnail storage | 50 * 0.06 MiB | 3 MiB/gallery |
| Optimized display storage | 50 * (0.25 + 0.60) MiB | 42.5 MiB/gallery |
| Combined retained storage | 150 + 3 + 42.5 | 195.5 MiB/gallery |
| Initial generated variant outputs | 50 * (1 thumbnail + 2 display variants) | 150 outputs; not a claim of 150 billed credits |
| One full browse | 50 thumbnails + 10 medium views + 2 large views | 3 + 2.5 + 1.2 = 6.7 MiB/session |
| 1,000 such browses | 1,000 * 6.7 MiB | 6,700 MiB, about 6.54 GiB delivered |
| First 24-thumbnail page only | 24 * 0.06 MiB | 1.44 MiB, excluding app/API traffic |

For G equally full galleries: source storage = G * 150 MiB; illustrative retained derivative storage = G * 45.5 MiB. Multiply source/variant outputs by additional formats, qualities, crops or regenerated versions actually generated. On-demand derivatives may reduce unused outputs but require verified transformation throttling and delivery behavior; thumbnails consume delivery bandwidth whether eagerly or lazily generated. Transformation metering must be mapped to the account's actual rules rather than equating outputs to credits.

For V views and browser byte-cache hit fraction h, approximate client transfer = V * 6.7 * (1-h) MiB under this viewing pattern (h=0.4 gives 4,020 MiB for 1,000 views). This simplification assumes cached bytes need no retransmission; revalidation/network overhead is excluded. CDN edge hits reduce origin generation/fetch work but can still count as delivery to clients; never subtract edge cache hits from billable delivery without account verification. Signed URL churn, expiry, private evidence and cache-control change reuse. Measure browse depth, repeat views, device formats and hit rates before sizing budgets.

Protected booking evidence adds separate unique-source storage, variants, authorized delivery and retention; count each protected copy and retained version rather than assuming gallery references are free. Reserved bytes, temporary/orphan uploads and recovery copies also need headroom. Actual per-file size, decoded dimensions, parallel upload capacity, provider/global storage quotas and transformation/delivery budgets remain open account-dependent decisions. The four-image production cap stays enforced.

## 5. Authorization and Security

Backend is authoritative for every validation. Client feedback never authorizes a write. Mutations require auth and App Check. Provider management mutations retain existing approved-owner checks; admin review/catalog operations require the active server-verified admin role, not provider ownership. Booking operations retain their existing customer/party checks. Public reads expose only active catalog and visible published galleries; drafts owner/admin only. Protected booking evidence always requires booking-party/admin authorization even when the original design is public. Suggestions/reservations private; historical booking assets restricted to authorized booking parties when no longer public.

Future rules deny direct client writes to catalog, suggestions, projections, media, memberships, references, audits and immutable snapshots. Admin SDK gateways must enforce their own read authorization. Keep Cloudinary secrets server-side, signatures short-lived/owner-scoped. Append-only audit includes actor/action/reason, before/after revision, server time and correlation ID. Never log raw credentials.

Required future indexes, **not changed here**:

- Package discovery retains equality predicates `isActive=true,isPublished=true,providerPubliclyVisible=true,status=published,isDeleted=false`, adds `occasionEligibilityState=valid`, uses `occasionMatchIds array-contains selectedId`, and orders `createdAt DESC,__name__ DESC`. Composite fields: equality fields ASC, membership CONTAINS, then ordered tuple. Separate no-occasion index omits membership. Retain old scalar index during compatibility. One projection query covers all/specific, naturally deduped by document ID; no OR union. Preserve bounded candidate scans (48 candidates/12 results), advancing cursor over rejected stale candidates.
- Suggestions: `(providerId ASC,createdAt DESC,__name__ DESC)`, same with status ASC after providerId; admin `(status ASC,createdAt ASC,__name__ ASC)`.
- Gallery images `(position ASC,__name__ ASC)`; reservations `(state ASC,expiresAt ASC,__name__ ASC)`; assets `(state ASC,updatedAt ASC,__name__ ASC)`; references `(assetId ASC,kind ASC,__name__ ASC)`; catalog `(active ASC,sortOrder ASC,__name__ ASC)`, with applicability filtering in bounded gateway.
- Match collection/collection-group scope to actual worker queries; no broad collection-group client access. Exempt unqueried inclusion arrays, URLs, snapshot payloads and audit detail. Validate exact definitions in emulator/staging; preserve unrelated indexes.

## 6. Legacy Compatibility

| Consumer | Guarantee | Limitation/gate |
| --- | --- | --- |
| Old Customer Web scalar equality | Real primary string retained | Only primary occasion discovers multi/all; secondary discovery is impossible via scalar alone. Old display may misstate scope. |
| Old Flutter String eventType/scalar query | No array substitution, parser shape retained | Same primary-only discovery; provider matching is not package eligibility; tier/equipment/gallery parity not assumed. |
| Old theme consumers | First four ready images projected, cover first | Later images unavailable; approve preview-only behavior explicitly or gate client. Canonical membership never truncated. |
| Legacy no-v2 package | Recognized scalar reads/backfills as singleton; missing optional tiers contribute nothing | Unknown scalar excluded; malformed v2 never falls back. Shared text needs review. |
| Old provider editor | Existing legacy editing retained | Reject v2 writes to avoid losing fields. |
| Historical booking | Existing saved terms remain | Missing new terms unavailable, never filled from live package. |

Existing package edits continue under current approved-owner, draft-only rules: legacy-only updates validate scalar eligibility; migration to V2 is explicit and complete, not inferred from an unrelated edit. V2 edits require a compatible writer, expected revision and fresh catalog/capability validation. Historical four-image galleries retain their saved order/cover and dual-read behavior; gallery editing cannot rewrite historical bookings.

An enforceable minimum-version strategy must check authenticated client capability/build at backend disclosure, booking and protected write gateways, with supported Web deployment and upgrade UX; an untrusted version header alone is insufficient. For direct Firestore legacy reads, a backend version gate alone cannot block discovery: rules/access architecture must demonstrably prevent unsupported reads, or use an existing-reader-compatible public projection that physically excludes unsupported V2 packages using predicates old queries already honor. Such a projection may expose only semantically representable packages/terms; primary-only discovery is not multi-occasion support. Test old binaries and actual deployed query paths, including no-filter queries, details and booking. If neither minimum-version enforcement across read paths nor a safe projection is verified, public V2 activation stays blocked.

Default: v2 private until compatible clients/gateway are ready. Choose enforceable minimum versions or compatibility-filtered public projection before mixed-client activation. A new legacyCompatible flag ignored by old queries offers no protection. Do not duplicate packages under each occasion. New IDs require dynamic readers; no silent remapping to other. Parser survival is not semantic parity.

Gallery dual-read: use ready v2 membership, otherwise original inline arrays. Import assets only after ownership verification, with stable idempotent membership IDs/order. Keep four-image projection and original booking URLs throughout migration. Unverifiable legacy assets remain legacy and require manual review; never fabricate ready records or delete originals during import.

## 7. Cross-Platform Integration

Gabriel's agreed implementation sequence: (1) shared contracts; (2) backend validation; (3) Admin moderation; (4) Customer Web and Flutter compatibility; (5) Provider UI integration; (6) end-to-end/security tests; (7) separately authorized guarded activation. Coordinate Flutter compatibility before enabling any new published package data.

| Owner | Dependency |
| --- | --- |
| Gabriel / backend coordination | Own shared contracts, validation, Customer Web discovery coordination, Admin integration and deployment verification; centralize offer types/runtime schemas; deliberately distribute Functions shared runtime; catalog/eligibility jobs, gateway, media references and snapshot/hash integration |
| Firebase/security | Rules/index review, private/public boundaries, negative emulator tests before query cutover |
| Admin | Moderation, alias conflicts, audit, staged catalog activation and explicit capability approval |
| Provider Web ? `feat/provider-ui-improvements` | Own Provider Add Package UI, multi-occasion selection, occasion suggestion UI, Theme Gallery and tier-inclusion presentation; all/multi exclusivity, repair/status UI, shared/tier equipment editors, revision conflicts, gallery pagination/recovery and existing draft lifecycle |
| Customer Web | Discovery normalization/types/service, selected-tier details/customization/filters, gallery paging and immutable agreement/history readers |
| Flutter Mobile | Own compatibility and cross-platform integration; dynamic IDs/catalog, replace scalar discovery, parse tiers/equipment, details/customization/summary, pricing and snapshot readers, upgrade enforcement |
| QA/release | Golden cross-platform fixtures, migration/load/rollback evidence and capacity signoff |

Hardcoded sources requiring migration: shared `provider.ts` PROVIDER_EVENT_TYPES; duplicate Functions `shared/constants.ts`, provider eligibility/normalization and booking requireEventType; Provider Web form/setup-gallery enums; Customer Web discovery filters/types/normalization; Flutter occasion options and repository matching. Known Flutter paths: `apps/customer_mobile/lib/shared/models/feasta_models.dart` and `features/authentication/data/repositories/feasta_repository.dart`. Implementation must inventory remaining UI catalogs; bootstrap/test seeds are not live authority. Cache by catalog revision, invalidate after activation, refresh/reject stale writes. Offline cached catalog cannot authorize publish/booking. Separate repositories, including feasta-fresh, require future compatibility signoff and were not changed.

## 8. Booking Snapshot Requirements

Preserve independent `drop_off`, `buffet_setup` and `full_service` prices and `includedServices`, with optional tier `decorInclusions`, `furnitureInclusions` and `equipmentInclusions`; shared inclusions remain separate. Booking snapshots preserve selected-tier prices, fixed food promises, services, actual selected design and all agreed effective inclusions. This update changes no pricing calculations and lifts no publication/booking restriction.

```typescript
// DRAFT logical snapshot; Timestamp is storage representation.
interface ProtectedDesignEvidence {
  assetId: string; // protected registry copy, not a mutable gallery alias
  cloudName: string;
  cloudinaryAssetId: string;
  publicId: string;
  version: number;
  resourceType: 'image';
  deliveryType: 'authenticated' | 'private';
  format: 'jpg' | 'png' | 'webp';
  contentSha256: string;
  deliveryUrl: string; // trusted versioned locator; authorized delivery still required
}
interface BookingPackageSnapshotV2 {
  schemaVersion: 2;
  packageId: string;
  providerId: string;
  packageRevision: number;
  catalogRevision: number;
  bookedOccasion: {id: OccasionId; label: string};
  serviceTier: Tier | null; // null only for legacy no-tier
  serviceTierLabel: string | null;
  pricingModel: 'per_pax' | 'per_bundle' | 'legacy_fixed';
  currency: 'PHP';
  unitPriceInCentavos: number;
  guestCount: number;
  subtotalInCentavos: number;
  effectiveIncludedServices: string[];
  foodInclusions: string[]; // fixed package food promises, existing food contract
  decorInclusions: string[];
  furnitureInclusions: string[];
  equipmentInclusions: string[];
  selectedInclusions: {food:string[];decor:string[];furniture:string[];equipment:string[]};
  theme: null | {
    id:string; name:string; description:string; galleryRevision:number|null;
    coverAssetId:string|null;
    evidence: {storage:'inline'; assets:ProtectedDesignEvidence[]} |
      {storage:'manifest'; manifestId:string; manifestHash:string; assetCount:number};
    legacyImageUrls:string[];
  };
  paymentAgreementKey: string;
  termsHash: string;
  agreedAt: Timestamp;
}
```

Store alongside the exact existing server-built bookingPaymentAgreement/financial evidence, linked by key/hash; do not replace its schemaVersion 1 or timingSchemaVersion 3. Preserve payment policies, gross/upfront/remaining amounts, eligibility, acknowledgement, deadlines, cancellation/refund allocation and lifecycle snapshots. Package subtotal excludes separately validated add-ons; existing gross calculation remains authoritative. Reject client prices/snapshot authority.

Snapshot the server-resolved fixed package `foodInclusions` as well as supported customer-selected food items in `selectedInclusions.food`. Fixed promises remain present even when the customer makes no selection; selected items supplement rather than replace them. Preserve existing food validation, selection eligibility, quantities and booking representations where supported; this proposal adds no Food Choice Groups, group cardinalities or new food-selection behavior. Include both fixed promises and supported selections in disclosed terms and the immutable terms hash. Historical missing food fields remain unavailable, never reconstructed from the current package.

Snapshot actual requested occasion, not package primary. Disclosure and submission resolve trusted package/provider/catalog/tier, guest count, inclusion selection and theme. Version terms identity in disclosure acknowledgement/fingerprint without changing historical absent-field fingerprint behavior. TERMS_CHANGED requires renewed review if first submission differs from disclosed terms. Existing idempotent retry returns original snapshot even after edits; changed payload with same key conflicts.

Pin the agreed theme identity, name, description and gallery revision, plus the exact ready assets used as contractual evidence: the agreed cover (when present) and any images explicitly incorporated into the disclosed agreement. Store those assets' immutable identities/versioned delivery metadata in `theme.evidence` and protect every included asset with booking references. `coverAssetId` is the protected-copy asset ID for the agreed cover and must resolve to protected evidence; no snapshot points to today's mutable gallery. Ordinary browsing does not incorporate every gallery image into the contract. Retain the full agreed gallery only if the disclosed contract expressly promises it and Gabriel approves its resource/retention policy; never silently omit promised evidence. Preserve existing agreed legacy URLs and their reference protection; those URLs alone are explicitly not a new immutable-evidence guarantee. New V2 confirmation requires verified protected copies of all required legacy design images or blocks for remediation.

When the contractually required evidence set is too large for a bounded inline snapshot, materialize immutable private `bookings/{id}/packageSnapshotAssets/{assetId}` via a pinned server manifest; the typed `theme.evidence` union selects `storage: manifest` with `{manifestId,manifestHash,assetCount}` instead of `storage: inline` assets. Capture the required set at the agreed revision, build metadata and references in bounded batches, verify count/hash and readiness, then atomically pin the ready manifest/hash during booking. Incomplete or changed evidence cannot book; require renewed disclosure when terms change. Reference locks serialize deletion vs booking attachment, including manifest preparation; protect every manifest asset and reconcile abandoned preparations safely. Preserve legacy URLs via legacy reference indexing until import/reconciliation. Do not copy image binaries into Firestore or duplicate unrelated gallery metadata into bookings.

Gabriel must approve the protected-copy implementation and evidence-retention scope, inline byte/asset threshold, maximum manifest asset/byte budget, batch/job limits, preparation expiry/cleanup, retention duration, historical delivery access and storage/CDN/API costs before scalable activation. No numerical manifest capacity is assumed; unconfigured required budgets or a required evidence set exceeding approved limits block booking through that path. Never truncate contractual evidence to fit a document or transaction.

### Request-to-confirmation lifecycle - source-aligned proposed evidence binding

Verified source paths: `bookings/submit-booking-request.ts`, `bookings/booking-payment-agreement.ts`, `provider-requests/{accept-provider-request,provider-acceptance-plan,reject-provider-request,recalculate-main-event-status}.ts`, `payments/{create-payment-session,payment-lifecycle,process-webhook}.ts` and `provider-requests/update-provider-booking-lifecycle.ts`. Today disclosure builds server agreements; submission validates agreement acknowledgements and persists bookingPaymentAgreement with agreedAt at submission. Main event begins `pending_provider_approval`, provider requests `pending`, unpaid. Acceptance is lineup-dependent: a request may remain accepted while siblings are pending; once all required providers accept, positive downPaymentAmount leads to `waiting_for_down_payment`, otherwise `confirmed`. This status name also serves current full-payment flows; it does not imply every package uses a deposit. Trusted payment processing confirms eligible initial payments; remaining balance belongs to an already confirmed request. Completion has independent settlement and unresolved-payment safeguards. No new payment timing or agreement schema is introduced here.

The following evidence stages are proposed server metadata, not replacements for booking/payment/refund statuses. The exact binding is server-only on each associated provider request; multi-provider bookings never share financial or package authority.

```typescript
type EvidenceStage = 'request_pinned'|'accepted'|'confirmed'|'terminal_retained'|'deleted';
interface BookingPackageEvidenceBindingV2 {
  schemaVersion:2; snapshotHash:string; termsHash:string; paymentAgreementKey:string;
  evidenceHash:string; preparationId:string; stage:EvidenceStage;
  revision:number; createdAt:Timestamp; updatedAt:Timestamp;
}
type BookingPackageEvidenceBindingApiV2 =
  Omit<BookingPackageEvidenceBindingV2,'createdAt'|'updatedAt'> & {
    createdAt:string; updatedAt:string;
  };
```

Persist as `providerRequests/{providerRequestId}.bookingPackageEvidenceBinding`; the immutable snapshot lives at the section 3 snapshotPath and remains associated with its booking. SnapshotHash, termsHash, paymentAgreementKey, evidenceHash and preparationId never change after submission; only stage/revision/timestamps advance under authoritative lifecycle transactions. EvidenceHash covers the exact canonical inline identities/digests or pinned manifest identity/hash/count plus cover identity. Historical absent bindings remain absent. `deleted` describes approved binary cleanup only, not deletion of the snapshot, agreement or audit.

In the table, **immutable** means preserve the exact submitted snapshot/agreement/hash without live reconstruction; **protected** means durable booking references to ready copies/manifests and authorized historical access, independent of gallery membership. All rows preserve existing financial and cancellation authority. **Same-event retry** means existing lifecycle event identity plus current binding revision/state yields one transition/reference mutation; a delayed earlier event cannot regress a later or terminal stage. Submission retries use the original booking ledger result as defined in section 3. **No new ack** never waives an additional acknowledgement already required by production.

| Lifecycle transition | Previous -> next evidence stage | Authoritative trigger; references | Snapshot/agreement and customer acknowledgement | Retention/holds and idempotency |
| --- | --- | --- | --- | --- |
| Disclosure preparation | absent -> absent | Existing payment-agreement disclosure resolver; protect copies via private preparation locks, require trusted ready inline set/manifest and configured budgets. No booking reference yet. | Disclose server-built hashes/terms; require acknowledgements on first submission. Not a committed agreement yet. | Preparation cleanup uses separate approved expiry and proof no committed ledger/request uses it; same selection/preparation retry cannot attach duplicates. |
| Request submission | absent -> request_pinned | Existing submitBookingRequest transaction verifies selection, ready protection/preparation fences, writes snapshot and frozen agreement, atomically promotes preparation locks to booking references. No partial commit. | Immutable from this commit; require existing agreementAcknowledgements plus exact packageTermsAcknowledgements. Changed terms before first submit give TERMS_CHANGED and renewed disclosure/ack. | Retention open, no final clock; original same-key retry returns original result, changed payload conflicts. |
| Pending provider decision | request_pinned -> request_pinned | Existing pending request state; no reference release for package/gallery/capability edits. | Immutable; no new ack. Provider reads only associated request. | Protected with open retention; same-event retry is no-op. |
| Provider acceptance, lineup still pending | request_pinned -> accepted | Existing acceptance gateway verifies stored hashes/references and current applicable lifecycle/availability safeguards; keep protected. | Immutable, no repricing or live gallery substitution; no new ack. | Open; same-event retry. Inconsistent evidence fails EVIDENCE_NOT_READY/EVIDENCE_BINDING_MISMATCH without changing agreed terms. |
| Payment processing / awaiting initial payment | accepted -> accepted; confirmed -> confirmed for remaining balance | Existing checkout, payment session, trusted webhook and lineup coordinator; verify agreement key/binding, preserve protection during pending/failed/retried payment. | Immutable; preserve existing checkout acknowledgements, no new V2 ack. | No closure while payment unresolved; same payment event cannot double-advance. Financial success persists even if evidence needs reconciliation. |
| Booking confirmation | request_pinned or accepted -> confirmed | Existing no-initial-payment acceptance/lineup path or trusted initial-payment confirmation, with reference readiness verified; direct request_pinned -> confirmed covers accepted siblings finalized by lineup coordinator. | Immutable; no new ack or new payment requirement. | Open; same-event retry. Remaining balance may still be due under existing policy. |
| Completion | confirmed -> terminal_retained | Existing authorized completion flow with settlement and unresolved-payment safeguards; keep all protected references. | Immutable; no new ack. | Completion alone starts no clock; require separate final closure. Same-event retry. |
| Provider rejection | request_pinned -> terminal_retained | Existing provider rejection transaction; keep protected and retain decision history. | Immutable; no new ack. | No automatic closure/deletion; unresolved financial/case obligations block clock. Same-event retry. |
| Authoritative expiration | request_pinned or accepted -> terminal_retained | Existing authorized terminal/expiry determination only, if permitted by current lifecycle. Browser timeout/abandonment is not authority; no new expiry schedule. Keep protected. | Immutable; no new ack. | Separate final closure required; same-event retry. |
| Customer cancellation | request_pinned, accepted or confirmed -> terminal_retained | Existing authorized customer cancellation flow when its guards permit; preserve references during fee/refund/settlement processing. | Immutable; no new terms ack; existing cancellation acknowledgement remains. | No release/clock from cancellation alone; same-event retry. |
| Provider cancellation | request_pinned, accepted or confirmed -> terminal_retained | Existing authorized provider cancellation flow when permitted; preserve references and allocation evidence. | Immutable; no new terms ack; existing cancellation requirements remain. | No release/clock from cancellation alone; same-event retry. |
| Refund handling/payment reconciliation | current protected stage -> same stage | Existing trusted refund/payment coordinator; keep protection, including terminal_retained. If a closed case acquires a new unresolved matter, use reopen transaction below before progressing. | Immutable; no new V2 ack. | Unresolved refund/payment blocks closure/deletion; same refund event is applied once. Refund success alone is not final closure. |
| Dispute/complaint/appeal | current protected stage -> same stage | Existing authorized case operation atomically adds unresolved-case/hold protection and invalidates cleanup fence; closed retention reopens. | Immutable, preserve historical terms; no new ack. | Holds override dates; no reference release. Same case event cannot duplicate holds or reopen generations. |
| Case reopening while evidence remains retained | terminal_retained -> terminal_retained (or current protected stage -> itself) | Authorized lifecycle/case coordinator, using generation/fence checks below, restores retention state open while preserving references. Reopening a case does not resume service or set confirmed. | Immutable; no silent new snapshot, no new terms ack. Any service/terms amendment remains separately approved. | Clear finalClosedAt/retainUntil/closureEventId; increment protection fence, preserve closure generation/history. Same reopening event once. |
| Reopen after verified binary cleanup | deleted -> deleted until authorized recovery | Coordinator blocks protected reopening with EVIDENCE_NOT_READY; no reference/ready claim for missing bytes. Recover only from approved backup of original digests under section 8 destruction barrier. | Snapshot/agreement immutable; never rebuild from live package; no new terms ack. | Recovery must verify the complete original evidence set, atomically restore booking references, set terminal_retained/open and invalidate the old fence before reopening succeeds; otherwise remain blocked. Same recovery event once. |
| Final closure | terminal_retained -> terminal_retained | Existing authorized lifecycle coordinator emits the exact final-closure event below only after all terminal/financial/case/hold predicates pass. Keep protected. | Immutable; no new ack. | New closure generation and provisional 12-month clock; repeated closure event does not restart it. |
| Eligible cleanup after retention | terminal_retained -> deleted | Authorized retention service under separately approved legal policy and generation/fence/asset locks below; release only this booking's refs after final checks, delete only otherwise-unreferenced copies. | Snapshot/agreement/hash remain immutable under their separate policies; no new ack. Record binary tombstones, never rebuild missing evidence. | No cleanup before legal approval, due date, no open matters/holds and protected deletion barrier. Same job/assets retry idempotently; report deleted only when all required work is verified. |

Any current production transition not permitted by its own guards remains forbidden regardless of the evidence table. Every terminal booking/request outcome above assigns terminal_retained, including cancellation, authoritative expiration and completion; refund/case events preserve that stage and protection. Reopening requires protection to remain intact and is not a service-state rollback. A later service reinstatement would require a separately specified authorized lifecycle flow, not an implicit stage transition. If a payment succeeds while an evidence check fails, preserve financial evidence and flag reconciliation under existing recovery semantics; do not discard or reverse the payment from this specification.

After request submission, provider edits do not change the customer's requested terms. Any desired amendment requires the separately approved agreement flow already required above; none is introduced by this pass. Until such a flow exists, changed terms require a new fully disclosed and acknowledged request under existing permitted cancellation/rejection/rebooking rules, without erasing the original request or financial history. Acceptance cannot substitute a newly edited design. Historical booked contracts remain independent of later capability revocation.

Section 3's exact BookingDisclosureV2Response.packageTerms and BookingSubmissionV2Request.packageTermsAcknowledgements bind disclosure to submission; BookingSubmissionV2Response returns the original immutable snapshot, reference and binding. The acknowledgement tuple is identity, never client financial/snapshot authority. No new acceptance/payment API is proposed: existing authorized lifecycle gateways perform these guards. Existing auth/App Check, booking association and acknowledgement errors remain; proposed failed-precondition EVIDENCE_NOT_READY/EVIDENCE_BINDING_MISMATCH and unavailable VERIFICATION_UNAVAILABLE follow section 3. Reference preparation is internal; caller-authored asset IDs/URLs cannot override disclosed identities.

Attachment and deletion serialize through asset reference locks/generations. Submission atomically verifies protection and durable reference ownership; a deleting asset cannot attach. Cleanup cannot release preparation protection before booking references exist, and must check committed request/idempotency outcomes after crashes. Gallery detachment removes only its own reference. Rejection/expiration uses the same provisional 12-calendar-month period after server final closure as other committed requests, subject to legal approval; no shorter automatic deletion is implied. Unsubmitted preparation expiry is a separate operational policy. Authorized retention service alone releases references under the closure-generation/hold/deletion fences below.

### Protected evidence, access and final closure

A versioned URL alone does not prevent overwrite, deletion or loss of access. Before disclosure acknowledgement at request submission, backend pins the disclosed cover and explicitly agreed images to dedicated private/authenticated, non-overwritable evidence copies, verifies trusted Cloudinary identity/version and source digest, and creates authoritative references. Provider upload signatures cannot target this namespace; no provider or general gallery worker can overwrite/destroy it. Protected delivery uses booking-authorized short-lived access; stored locator tokens are not permanent public permission. Account-level overwrite/delete credentials and backup/recovery controls need Gabriel's verification; if protected retention cannot be assured, V2 confirmation stays blocked. Asset replacement creates a new identity; gallery reorder, edit or unpublish cannot change the pinned bytes. Snapshot/hash and manifest hashes include evidence identities, digests and contractual image selection; booking confirmation atomically verifies their ready protection and final terms hash. Committed pending requests hold durable booking references from submission through final closure and approved retention; unsubmitted preparations retain preparation locks until safe promotion or approved cleanup. Request submission does not assert confirmation.

Apply the existing FEASTA authorization model to the proposed evidence readers: authenticated customer associated with that booking, associated provider through existing approved membership/ownership checks, and server-authorized platform administrators with an operational verification/complaint/refund/dispute purpose may read evidence. Every snapshot/manifest/page/download gateway checks booking association or admin role; package visibility alone grants no evidence access. Direct private collection reads and Cloudinary source access cannot bypass these checks. Audit privileged access and deletion without logging signed URLs. Historical access remains through the booking after package/theme unpublishing or provider catalog removal.

Proposed server-only `bookingEvidenceRetention/{bookingId}` aggregates all package-bearing provider requests in that booking. A booking cannot close while any associated obligation/case is unresolved. It has the common revision/timestamps plus the following exact fields; all numeric generations/fences are nonnegative safe integers, never wrap or reset.

```typescript
interface BookingEvidenceRetentionV2 {
  state:'open'|'closed'|'deletion_pending'|'deleted';
  closureGeneration:number; // initially 0; increments ONLY on a new final closure
  protectionFence:number; // initially 0; increments on every protection/deletion authority change
  finalClosedAt:Timestamp|null;
  retainUntil:Timestamp|null;
  closureEventId:string|null;
  holdIds:string[]; // bounded active references, full history private
  unresolvedCaseCount:number; // trusted materialized count; verify authoritative case records too
  deletionJobId:string|null;
  deletionLease:null|{jobId:string; closureGeneration:number; protectionFence:number;
    phase:'prepared'|'destroying'; policyRevision:string};
}
interface BookingEvidenceFinalClosureEvent {
  schemaVersion:2; eventType:'bookingEvidenceFinalClosure';
  createdAt:Timestamp; updatedAt:Timestamp; // immutable, both equal finalClosedAt
  eventId:string; bookingId:string; closureGeneration:number;
  lifecycleEventId:string; actorId:string; reason:string;
  finalClosedAt:Timestamp; retainUntil:Timestamp;
  retentionPolicyRevision:string; protectionFence:number;
  providerRequestIds:string[]; // exact terminal associated set, including add-on requests
  bindingHashes:{providerRequestId:string; snapshotHash:string; evidenceHash:string; // package-bearing subset only
    paymentAgreementKey:string}[];
  // Server-verified closure predicates, not caller attestations:
  obligationsTerminal:true; paymentsReconciled:true; refundsSettled:true;
  unresolvedCaseCount:0; activeHoldCount:0;
}
interface EvidenceCleanupJobInput {
  bookingId:string; expectedClosureGeneration:number; expectedClosureEventId:string;
  expectedProtectionFence:number; expectedRetentionRevision:number;
  retentionPolicyRevision:string; jobId:string;
}
```

Retention timestamps are native storage Timestamp; any authorized API projection uses RFC3339 UTC. Immutable closure identity is `bookingEvidenceRetention/{bookingId}/closures/{generation}`; eventId is exactly `${bookingId}:final-closure:${generation}` (decimal safe integer without leading zero). The event interface also includes server createdAt/updatedAt timestamps as required for new records; both equal finalClosedAt and never change. Immutable events have no mutable revision. Event payload is write-once and emitted through an outbox with that same identity. The authorized lifecycle coordinator records the initiating lifecycleEventId in its durable operation ledger; a retry of that event returns the original generation/event even after a later reopening. A different event while already closed does not increment generation or restart retention. No second closure can be emitted while the booking remains closed.

Initially state open, closureGeneration/protectionFence 0, null closure/timing/deletion fields. An approved retentionPolicyRevision is required to emit a closure event; recording a provisional retention deadline still conveys no deletion authority. Final closure requires all provider requests/booking/event obligations terminal, cancellations settled, payments/refunds reconciled and no unresolved complaint/dispute/appeal or active hold. The transaction reads authoritative obligations/cases/holds, compares retention revision/fence, increments closureGeneration and protectionFence once, assigns server finalClosedAt, writes the immutable event/outbox and state closed with matching event ID. FinalClosedAt is the committed server closure time, never a client completion/cancellation timestamp or job execution time. This operation starts retention, not deletion.

Provisional retainUntil is finalClosedAt plus 12 calendar months at the same UTC date/time, clamped to the destination month's last day (for example 2028-02-29 to 2029-02-28). It is fixed in the closure event with the policy revision. This remains subject to separate privacy/legal approval and does not authorize production deletion, even when the computed date passes. Closure criteria/policy revision require approval before implementation.

Reopening from closed or prepared deletion_pending runs through the same protected coordinator: transactionally set state open, clear finalClosedAt/retainUntil/closureEventId and deletion job/lease, increment protectionFence/revision, add unresolved case/hold protections as applicable, and preserve every booking reference. Do not decrement or increment closureGeneration on reopening: it identifies the last completed closure. Immutable earlier closure events remain. Next valid final closure increments generation (1 -> reopen keeps 1 -> next closure 2) and starts a full new 12-month interval at its own finalClosedAt. Adding/releasing a legal hold also increments protectionFence and invalidates prepared cleanup; a new hold/open matter on a closed booking requires reopening. Releasing a hold never closes the case or reuses an invalidated deletion authorization; closure is separately reevaluated. Current case/hold documents, not just cached counters, decide eligibility.

Cleanup jobs carry all EvidenceCleanupJobInput fields and require distinct approved legal/privacy deletion policy and service authority. Before preparing deletion, transactionally compare exact generation/event/fence/retention revision, state closed, trusted server now >= retainUntil, and approved policy revision; recheck current obligations, refunds/payments, cases/appeals, legal holds and every authoritative booking/gallery/editor/other reference. A mismatch aborts stale work without releasing a single reference. Prepare deletion_pending with matching lease/expected fence and acquire reference-generation locks for every affected asset in bounded coordinated work. Preparation itself advances the fence/revision; the job stores the resulting token for final authorization. New references cannot attach to locked deleting assets; shared assets with another reference survive.

**External-destruction serialization requirement:** a Firestore check followed by an unguarded Cloudinary delete has a race and is forbidden. All reopen/hold/reference operations and the authorized deletion worker must honor one exclusive per-booking/asset destruction barrier. Reopen/hold intents submitted before destructive authorization win, invalidate the prepared lease/fence and retain references. Final authorization under the barrier rechecks generation/event/fence, policy, due date, authoritative cases/holds and live references, then records phase destroying and a durable per-asset intent. While destroying is outstanding, no coordinator may report a successful reopening, accept a new protected reference or let a stale worker regain authority. A newly arriving reopen/hold intent must pause subsequent destruction and require reconciliation of any already-issued external request before the barrier can be released. Worker retries resolve that same intent idempotently; no lease timeout may silently unlock an unknown external outcome or authorize a replacement stale worker.

Only after this authorization may the service release this booking's references and destroy unshared binaries. Record verified per-asset outcomes and immutable tombstone/audit; report state deleted and evidence stage deleted only once all required cleanup is confirmed (shared retained assets count as retained, not physically destroyed). If reopening/hold arrives before any destruction, restore/keep protection and cancel cleanup. If an external deletion has already irreversibly completed, never claim protected reopening succeeded: block it for authorized evidence recovery from approved backups with verified original digests, preserve the immutable snapshot, and audit unavailable evidence. Never reconstruct from the live package. This defines serialization, not a promise of restoration after lawful deletion. Backend implementation must prove the barrier across Firestore/external operations before any deletion gate can open; without that proof, deletion remains disabled. Thus a stale cleanup job cannot destroy evidence of a successfully reopened or currently protected booking.

Deletion metadata, snapshots, financial records, case histories and audits have separate legal policies and are not implicitly deleted with image binaries. Protected references remain through pending requests, payments, every terminal outcome and unresolved matters, then the full approved retention interval. No irreversible deletion is authorized by this document.

Gabriel/legal/privacy signoff remains required for lawful basis, notices/consent, jurisdiction, data-subject requests versus legal holds, administrator access scope, closure/appeal criteria, backup deletion timing, and whether the provisional 12-month period and delivery controls are appropriate. Inline/manifest byte and asset budgets, preparation expiry and cleanup also remain operational approvals; never truncate promised evidence.


Provider edits, theme removal, tier disablement or catalog changes never mutate snapshots. Readers use historical values only. Any amendment needs a separately approved agreement flow. Missing historical fields display unavailable. Existing publication/visibility/availability/payment and canonical-pricing restrictions remain before snapshot creation.

## 9. Migration and Rollout Plan

The seven-stage sequence in section 7 is authoritative. The steps below detail dependencies within those stages; contract approval, implementation approval, deployment verification and public activation are separate decisions.

1. **Shared contracts:** obtain Gabriel's exact field/API approval, then separate implementation authorization. Freeze typed fixtures and disabled feature boundaries; no activation approval is implied.
2. **Backend validation:** implement authoritative config, ownership/eligibility validation, existing pricing gates, media/evidence/reference lifecycle, booking/payment integration and serialized catalog transitions behind disabled flags. Prepare rules/indexes and staging authorization checks; wait for indexes to be ready.
3. **Admin moderation:** seed exact catalog, review applicability/capabilities, ship private moderation and transition tooling. Newly approved suggestions remain inactive. Capability approval stays separate.
4. **Customer Web and Flutter compatibility:** deliver compatible models, discovery gateway, details, customization, gallery paging, tiers, booking/history readers and enforceable old-client handling; verify actual old binaries/read paths before Provider integration.
5. **Provider UI integration:** on `feat/provider-ui-improvements`, integrate multi-occasion selection, suggestion interface, Theme Gallery and tier-specific inclusion presentation against accepted backend contracts. Private draft integration never unlocks discovery, publication or booking.
6. **End-to-end and security tests:** execute the acceptance matrix, capacity/load checks, reference reconciliation, compatibility and rollback drills. Dry-run migration with counts/hashes, malformed reports and checkpoints; recognized scalar backfill is idempotent with CAS/skip on concurrent edits. Gallery import preserves order/four-image projection. Never infer tiers, change prices/status/payments, rewrite history or publish drafts.
7. **Separately authorized guarded activation:** Gabriel coordinates Backend, Admin, Customer Web and deployment verification; Flutter owners attest parity. Obtain release evidence and distinct public activation approval, verify quotas/indexes/rules and withdrawal barrier, then execute guarded rollout with monitoring. Keep independent flags for private writes, moderation, gallery capacity, discovery and publication/booking. Lifting canonical-pricing restrictions requires separate explicit approval even if other features are ready. Contract approval, completed implementation and deployment do not themselves authorize this stage.

Rollback disables new writes/reservations/public activation, withdraws affected v2 packages from unsupported readers, and retains additive readers/snapshots/references/projections. Reconcile in-flight uploads safely. Never down-convert all/multi to scalar authority, truncate canonical gallery, delete booked assets or change agreements. Failed revalidation blocks catalog activation. Monitor stale projections, eligibility discrepancies, quotas/orphans/deletion failures and retry conflicts; unsafe eligibility or financial discrepancies trigger disablement.

## 10. Acceptance Test Matrix

Future tests only; no tests implemented/run for proposed functionality.

| Scenario | Required outcome | Owner |
| --- | --- | --- |
| Capability reason 9/10/500/501 code points, supplementary Unicode/control input | Proposed minimum 10 and maximum 500 inclusive after trim; reject controls/invisible formatting; same rule in operation/validation; Gabriel confirms bound before freeze | Backend/Admin |
| Admin capability grant/revoke, concurrent catalog/edit, stale revision/retry | No provider self-grant; verified withdrawal before commit; legacy/specific/all revalidated; no automatic publication; audit once and resumable status | Backend/Admin/security |
| Public catalog response and category seeds | Exact PublicOccasion allowlist; no actors/aliases/inactive records; revision-bound paging; catering_service validated against active serviceCategories | Shared/all clients |
| Incomplete editor save/resume/conflict/completion | Private progress survives; partial values never reach packages; exact mapped structural/completion/size/revision/state/policy errors; missing/foreign resources indistinguishable; complete validation and atomic draft link; old writer rejected | Provider/backend |
| Package/disclosure/submission source envelopes and V2 fields | Legacy fields match source; full update is not PATCH; revisions/projection server-owned; exact sharedContractVersion and acknowledgement tuple; committed snapshot/reference and original retry result, unchanged legacy/custom-menu behavior | Shared/booking/backend |
| Editor media detach/abandon vs deletion | Owner-only verified assets, authoritative editor references, configured cleanup and no deletion while referenced | Media/security |
| Request pending -> accepted -> payment/confirmed, including no-initial-payment and remaining balance | Evidence pinned at submission, same hash/payment key throughout, lineup rules preserved; no live substitution or payment-contract changes | Booking/QA |
| Every section 8 evidence transition, delayed event and retry | Exact previous/next stages; rejection/authoritative expiry/customer or provider cancellation/completion all terminal_retained; refunds/disputes/reopen preserve protection; no live rebuild or new terms ack without amendment | Booking/security |
| Final-closure generations, leap day, reopen/hold vs cleanup, external unknown outcome | 0 -> close 1 -> reopen 1 -> close 2; immutable event per generation; exact 12-calendar-month UTC clamp; stale generation/fence/revision cannot release refs; destruction barrier blocks unsafe reopen success, unknown outcomes remain locked; no production deletion before legal policy/barrier approval | Booking/security/legal |
| Specific 1/10/11, duplicate/unknown/inactive/partial v2 | Valid 1–10 eligible; otherwise reject, never malformed fallback | Shared/backend |
| All + IDs, missing capability, catalog change | Reject conflict; whole all package blocked until fully eligible; no automatic capability grant | Backend/provider |
| Catalog/capability changes during discovery/booking | Stale membership never authorizes; withdrawal protects old clients | Backend/security |
| Legacy backfill + concurrent edit/retry | Singleton preserved, CAS skip, no duplicate packages | Migration |
| Old web/mobile primary vs secondary search | Primary-only limitation demonstrated; unsupported terms gated | Customer teams |
| Suggestion Unicode/alias/inactive collision, rate/retry | Stable private duplicates, bounded submissions and unique names | Admin/backend |
| Four moderation variants, forbidden fields, target status/revision, concurrency/retry | Exact section 3 union; new and reused inactive approvals stay inactive; map requires active applicable target; reject null target; reason/admin required; one terminal result/audit/outbox, no capability grant or activation | Admin/backend |
| Suggestion created/replay/own duplicate/catalog match; scoped typed lists | Exact response discriminator; canonical match has no suggestionId; replay retains original result, list identity is document-ID projection only; no cross-provider exposure or extra submission slots | Admin/backend |
| Shared/tier dedupe, absent/empty, disable/switch | Stable shared-first lists; no other-tier leakage; stale choices rejected | All clients/backend |
| Per Pax/bundle/legacy, precision/overflow/guest bounds | Correct integer formulas; current draft-only gates still reject | Backend/QA |
| Forged totals/snapshots/owners/URLs, auth/App Check | Reject; no cross-provider exposure | Security |
| Four-image legacy/import, >4 before gate | Existing order/cover readable; cap remains everywhere | Media/all clients |
| Fourth concurrent upload, MIME/bytes/dimension spoof | Transactional concurrency/quota and trusted verification | Media/backend |
| Partial upload, timeout, expired reservation, duplicate webhook | Retain successes, retry pending, same asset/membership, orphan tracked | Media/provider |
| Cover removal/reorder during paging | Deterministic cover/null, revision restart | All clients |
| Delete vs booking, crash after Cloudinary destroy | Reference safety and idempotent recovery | Backend/security |
| Activation/deactivation crash, stale evidence or concurrent capability change | No partial public exposure; guarded commit, safe withdrawal, resumable rebuild; moderation cannot activate | Backend/release |
| Evidence overwrite, unauthorized read, legal hold/reopened case | Protected bytes and references unchanged; access denied; retention/deletion fenced | Booking/security |
| Missing policy or concurrent limit reservations | Fail closed; no capacity/rate bypass; current production limits retained | Backend/provider |
| Fixed food promises + supported food selections | Both immutable and hash-bound; no selection does not erase fixed promises; existing food rules only, no Food Choice Groups | Booking teams |
| Large gallery manifest/load | Only contractually required evidence retained; cover/referenced assets protected; bounded reads/docs/transactions, approved budgets and readiness enforced | Backend/QA |
| Provider edit after booking, idempotent retry | Immutable terms/payment evidence; original retry result | Booking teams |
| Historical absent snapshot | No live reconstruction | Web/mobile |
| Rollback, missing index, external outage | Fail closed; compatible legacy reads remain | Release |

## 11. Open Decisions for Gabriel

| Category | Agreed direction / remaining technical signoff |
| --- | --- |
| Approved architectural choices | Versioned multi/all occasion contract; Admin review separate from activation; explicit capabilities and backend eligibility/projection; legacy scalar compatibility; Cloudinary paginated registry; independent service tiers with optional categorized inclusions, separate shared inclusions and immutable booking terms. Development direction is approved; exact contracts and activation remain gated. |
| Provisional operational limits | Server-configurable initial maximum 10 individual occasions/package and three pending suggestions/provider; proposed 50 images/theme rollout target. No permanent schema maxima. Preserve stricter current restrictions, four-image cap and existing rates until separately authorized. |
| Exact API/schema freeze | Freeze proposals in sections 2-4 and 8: occasion/offer/gallery records, activation/deactivation request/result, typed protected inline/manifest evidence and retention state. Approve field/collection/API names, errors, applicability seeds, capability ownership, moderation/activation operations, normalization, proposed five/day suggestions relative to existing rates, 30-day management idempotency and notifications. Approve shared equipment, 50x160 contribution and up-to-100 effective-list bounds, pricing/guest bounds subject to stricter existing validation. Calculations and publication/booking restrictions remain intact. |
| Final five clarification signoff | Approve updateProviderOccasionCapabilities/getProviderOccasionCapabilityChange, sanitized PublicOccasion and canonical-category seed checks, save/get/completeProviderPackageEditorDraft and private references, request-time evidence pinning and lifecycle binding. Sections 2-4 and 8 define exact proposed shapes, authorization, errors and concurrency; section 10 adds acceptance evidence. No competing verification API, relaxed canonical validation or shifted payment timing is authorized. |
| Seven-blocker freeze signoff | Review the exact section 3 request/response unions, full-write source envelopes, V2 capability discriminator and deterministic hash fixtures; confirm capability reasons minimum 10/maximum 500 Unicode code points. Approve section 8 terminal evidence transitions, immutable closure generations/events, cleanup fencing and required external-destruction barrier. These definitions are proposals; no runtime/barrier proof or legal deletion authority is claimed. |
| Separate release gates | Cloudinary quotas/capacity; expansion beyond four theme images; actual Web/Flutter compatibility test evidence; final legal/privacy retention approval; production deployment; public package/occasion activation; removal of pricing-model publication/booking restrictions each require distinct authorization. Contract freeze does not satisfy any of these gates. |
| Cloudinary account and budget checks | Confirm account capacity, provider/global stored count/byte quotas, daily uploads, file-size limits, processing dimensions, transformation/CDN/API budgets, concurrency, reservation expiry/orphan grace, backups and costs. The 50-image target remains inactive until these and customer compatibility are confirmed. Required unconfigured budgets fail closed. |
| Booking evidence and retention | Provisional 12 months after final closure, unresolved matters and legal holds protected. Approve protected copies/access, proposed closure event, reopening clock and deletion fences, plus selected-design/evidence scope (cover and explicitly agreed images; full gallery only when expressly promised), access permissions, inline thresholds, manifest asset/byte and job budgets, preparation cleanup, historical delivery, snapshot/hash and reference costs. Provisional 12 months after final closure needs privacy/legal review; approve the exact closure triggers, generation/event schema, unresolved-matter/hold checks and external-destruction serialization in section 8. No proof of the proposed destruction barrier is claimed; production deletion stays disabled pending implementation verification and separate authorization. No automatic or irreversible deletion policy is approved. |
| Old-client strategy | Choose and verify backend/read-path minimum-version enforcement or physically safe compatible public projection (section 6); neither verified means activation blocked. Old scalar remains primary-only. |
| Deployment and activation checks | Approved evidence issuers/artifacts/validity, catalog and eligibility generations, verified withdrawal, index/rules readiness, current publication/booking safeguards, resumable rebuild and rollback drill (section 4). Separate release authorization required. |
| Client compatibility and activation gates | Verify Backend, Admin, Customer Web and Flutter Mobile integration; choose enforceable minimum versions or compatibility-filtered public projection. Scalar retention provides primary-only discovery. Coordinate Flutter before new published data; complete end-to-end/security testing and deployment verification, assign owners/cohort and obtain separate controlled public activation approval. Any lifting of canonical pricing/publication/booking restrictions needs separate explicit approval. |

This targeted seven-blocker correction pass defines suggestion review/submission/listing variants, authoritative proposed error mappings, closure generations, the evidence state machine, exact package/booking API extensions and the proposed capability reason bound for Gabriel's final review; it does not assert approval or implementation. Proposed freeze now defines dedicated activation/deactivation operations, protected readiness evidence, typed inline/manifest evidence, final-closure generation and guarded reference release above. Gabriel must approve these exact definitions; they are not deployed APIs or approved legal policy. Operational targets never override current production restrictions.

Prior audit's `customerInstructions` proposal remains deferred: not an approved field here. Do not repurpose descriptions, customer special requests, booking notes or theme descriptions as instruction agreements.

## 12. Explicit Implementation Boundaries

Only this document is created/updated. No production code, tests, shared contracts, Functions, rules/indexes, Flutter, Customer Web, feasta-fresh or existing provider UI work changes. No dependencies installed, live Firebase/Cloudinary writes, staging/commit/push/merge/reset/deploy. Remain on `feat/provider-ui-improvements`. Documentation checks cover source alignment, completeness and file scope; proposed APIs have no runtime validation yet. Stop after specification; implementation requires Gabriel's explicit detailed-contract approval.
