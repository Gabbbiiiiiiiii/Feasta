# Persistent event customization drafts — implementation review

## Root cause (established before editing)

`PreparationDraftMemory` held one snapshot in a Dart process singleton. Android force-stop destroys that singleton; it was never written to disk. Changing its account/provider/package scope also replaced its snapshot. Saving occurred on a few explicit changes, before step navigation, before summary navigation, and during disposal. Disposal is not guaranteed on process termination. Many edits had no immediate save path.

Initialization populated defaults, restored memory, then reapplied `initialServiceTier`, potentially clearing the restored theme, and unconditionally reset the step to zero. A separate asynchronous global selected-address load could seed an empty address without account scoping. Summary navigation already revalidated package and add-on selections and used preparation-only mode. Agreement/refund acknowledgments and durable attempt identity belong to the summary/controllers, not the customization snapshot.

## Changed-file inventory

- `lib/features/customer/event_draft_persistence.dart`: separate secure store, serialized operations, versioned strict schema and account/provider/package keys.
- `lib/features/customer/event_customization_screen.dart`: asynchronous restore, initialization ordering, current-offering validation, debounced edits, lifecycle/disposal flush, account guards, recovery message and confirmed discard.
- `test/features/customer/event_draft_persistence_test.dart`: simulated storage/restart/isolation/ordering/failure/deletion, Maps model, secure namespace and uncertain-attempt compatibility tests.
- `test/features/customer/booking_preparation_flow_test.dart`: persistent fixtures, restart/discard/stale add-on recovery, current-offering regression updates.
- `test/features/customer/package_customization_revision_test.dart`: persistent fixtures and stored Maps/theme assertions.
- `docs/persistent-event-draft-review.md`: this report.

The pre-existing untracked `docs/m4-4-android-persistence-validation.md` was not edited. No dependency, native configuration, attempt coordinator, consent controller, payment, backend, rules or web-reference changes were required.

## Persistence and timing

Uses the existing `flutter_secure_storage` dependency. Android has a dedicated `feasta_event_drafts_v1` namespace with authenticated encryption and `resetOnError: false`; iOS uses a separate Keychain account with device-only, unlocked accessibility and no synchronization. Unsupported platforms fail closed. Writes are read back to verify persistence. No plain preferences fallback, server writes, credentials, payment data, consent or request IDs are used.

Each key encodes the JSON tuple `[customer UID, provider ID, package ID]`; the version-1 record repeats and validates that scope. Reads, writes and explicit deletion serialize through one process service. A save captures detached JSON before awaiting, preventing mutation or older asynchronous completion from overwriting newer saves. Queued writes check the current UID; an already-started old-account write can complete only at its original scoped key.

Text controllers and form state changes schedule a 350 ms debounce. Existing explicit saves remain, and background/inactive/hidden/detached lifecycle transitions and disposal flush the current edited snapshot. Restoration and confirmed deletion do not themselves save an empty or rewritten draft. Failed saves retain prior persisted data and show a non-crashing message. Asynchronous writes cannot guarantee recovery from sudden power loss, force-stop during a write, or termination before debounce completion.

## Recovery, stale data and personal information

Editing is gated until recovery finishes. Defaults and initial service tier apply before recovery, so valid saved values win. Partial forms, schedule, guest count, all inclusion groups, service tier, package/custom themes, both add-on sources, customer-arranged preferences, notes and a valid step are preserved. An invalid step transition falls back to event details.

The full `CustomerAddressModel` is serialized, including label, house/street/barangay/city/province/postal/country fields, notes, timestamps, default flag and finite bounded latitude/longitude. Address/city must match the visible draft text; editing those fields invalidates a previously selected map address. This screen no longer automatically imports a globally stored selected address, because that service has no UID scope. Manual and session-only Maps routes remain available.

On recovery the screen fetches the current eligible package from its original provider. Inclusion selections, service tier and theme are checked against current offerings. Fixed inclusions use the current fixed package. Add-ons persist references only, never historical display details or prices. Each reference is fetched again and checked for original provider ownership and catering-provider ownership; unavailable/foreign selections are removed and current details/prices are used. The recovery notice requires review and explains that nothing was submitted. Review navigation continues to revalidate the package/add-ons.

