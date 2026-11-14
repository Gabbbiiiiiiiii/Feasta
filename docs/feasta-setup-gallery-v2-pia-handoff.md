# Private Setup Gallery V2: Pia integration handoff

Status: B2C local contract implemented. Production private writes and V2 publication remain disabled. No deployment, live writes, or emulator validation was performed.

B2D verification (2026-10-24): the exported action signatures and result union below match the implementation. Pia can proceed with local frontend integration and mocked saves, honoring `availability`. Backend live end-to-end testing remains blocked. See [the B2D security report](feasta-setup-gallery-v2-b2d-security-report.md) for current evidence, two existing Functions validation failures, and the restricted capability lifecycle. B2C validation counts at the end of this document are historical; the report contains the B2D results.

## Actions and types

Import actions from:
`@/app/provider/packages/setup-gallery-actions`

- `loadPrivateProviderSetupGalleryV2Action({galleryWriteSchemaVersion: 2})`
- `savePrivateProviderSetupGalleryV2Action(request)`

The legacy `loadProviderSetupGalleryAction` and `saveProviderSetupGalleryAction` remain available for V1-only galleries.

Types: `PrivateSetupGalleryV2` and `SavePrivateSetupGalleryV2Request` are type-only imports from `@/lib/provider/provider-setup-gallery-v2-writer`; `PrivateGalleryResult` is a type-only import from `@/lib/provider/provider-setup-gallery-private-service`. Never import server implementation functions into a client component.

Successful load example (revisions and catalog below are illustrative):
```ts
{
  ok: true,
  gallery: {
    galleryWriteSchemaVersion: 2, // API replacement contract, including V1-only galleries
    revision: 7,
    setups: [], // full private V1/V2 union; includes draft and review-required records
    authority: {
      catalogRevision: 4,
      providerEligibilityRevision: 3,
      catalogComplete: true,
      catalog: [{
        id: "occasion_one", active: true, moderationState: "approved",
        sortOrder: 1, applicableServiceCategoryCodes: ["catering"],
        setupGalleryLegacyEventType: "wedding"
      }],
      approvedCateringCategoryCodes: ["catering"],
      approvedOccasionIds: ["occasion_one"],
      maxSpecificOccasions: 10,
      maxCatalogRecords: 2000,
      maxEffectiveMatches: 1000
    },
    availability: {
      canSave: false, canPublishV2: false,
      reason: "Private Setup Gallery V2 saving is disabled."
    }
  }
}
```

All authority is read through Admin SDK in a single read transaction. Loading never initializes authority. Missing, expired, malformed, or unstable authority fails closed, with no partial gallery response. A valid policy with privateWrites/publicReads false can still support loading; it does not grant saving. Existing stored drafts are structurally validated, not silently re-resolved or migrated.

## Saving a complete replacement

```ts
const result = await savePrivateProviderSetupGalleryV2Action({
  galleryWriteSchemaVersion: 2,
  revision: loaded.gallery.revision,
  expectedCatalogRevision: loaded.gallery.authority.catalogRevision,
  expectedProviderEligibilityRevision:
    loaded.gallery.authority.providerEligibilityRevision,
  setups: [
    // Include every retained V1 record unchanged or with permitted V1 edits.
    {
      setupOccasionSchemaVersion: 2,
      id: "setup_wedding", title: "Wedding styling", description: "",
      themeTags: [], imageUrls: [], isPublished: false,
      occasionScope: "specific", occasionIds: ["occasion_one"]
    }
  ]
});
```

This is a full replacement: omitted records are deliberately removed on a successful V2 save. Keep every retained V1 and V2 record. Do not send the loaded V2 objects directly: whitelist id, title, description, themeTags, imageUrls, isPublished, setupOccasionSchemaVersion, occasionScope, occasionIds. Strip eventType, occasionMatchIds, occasionCatalogRevision, providerEligibilityRevision, occasionEligibilityState from V2 proposals. They are server derived and rejected as input. For V1 records retain eventType and the existing V1 shape.

Specific selections require 1..maxSpecificOccasions approved, active, applicable IDs. Fits All uses occasionScope: "all" and occasionIds: []; every active applicable occasion must be approved for the provider. Use the complete returned catalog and capability lists to render choices. No labels are guaranteed by this gallery catalog type; resolve presentation labels separately without treating them as authority.

