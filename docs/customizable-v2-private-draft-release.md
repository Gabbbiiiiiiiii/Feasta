# Customizable V2 private draft release correction

Scope: local only, 2026-11-05. No deployments, production reads/writes, commits,
pushes, emulator services, emulator environment settings, or dependency installs.
The production findings in the request are supplied evidence, not reverified here.
Existing working-tree changes are prerequisites for review, not changes authored
by this correction.

## Changes and security

- provider-package-drafts-v2.ts: exempt only V2 customizable private create/update
  and owner-bound schema-2 customizable editor completion from the publication
  maintenance read and lastAdmissionAt write. Both validation/commit phases use
  the exception. Publication retains its maintenance check and admission write;
  other draft structures and V3 retain maintenance admission.
- provider-package-editor-progress.ts: validated unbound customizable progress
  save/update bypass maintenance read/write. Other structures retain admission.
- package-editor-progress-v2.ts: inspected, unchanged; structural, selection,
  numeric-text, size, field and asset-reference validation remains intact.
- provider-package-v2-persistence-simulated.test.cjs: production-bound in-memory
  callable tests fail on any maintenance admission or maintenance read/write.
  Tests use App Check request evidence, no emulator/demo environment settings.

Provider role/account/ownership checks, App Check options, rate limits, two-phase
media verification, transaction read-before-write ordering, occasion lifecycle,
active category/occasion and provider eligibility validation, policy revision and
project binding, CAS, quota accounting and operation ledgers remain in force.
Public flags are server-owned and always private on these writes. Individual
canonical pricing, V3 production, customizable publication and unsupported
customer food-selection booking remain disabled. Fixed legacy writers are
unchanged by this correction. Incomplete progress is not a canonical package;
completion still requires full V2 customizable validation.

## Policy: read-modify-write plan ONLY

Authoritative path: contractPolicies/providerPackageV2. The current code requires:

- revision: positive safe integer.
- effectiveEnvironment: exact Functions GCLOUD_PROJECT (or GCP_PROJECT) project ID.
- maxSpecificOccasions: safe integer 1..100.
- maxThemeImages: safe integer 1..1000; actual theme allowance capped at 4.
- featureGates.packageDraftWrites: exactly true for create/update/completion.

Saving editor progress independently requires
featureGates.packageEditorProgressWrites === true. Media-bearing progress also
requires featureGates.packageEditorMediaWrites === true and verified registry
references. Completion still refuses unverified editor asset IDs; this patch
adds no editor-media promotion. Do not turn on additional gates for this release.

An authorized production configuration operator should first capture the current
snapshot, updateTime, revision, project binding and all fields in the approved
change record. Validate the above fields and independently confirm the progress
flag if progress saving is needed. Abort if the document is missing, the project
binding differs, or packageDraftWrites is not the expected false value.

Inside an Admin SDK transaction, reread the same document, compare its updateTime
with the reviewed snapshot (abort for renewed review if changed), and issue ONLY:

    tx.update(policyRef, {"featureGates.packageDraftWrites": true});

This is a dotted-field update, never set(), a featureGates map replacement, or a
full-document replacement. Transaction conflict detection also protects the read
from concurrent modification. Afterward reread and compare the entire document:
only that boolean may differ. Preserve revision, all publication/discovery/booking
flags, environment bindings, limits and every unknown field. A rollback follows
the same reviewed, concurrency-protected procedure to change only true to false.

No policy-specific revision bump or policy-admin mutation/audit endpoint was found
in the inspected draft code: it validates a positive revision, not an increment
for this flag. Do not invent a revision update. Use an IAM-authorized operator
and the project's existing production change/audit procedure, recording actor,
time, reason, before/after snapshots and updateTimes externally. If organizational
procedure requires an in-document revision/audit change, resolve that requirement
before activation because it exceeds the requested one-field mutation. Firestore
IAM authorization and the organization's audit process were not verified here.

## Isolated Functions release

Deploy targets needed later (NOT deployed here): createProviderPackageV2,
updateProviderPackageV2, completeProviderPackageEditorDraft, and
saveProviderPackageEditorDraft (changed progress-save maintenance behavior).
The entry point already exports these. getProviderPackageEditorDraft,
listProviderPackageEditorDrafts and discardProviderPackageEditorDraft are existing
supporting endpoints; verify availability before relying on recovery UI. Do not
deploy publishProviderPackage or export publishProviderPackageV2Internal for this
fix. No booking/payment/publication handler change is needed.

Include the index exports and complete compiled dependency closure, not just the
three callable declarations. Direct local dependencies of the changed modules:

- admin: occasion-dependency-registry, occasion-package-membership-plan,
  occasion-category-dependency-registry.
- shared: constants, auth, authorization, account-state, firestore,
  function-options, cloudinary, rate-limit, service-category-policy, maintenance.
- payments: canonical-balance-timing.
- packages: package-domain, package-payment-policy, offer-v2-validation,
  occasion-v2-validation, global-occasion-selection-v3, global-package-write-v3,
  provider-package-v2-public-occasion-contract, v2-validation,
  package-editor-progress-v2, individual-package-draft-write-v1,
  editor-draft-media-progress-v1, editor-draft-media-cleanup-v1.
- package-editor-progress-v2 directly requires individual-food-items-v2 and
  food-choice-groups-v2. Include their transitive dependencies as well. Some of
  these are currently untracked files; omitting them breaks module loading even
  when their feature paths remain disabled.
- Runtime: firebase-admin, firebase-functions, cloudinary, the vendored
  @feasta/shared-types provider-package-v2 subpath, matching vendor manifest and
  lockfiles; Node 22 and Functions package/tsconfig/runtime preparation files.

The shared-types archive/installed-runtime provenance test passes. Preserve the
current validated package contract and domain changes required for pricing,
classifications, selection groups and media validation. The existing Web adapters,
form/builder/readback changes are separately present in the dirty tree; do not
assume the deployed Web already contains them. No Web source is changed here.
Review an isolated release from these prerequisites rather than releasing all
unrelated dirty files. Supporting read/list indexes and callable App Check setup
must match the environment; production availability was not probed.

## Verification and remaining limitations

Functions tsc and Web tsc --noEmit pass. Targeted Functions tests cover private
create/update/progress save/completion/readback, Per Pax/Per Bundle, exact menu
and selection counts, CAS, replay/conflicts, ownership, invalid fields/pricing,
occasion transition, media rejection, Fixed compatibility, V3 admission,
publication/booking restrictions and shared runtime packaging. Transaction tests
are in-memory with injected Auth/category/external-service boundaries; they are
not production Firestore or successful live Cloudinary evidence. See the final
response for final counts: 104 Functions tests and 23 Web tests passed, zero
final failures; git diff --check passed (line-ending warnings only). Initial harness failures from importing the cleanup
service were corrected with a fail-closed cleanup stub; no product guard was
weakened to make tests pass.

Release remains blocked on authorized Functions deployment and the reviewed
one-field policy activation. Progress saving additionally depends on its existing
separate gate. Live callable transport, production IAM/App Check, successful owned
Cloudinary media and deployed Web compatibility remain unverified. The missing
maintenance document remains a blocker for operations that correctly retain that
gate, including public publication; this correction deliberately does not create it.