Malformed records, unsupported versions, invalid field types, dates/times, invalid coordinates, scope mismatches or storage errors block recovery without deleting or overwriting the saved record. An unavailable package or failed current-offering lookup similarly retains the record and asks the customer to reopen to retry or explicitly discard it. Discard requires confirmation and deletes only this scoped event draft. Sign-out and closing do not delete it. UID checks after awaits and an auth-state listener prevent another account from seeing the form or saving into its scope.

## M4.4 compatibility and submission boundary

Event drafts use neither the attempt store nor its namespace and never prepare request identities during restoration. Existing summary handling still uses immutable selection identities, stable IDs, mismatch checks and uncertain-outcome reconciliation. Draft save/read/delete tests retain an uncertain attempt's exact bytes and ID; an explicit attempt preparation with a conflicting selection remains blocked. Agreement and refund acknowledgment state is never serialized or restored. Preparation-only navigation and disabled submission remain in force; no payment functionality was enabled.

## Automated validation

- Focused draft, customization flow and package/Maps customization tests: 53 passed.
- M4.1–M4.4, agreement/refund, attempt storage/readiness, booking contract, availability and Maps regressions: 121 passed.
- Flutter analysis: zero errors and no findings in changed files; 14 existing findings remain in unchanged files (2 warnings, 12 informational findings).
- `git diff --check`: passed.
- Modified-file inventory reviewed; no commit, push, deployment or device commands performed.

## Remaining native-device validation

Physical-device installation requires the user's separate approval and has not been performed. On an approved build, verify Android secure namespace behavior, background/force-stop/relaunch recovery after allowing a save to finish, full Maps coordinates, account switching, discard confirmation, offline/unavailable package handling, and stable/uncertain existing request identities. Do not clear app data or reinstall/reset the app as a recovery test. Native keystore failures and sudden termination during writes are not fully simulated by unit/widget tests.

## Focused review corrections

Only five of the existing recovery files were edited for this correction: `event_draft_persistence.dart`, `event_customization_screen.dart`, `event_draft_persistence_test.dart`, `booking_preparation_flow_test.dart`, and this report. The existing package-customization test changes and untracked M4.4 Android report were preserved.

1. Duplicate references previously passed per-item validation and were appended to the restored selection, inflating the pre-review estimate. Validation now rejects repeated trimmed, case-sensitive add-on IDs across all providers and sources, matching the selection contract's identity semantics. Distinct IDs from the same provider remain valid. Duplicate records fail before package/add-on lookup or estimate rendering; stored invalid bytes are not rewritten or deleted.
2. Deletion previously changed a flag without rebuilding before awaiting storage. Confirmed deletion now synchronously rebuilds into a busy screen with back navigation blocked. Guards prevent repeated dialogs/deletes, edits through stale callbacks, new saves, step/review navigation, and map/manual/date/time/marketplace operations. An action epoch rejects old asynchronous picker results even after deletion finishes. Existing serialized saves finish before deletion; the pending debounce is canceled. Failure retains form and stored data, restores the prior blocking state, shows a retry message and clears busy state. UID checks and mounted checks protect account changes/disposal.

New coverage: duplicate catering/marketplace IDs; whitespace aliases across sources/providers; distinct IDs from one provider plus marketplace references; invalid records retained without inflated price display; controlled save-before-delete ordering; delayed success, failure, account switching and disposal; stale edit/continue/discard callbacks; real back-navigation blocking; canceled debounce; successful scoped deletion; recoverable failure retaining the pre-delete edit; and canceled confirmation with duplicate-dialog prevention.

Final automated results: 53 focused tests and 121 broader regressions passed (174 total, 0 failed, 0 skipped in final runs). The focused suite includes 12 new cases. Affected-file Flutter analysis (both implementation and both test files) reports no issues. Full-app Flutter analysis still reports only the previous 2 warnings and 12 informational findings in unchanged files, with zero errors or findings in affected code. `git diff --check` passed. M4.4 identity/readiness and Maps regressions remain intact. Existing phone installation/data were untouched; no ADB, installation, backend changes, bookings, payments, commits, pushes or deployment were performed.

Verdict: **READY FOR INDEPENDENT RE-REVIEW**.