Do not submit providerId, ownerId, authority, policy, or other envelope metadata. The server derives identity from the verified linked session. New photos retain provider-owned URL checks and server image verification. Saves fence gallery, catalog, eligibility, provider, category, and policy state in the existing B2B transaction. Failed transactions do not write. Success returns the same gallery shape with revision incremented, resolved setups, and current authority; adopt that response as editor state.

## Authorization and publication

The loader uses existing private catalog access, allowing an active linked provider awaiting review to view drafts. It also rechecks user/provider ownership, role, active state, catering configuration, blocked/suspended/deleted flags in the transaction. Save retains approved-provider access. This task does not expand draft saving to unapproved providers.

Private draft saves, once separately approved and activated, do not require publicReads: true. Both existing web coverage gates still must pass, along with the valid privateWrites policy. Public V2 proposals additionally require the separate publication gate, publicReads policy, and legacy mapping. The publication gate remains false. V1 publication checks are unchanged. Only /provider/packages is revalidated by the private action.

The old V1 editor fails safely on mixed galleries, including when V2 appears between preflight and transaction. It cannot erase private V2 drafts. The customer reader strictly validates the entire stored gallery and returns only published V1 records; private V2 records are excluded.

## Result and error handling

Both actions return `{ok: true, gallery}` or `{ok: false, code, error}`. Render safe error text; branch on code:

| Code | Meaning / frontend response |
| --- | --- |
| FORBIDDEN | Authentication, active account, provider linkage, or authorization failed. Sign in with the correct provider account. |
| INVALID_REQUEST | Invalid version/envelope/records or malformed stored data. Correct proposal fields; escalate stored-data problems. |
| UNAVAILABLE | Missing/malformed authority, disabled/expired policy, release gate, incomplete catalog, or blocked V2 publication. Disable save; contact backend owner. |
| CONFLICT | Gallery, catalog, or eligibility changed. Reload all gallery and authority state, then explicitly reconcile unsaved edits. |
| INVALID_SELECTION | Occasion/category capability needs review. Reload choices; remove unsupported selections or request review. |
| IMAGE_VERIFICATION | Photo ownership or image verification failed. Correct/reupload images and retry. |
| INTERNAL | Unexpected backend failure. Retry or contact support; private backend details are not returned. |

Do not retry conflicts with a new revision while blindly reusing an old full replacement. Never invent revisions or use a missing authority as revision zero. Initialize all three revisions only from successful load and replace them after successful save. Missing gallery starts at revision zero only when returned by the server.

## Readiness and B2D

Ready for Pia to code against locally: action imports, result union, mixed-record editor serialization, error handling, and mocked successful-save contract are available. Disable Save whenever availability.canSave is false, and disable all V2 publication controls while canPublishV2 is false. Loading also requires existing trusted authority and valid policy; an unconfigured environment returns UNAVAILABLE.

Not ready for live end-to-end testing: production writes remain intentionally unreachable. No environment flag or policy alone can bypass the hard-coded coverage approvals. No public V2 reader is approved.

B2D must verify deployed revocation-aware authentication, linked/cross-provider access, App Check boundaries where applicable, Firestore authority protection, all privileged writer/revision coverage, policy environment and expiry, Cloudinary ownership/verification, transaction races and retries, mixed V1 customer compatibility, and protected authority lifecycle. Review and explicitly approve activation separately; do not flip gates to test frontend integration. Public V2 publication needs its own reader and authorization approval.

## Local validation for this change

- Web TypeScript: passed.
- Targeted ESLint: passed with zero warnings.
- Focused Vitest: 76/76 passed across five files (private actions, writer gates, V2 parsing/resolution, public compatibility, V1 gallery).
- Offline Node transaction tests: 23/23 passed; the isolated VM enables only its own copy of the two write guards and executes the real V1/V2 parsers.
- Existing approval/security contract tests: 8/8 passed.
- git diff --check: passed.
- Functions source was unchanged; Functions TypeScript was not required.

Files touched by B2C: setup-gallery-actions.ts, provider-setup-gallery-v2-writer.ts, new provider-setup-gallery-private-service.ts, new provider-setup-gallery-private-actions.test.tsx, provider-setup-gallery-v2-writer.test.tsx, provider-setup-gallery-v2-transaction.test.cjs, and this handoff. Existing unrelated working-tree changes were preserved.
