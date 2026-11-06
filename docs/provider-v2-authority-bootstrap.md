# V2 provider authority bootstrap

This is a local implementation and approval runbook. No deployment or production
mutation was performed. Target: `feasta-catering-system`, `asia-southeast1`.

## Existing lifecycle and narrow repair

Provider verification and other protected eligibility changes call
`advanceProviderEligibilityInTransaction`. That initializes/increments an invalidation
revision, without approving categories or occasions. Availability preferences and
legacy `eventTypesSupported` are not V2 approval evidence.

The existing `updateProviderOccasionCapabilities` validates explicit admin occasion
decisions and writes the authority sidecar, operation journal, audit and revalidation
record atomically. It requires a positive existing revision and remains unexported:
ordinary changes still need its archived-package and unpublished V1-gallery fences.

The new exported `initializeProviderOccasionCapabilities` uses that same implementation
with an absence-only precondition. `expectedProviderEligibilityRevision: 0` means the
document must be missing; successful approval creates revision 1 with explicit
`approvedOccasionIds` and `approvedCategoryCodes`. It never resets or replaces an
existing document, including a revision-only document. Such documents require the
existing capability-update lifecycle and its separate release review; this bootstrap
is deliberately not a general mutation or withdrawal endpoint.

The callable requires Firebase Authentication, enforced App Check, an active admin
role (including transaction-time profile revalidation), a valid provider-owner link,
an enabled owner Auth account, an active approved/verified provider and active owner
profile. Categories must be explicitly requested, present in the provider's verified
profile and active catering master categories. Each approved occasion must be canonical,
approved, active and applicable to a requested category. At least one explicit
occasion approval is required. Approval evidence (10–1000 characters) and a meaningful
reason (10–500 characters) are mandatory administrator attestations, not inferred
from preferences.

The stable catalog and its expected revision are read inside the transaction.
Provider, owner, category, occasion, authority and inventory reads precede all writes.
The operation key is scoped to administrator, operation name and idempotency key;
the hash includes normalized approvals and evidence. Exact replay returns the recorded
result without another grant or audit; changed payloads conflict. Competing initializers
cannot both create the sidecar. A stale catalog or existing authority aborts.

The authority records approver UID, server timestamp, evidence and operation ID.
The existing audit collection records reason, correlation ID, before/after grants and
revisions, approved categories, provider verification/owner/category evidence and each
occasion's revision, lifecycle and applicable categories. The operation and completed
zero-impact revalidation records commit with the authority.

Inventory is bounded to 40 packages. Existing V2/V3 or ambiguous inventory, larger
inventories, and published/non-V1/ambiguous galleries fail closed with
`GALLERY_REVALIDATION_REQUIRED`. Recognized legacy Fixed Packages are left untouched.
Private editor-progress documents do not confer authority and are not changed.
No publication gate, provider preference, legacy grant, or security rule is changed.

## Required release and production approval

Review only this patch together with the already isolated compatible private-draft
release. The working tree contains other pre-existing work; do not deploy it wholesale.

Functions needed for this fix:

- `initializeProviderOccasionCapabilities` — new administrative bootstrap.
- `createProviderPackageV2`, `updateProviderPackageV2`,
  `completeProviderPackageEditorDraft` — shared writer now reports
  `PROVIDER_OCCASION_APPROVAL_REQUIRED` for missing/uninitialized approval fields.

Deploy compatible web error mapping to explain that catalog approval alone does not
approve the provider. No new index, Firestore rule, policy activation or publication
function is required. Do not export/deploy `updateProviderOccasionCapabilities` or
`publishProviderPackageV2Internal` as part of this fix.

An authorized administrator must independently review the particular provider's
verification and category evidence and explicitly approve Birthday service. Record
the reviewed evidence/ticket and approval reason. Re-read the current stable catalog
revision; revision 22 was reported at diagnosis, not assumed permanently current.
Confirm the authority is still absent and inventory satisfies the above fences.

From the existing authenticated administrator web app with App Check initialized,
use the Firebase callable SDK (not an Admin SDK direct Firestore write):

```ts
import {getFunctions, httpsCallable} from "firebase/functions";

// app is the existing initialized app; the session must belong to the reviewing admin.
const initialize = httpsCallable(
  getFunctions(app, "asia-southeast1"), "initializeProviderOccasionCapabilities");
const result = await initialize({
  providerId: "REVIEWED_PROVIDER_ID",
  approveOccasionIds: ["birthday"],
  approvedCategoryCodes: ["catering_service"],
  expectedProviderEligibilityRevision: 0,
  expectedCatalogRevision: 22, // replace with freshly inspected stable revision
  approvalEvidence: "REPLACE WITH specific verification/service evidence and approval ticket",
  reason: "REPLACE WITH the administrator's explicit Birthday catering approval reason",
  idempotencyKey: "REPLACE_WITH_UNIQUE_APPROVAL_KEY",
});
```

Retain the exact request and idempotency key for replay after an uncertain response.
Confirm the returned provider ID, completed state, revision 1 and operation ID; inspect
the matching audit. A revision conflict requires reinspection, never deleting the
authority or forcing a reset. An idempotent response reports the original decision,
not a fresh assertion of eligibility after subsequent state changes.

## Resume the customizable draft

Keep the current wizard open until progress is safely retained. Authorization failures
only set the save error; form fields, tiers, food groups and media remain in memory.
Use the existing private editor-progress save/recovery path where supported before
refreshing. After the real administrator approval, retry the existing save/pending
request; do not create a second draft or remove selected occasions to evade approval.
For saved editor progress, reopen that same editorDraftId and use its current revision
for completion. Verify a returned package ID, revision and `status: draft`, then read
back the same private package. It remains unpublished and unavailable for booking.

## Local verification

Compiled callable tests use injected in-memory transactions and Auth/external-service
stubs, with real validation/category-policy code. They are not production or emulator
evidence. Functions TypeScript, web TypeScript, focused backend/web regressions and
`git diff --check` were run. No emulator was used.

Final results: Functions TypeScript and web TypeScript passed; 137 backend tests
passed across bootstrap, V2 persistence, capability legacy contract, eligibility
revision, legacy publication and Bilao compatibility suites; 34 web tests passed
across approval errors, save diagnostics, V2 wizard, production customizable and
Bilao compatibility suites. `git diff --check` passed. No final test failures.
An initial bootstrap-test fixture had an incorrect Firestore dependency injection
path; it was corrected before the passing runs. Real production persistence and
Firebase transaction contention were not tested.
