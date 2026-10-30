# Stage E backend review — integration blocked

Repository: C:\flutterProject\feasta-catering-package-enhancements
Branch: feat/catering-package-enhancements
HEAD: 3486b126e836071fd0abc00e16f1f928788a3b14

Stage E stopped during Step 1 under the user's explicit stop condition for unsafe ownership/feature-gate design. No backend fixes, exports, adapters, wizard changes, feature activation or deployment were made. All existing uncommitted Stage D files are preserved.

## Blocking finding: privileged media work precedes authorization and feature gates

`functions/src/packages/provider-package-drafts-v2.ts:139` invokes `verifyPackageImages(parsed.base, actor.uid)` before the transaction checks:

- Approved provider ownership at line 149.
- The default-disabled packageDraftWrites policy at line 155.
- Maintenance admission at line 159.

The call occurs for create and update with a new idempotency key. Authentication, provider role, App Check and rate limiting run first, but approved business ownership and operational access have not yet been established. `verifyPackageImages` checks URL shape and actor path and then uses the privileged Cloudinary resource API through `verifyProviderServiceImage`. It does not check the private-write policy or maintenance gate itself.

Consequently, an otherwise authenticated provider can initiate Cloudinary lookups even when the V2 operation is disabled, maintenance is paused, or the subsequent approved-provider authorization will reject the request. The transaction still prevents the canonical Firestore write; this finding is about external privileged work occurring before admission, not a demonstrated ownership bypass for package writes. Exporting these handlers would expose that behavior. A default-disabled rollout must reject such requests before external resource access.

## Verification of the finding

A local in-memory reproduction transpiled the current TypeScript handler with the existing TypeScript dependency. It substituted onCall, auth/role/rate dependencies, Firestore and the media verifier with stubs, while retaining the existing exact-envelope, offer and account-state validators. A valid create envelope contained a media URL. Two scenarios were tested:

1. Current actor/profile accepted; packageDraftWrites:false. The handler returned FEATURE_DISABLED, but the verifier had already been called once.
2. Approved provider ownership deliberately denied. The handler returned permission-denied, but the verifier was called again before that denial.

Both observations were asserted successfully. No Firebase app was initialized by the successful reproduction, and no external media calls, production queries or writes were performed. The initial reproduction setup failed to load because an unstubbed dependency requested a default Firebase app; it performed no successful Firebase operation. The corrected reproduction stubbed that dependency as well.

The Stage D tests exercise gate denial with empty media and foreign-URL denial as separate cases. They do not assert that media verification is never invoked when admission fails, so their passing results do not contradict this finding.

## Other review observations

- Canonical V2 types, offer/occasion validators, transaction read/write sequencing, current authority resolution, revision CAS, idempotency ledger and Stage C completion integration were inspected.
- Package write ownership, payment/price validation and private lifecycle flags remain enforced on the inspected transaction paths. No separate confirmed financial-validation defect was established in this review.
- Completion atomically links the retained progress record to its created package and releases incomplete quota. Stage C reads can retrieve completed progress.
- The existing Web parser discards the V2 occasion/revision/tier extension fields. Reopening V2 drafts will need a compatible reader before a full-replacement writer is connected, to avoid losing those fields.
- The handler unconditionally requires request.app, while shared emulator callable options disable App Check enforcement and the browser client skips App Check in emulator mode. Native local transport therefore still needs explicit, narrowly bounded demo-emulator integration. Production App Check must remain enforced.
- The reported Stage D 22/22 emulator suite uses raw-handler substitution for onCall and synthetic request.app. It is evidence of real Auth/Firestore transaction behavior, not native callable or browser acceptance. Those 22 tests were reviewed but not rerun during this stopped integration.

## Validation performed during Stage E review

- Functions direct TypeScript noEmit: passed.
- ESLint on the two Stage D backend modules: passed with no errors or warnings.
- git diff --check: passed.
- Targeted existing regressions: 72 passed, zero failures/skips. Suites cover V2 validators, progress validation, package management, pricing, legacy publication, booking offers, media checks and payment terms.
- Stubbed admission-order reproduction: passed; confirms the blocker. This is not a passing security assertion that the current ordering is safe.
- Native callable, Web adapter, wizard and browser acceptance tests: not run; integration was stopped.

## Required remediation before Stage E can resume

Add an authorized admission phase before external media verification, checking active account, approved owned provider, correctly bound current write policy and maintenance. Keep all checks repeated inside the final write transaction so a change between preflight and commit fails closed. Preserve external API verification outside retried transactions, current idempotent replay behavior and production App Check. Add tests asserting zero verifier calls for disabled gates, denied ownership and paused maintenance, including update requests. Review this backend remediation before exposing the handlers or integrating the wizard. Do not hide the finding by disabling media in the UI or weakening authorization.

## Integration and media status

The three new handlers remain unexported. Their existing gate remains default-disabled. No Web adapter contracts or wizard behavior were added in this review. Stage E's requested create/update/complete, conflict recovery, retry, reopen/edit and browser acceptance work remains pending. Successful owned-media Cloudinary verification and native transport remain untested. Stage C still rejects unverified asset IDs and does not save images.

## Files and working tree

Only `docs/catering-package-stage-e-review.md` was added in this review. Existing Stage D changes remain:

- Modified: functions/src/packages/provider-package-editor-progress.ts
- Untracked: docs/catering-package-stage-d-backend.md
- Untracked: firebase.package-drafts.test.json
- Untracked: functions/src/packages/provider-package-drafts-v2.ts
- Untracked: functions/test/emulator/provider-package-drafts-v2.integration.cjs

No reset, stash, discard, commit, push, merge, dependency installation, node_modules junction changes, production feature flags, production Firebase data access, deployment, Mobile edits, or customer booking/payment behavior changes occurred.
