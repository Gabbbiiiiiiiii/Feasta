# Controlled Fixed Package V2 recovery

Implemented locally on `chore/monorepo-setup`. The previous Fixed persistence correction and all unrelated uncommitted work are preserved. No production data was read or modified, no emulators were used, and nothing was committed, pushed or deployed.

## Scope and workflow

Eligible older-writer records must explicitly be Fixed, Per Pax or Per Bundle, with canonical payment terms, original creation metadata, and genuinely private, unpublished, undeleted Draft state. Existing V2 contracts and broad historical legacy shapes are excluded. There is no package-ID allowlist: the same narrow operation can serve the two affected IDs and other drafts with this exact shape.

From an incomplete Fixed draft card, choose **Review recovery**. `previewFixedPackageV2Recovery` authenticates the current provider, verifies current ownership and policy, then derives a complete proposal from the saved server record. No client replacement payload is accepted. The dialog displays every original and proposed field, including creation timestamps with nanosecond precision. Unknown top-level and nested fields are listed together. An unsupported or lossy mapping blocks confirmation. Preview writes no package, dependency, audit or replay documents; the ordinary callable security rate-limit accounting still applies.

The provider must check the review confirmation and choose **Confirm recovery**. `recoverFixedPackageV2Draft` accepts only the original package ID, original fingerprint, proposal fingerprint, explicit confirmation and idempotency key. It never accepts editable package content or an invented existing revision. Ambiguous outcomes retain the exact request in provider-scoped session storage; **Retry unconfirmed recovery** reuses the same request and key, including after reopening the review.

The server fingerprint includes all source fields, the package/provider IDs and Firestore document update time, preserving timestamp nanoseconds and detecting a changed-then-restored document. The proposal fingerprint binds that original fingerprint to the deterministic, validated proposed record and converter version. Only the execution timestamp is a declared server-generated placeholder. Current catalog-derived fields are included, so a changed catalog proposal requires another review. Fingerprints are deterministic comparison commitments, not bearer authorization tokens; every request still requires current authentication, ownership and server authorization.

## Transaction and validation

Recovery uses the existing V2 transaction authority: active provider account, approved/verified provider, ownership, environment-bound policy, `packageDraftWrites`, active service category, current approved occasion catalog, pricing, provider capacity, payment policy and theme/media limits. Fixed recovery retains the existing `publication` maintenance admission and witness; no policy or gate is changed. Publication/discovery/booking gates do not authorize recovery and are not enabled by it.

Admission is read-only for package data. External image verification then checks every saved marketing and theme URL through `verifyPackageImages`, without a retained-image exemption. Authentication is refreshed afterward. The commit transaction rereads the source fingerprint, provider, policy, catalog, financial configuration and maintenance authority and recomputes the proposal. Any source change, incompatible proposal or revoked authority rejects the write.

The transaction updates the existing package ID to V2 revision 1, writes one `providerPackageRecoveryAudits` record and one `providerPackageV2Operations` replay result, and applies validated occasion dependency witnesses atomically. The original `createdAt` and `createdBy` remain untouched. All saved content is compared against the parsed canonical representation; even normalization, truncation or deduplication that would change saved content blocks recovery. Optional absent fields are not replaced with invented content. Unsupported selections, old financial deadlines and ambiguous partial occasion metadata are blocked.

The recovered package stays `status: draft`, `isActive: false`, `isPublished: false`, `providerPubliclyVisible: false`, `publishedAt: null`. Recovery never invokes publication. After refresh, reopen the original package with Edit to review the saved details. The existing ordinary Publish action and all its live safeguards remain separate. A recovered record with incomplete publication content still has to be completed through the ordinary V2 editor.

Replay returns the original confirmed result without reapplying recovery or creating another audit. It still authenticates the actor and checks current provider/package ownership, the existing draft-write gate and Fixed maintenance admission. A changed request under the same key is rejected. Audit and replay collections have no client access under the existing default-deny Firestore rule; no rules change is needed.

## Deployment and production prerequisites

Deploy only after review and separate authorization:

- `previewFixedPackageV2Recovery`
- `recoverFixedPackageV2Draft`
- The Web application containing the recovery review dialog/client.

Existing V2 callable exports retain their behavior; this feature does not require deploying them. Both new callables use the existing App Check settings and Cloudinary secrets configuration. There are no Firestore index, feature gate or maintenance-control changes.

Once deployed, the owning provider must preview each saved original:

- Filipino Birthday Feast: `sIWHG0eLBli5CfXoevkT`
- Birthday Celebration Catering Package: `71Rn6dOHj2OWsfd5Rtw1`

Actual eligibility remains unverified: this task has not accessed those production records. Unknown source fields, noncanonical payment deadlines, missing creation evidence, invalid pricing/occasions or unverifiable images will block recovery. Review and resolve any such blocker without manual Firestore patching or silently dropping content. Confirm each eligible proposal independently and review the saved original before using the separate ordinary publisher.

## Runtime files

- `functions/src/packages/fixed-package-recovery.ts` — inventory, lossless conversion and fingerprint primitives (new).
- `functions/src/packages/provider-package-drafts-v2.ts` — two recovery modes sharing the existing authority, external verification, transaction, registry and replay path.
- `functions/src/index.ts` — exports the two new callable targets.
- `apps/web/src/lib/provider/fixed-package-recovery-client.ts` — authenticated preview, confirmation, immutable retry and response checks (new).
- `apps/web/src/app/provider/packages/provider-package-recovery.tsx` — original/proposal review and confirmation dialog (new).
- `apps/web/src/app/provider/packages/provider-package-card.tsx` — recovery entry point for incomplete Fixed drafts.
- `apps/web/src/app/provider/packages/provider-packages-client.tsx` — refreshes the package list after recovery.

## Verification

Local tests inject Firestore transactions, Auth and external media services. They use compiled production handlers and are not deployed persistence or real Cloudinary ownership evidence. The suites cover both pricing models, full-field preservation, all unsupported fields, real-owner admission, App Check, source/update-time changes, stale catalog proposals, invalid pricing/capacity/occasion/payment policy, ownership/media failures, authority changes after verification, immutable retries, concurrent requests, audit rollback, optional partial data and prohibition of automatic publication.

Final command results are recorded after local verification.
