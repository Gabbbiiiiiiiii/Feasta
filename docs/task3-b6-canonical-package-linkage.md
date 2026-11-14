# Task 3 B6: canonical package linkage

## Root cause and corrected contract

The acceptance snapshot validator assumed every non-null packageId was the parent's singular legacy catering assignment. Consequently request two failed service linkage; payment terms and financial totals would also have been compared to package one.

New submissions explicitly write assignmentKind = independent_package on each request and packageAssignmentVersion = 1 plus packageAssignments on the parent. Each assignment identifies its request, provider, package, resolved revision, services, financial amounts and package payment terms. Membership must be exact and unique. Acceptance compares the request to its own server-written assignment, then runs the existing service, payment-term, event-scope and financial validators using only assignment-owned package fields. Shared event fields always come from the actual parent. Independent packages currently use the trusted catering package contract; marketplace add-ons remain legacy addon requests with null package identity. Unversioned legacy primary catering assignments retain the original parent validation, including historical missing-payment-term compatibility.

One mainEvents document retains complete providerRequestIds. Its totals include all independent packages. Singular package/provider fields remain a display projection of the first assignment; independent package linkage uses packageAssignments. Independent packages are not counted as marketplace add-ons.

Replacement continuity now also preserves assignmentKind; the existing category multiset, event scope, rejection evidence, predecessor and cycle checks remain intact. Relationship version 1 is retained for initial submissions; this change does not enable a replacement writer or alter the relationship rollout gate.

The transaction coordinator, package resolution, availability reads, acknowledgement validation, trusted pricing, idempotency and atomic writes are preserved. No acceptance, payment or relationship checks were removed.

## Files changed by this task

- functions/src/bookings/submit-multi-provider-booking.ts (existing untracked draft)
- functions/src/provider-requests/provider-request-integrity.ts
- functions/src/provider-requests/provider-request-relationships.ts
- functions/test/multi-provider-submission.integration.test.cjs (existing untracked test)
- functions/test/provider-request-relationships.test.cjs
- docs/task3-b6-canonical-package-linkage.md (this report)

## Verification

All verification uses offline Node tests and in-memory Firestore transaction doubles. No emulator or live Firebase data was used.

- Integration: 20/20, including successful 2-, 3-, 4-provider submissions, one event with complete membership, retry/conflict behavior, acknowledgement errors, identity errors, availability, atomic failure, independent acceptance plans, rejection aggregation and assignment tampering.
- Distinct price/revision regression: 15,000 and 23,000 packages, revisions 3 and 4, event total 38,000.
- Distinct payment terms regression: full payment alongside 50% deposit; each passes the real acceptance snapshot validator against its own parent assignment.
- Original multi-provider modules: 120/120 (integration tests are additional).
- Provider availability: 14/14.
- Relationship suite includes independent-package replacement continuity and assignment-kind/category mismatch rejection.
- Full top-level Functions offline regression suite: 3,165/3,165 passed, zero failures; includes existing legacy acceptance/integrity, package payment terms, payment settlement/readers, cancellation/refund, booking completion and relationship suites.
- Functions TypeScript build passed with pnpm.cmd build from functions/.
- git diff --check passed; Git emitted line-ending notices only.

## Downstream review and release gate

Reviewed the complete assertSelectedServiceLinkage, assertPackagePaymentTermsLinkage, bundleCategories and hasAssignmentContinuity implementations and their direct callers. Acceptance consumes the common validator and financial snapshot builder. providerAcceptancePlan uses exhaustive membership and independent response overrides. Rejection recalculates the parent while preserving sibling request states. Payment linkage/readers are scoped by providerRequestId, providerId, customerId and parent membership. Cancellation, refunds and completion use request-specific financial/refund evidence; lifecycle and payment-session relationship consumers retain exhaustive relationship validation.

The callable remains unexported from functions/src/index.ts. No web/mobile integration was attempted.

Remaining release limitations:

1. authorizeAndPrepare/classifyTrustedRequest in submit-multi-provider-booking.ts explicitly rejects non-catering package providers. Supporting independent non-catering packages requires a trusted category/package/payment contract; this patch does not label them catering or marketplace add-ons to evade validation.
2. New tests exercise the real acceptance validator, financial builder, acceptance planner and status aggregator, but do not drive the authenticated accept/reject/payment/cancellation/refund/completion callables as a complete transaction sequence over newly submitted documents. Existing downstream regression tests pass; that is not proof of a complete callable workflow. Keep the export gate closed pending that acceptance criterion.
3. The pure replacement relationship contract is tested. No independent-package replacement writer is enabled; a future writer must append matching immutable assignment snapshots and preserve complete membership and commercial evidence.

No known failing backend tests remain. These verification/scope limits are recorded rather than declaring a general multi-category production rollout ready.

## Git and deployment

Branch: chore/monorepo-setup. Existing modified and untracked work preserved. No commit, push, deployment, emulator, live Firebase write or web/mobile edit was performed.
