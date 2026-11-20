# Customer Event List Phase 4: descendant authorization correction

Date: 2026-10-21 (Asia/Manila). Branch `feat/mobile-customer-parity`, approved HEAD `59ca173`. This candidate remains uncommitted and unstaged for independent re-review.

## Findings addressed and approved scope

The independent review found P1 exposure in already-open Review Event and Maps routes after their originating customization authorization closed. Checking the parent before push and rejecting returned results did not conceal a separate route already above the parent. Booking Summary's UID-based attempt listener cleared a message but continued rendering the captured event snapshot; a retained Prepare action could use that old snapshot under a later current UID.

P3 concerned the iOS edge-swipe scenario: it passed despite a missed app-bar Back tap. The swipe had already requested exit; releasing storage could finish navigation without delivering the later tap.

The existing 18-file candidate was preserved. The approved additional production files are `lib/features/customer/booking_summary_screen.dart` and `lib/features/customer/location_picker_screen.dart`. Both need operation-level checks in addition to concealment: a UI wrapper alone cannot reject retained Prepare callbacks or delayed GPS/search/selection completions. A new focused test file, `test/features/customer/customization_descendants_test.dart`, exercises the open-route gap. No other new production file or dependency was required. Existing shared session, customization, handoff UI tests and this report were updated within their earlier approved scope.

The exact cumulative inventory from Git is **21 files: 12 modified tracked files and 9 new untracked files**, including this report. The two unrelated protected reports are excluded.

```text
modified lib/app/router/customer_auth_navigation.dart
modified lib/features/customer/account/presentation/customer_account_management_screen.dart
modified lib/features/customer/booking_summary_screen.dart
modified lib/features/customer/customer_account_screen.dart
modified lib/features/customer/event_customization_screen.dart
modified lib/features/customer/event_draft_persistence.dart
modified lib/features/customer/event_list/customer_event_list_screen.dart
modified lib/features/customer/location_picker_screen.dart
modified lib/features/customer/package_details_screen.dart
modified test/features/customer/booking_preparation_flow_test.dart
modified test/features/customer/event_list_ui_test.dart
modified test/features/customer/package_customization_revision_test.dart
new      docs/customer-event-list-phase4-review.md
new      lib/features/customer/customization_session.dart
new      lib/features/customer/event_list/event_list_customization_controller.dart
new      test/features/customer/customer_root_navigation_test.dart
new      test/features/customer/customization_descendants_test.dart
new      test/features/customer/customization_session_test.dart
new      test/features/customer/event_draft_authorization_test.dart
new      test/features/customer/event_list_customization_controller_test.dart
new      test/features/customer/event_list_customization_ui_test.dart
```

This correction turn changed seven files: `customization_session.dart`, `event_customization_screen.dart`, the two approved descendant screens, `event_list_customization_ui_test.dart`, the new descendant test file, and this document. Other cumulative candidate files were retained from the previous correction.

## Shared descendant lifetime boundary

`CustomizationSessionBoundary` observes the original `CustomizationSession`, checks its live authorization, and irrevocably replaces the entire private subtree with a closed-session scaffold. Private text, controls, selection overlays and semantics are unmounted, rather than merely visually covered or pointer-disabled. Session closure is synchronous; a rebuild is scheduled in a microtask to avoid setState during framework tree finalization. No storage Future or exit animation delays concealment on the next valid Flutter frame.

The boundary captures the original binding and cannot be rebound to a new same-UID authorization generation. The session's disposal now closes/notifies before removing its upstream listener, so observing descendants cannot remain authorized when the owner disposes the binding. Children remove listeners when disposed and do not close their parent's binding on ordinary Back.

`CustomizationSessionRoute<T>` applies that boundary to existing nested screens without modifying those screen modules. Its pop result is null after session closure, protecting retained picker-result callbacks. Parent customization and Maps also validate authorization/action epochs after awaited route results.

The new optional constructor arguments preserve existing call-site source compatibility. Calls outside session-bound customization retain their pre-existing caller-owned security contract; this report does not claim that every standalone use of these screens has acquired a new global authentication policy.

## Review Event and Prepare request identity

Both production customization entry points pass their original binding into `BookingSummaryScreen`. The screen checks the binding's captured UID/generation and the live Firebase UID before preparation or disclosure navigation. It checks mounted/active-route state and authorization again after async work, including success, error and cleanup publication.

For bound reviews, session closure synchronously invokes the existing booking-attempt coordinator's invalidation mechanism. Queued preparation fails its existing epoch checks. A pending preparation is also invalidated when a still-valid bound Review route is disposed, so removing its listeners cannot leave queued work authorized by a later same-UID session. An already-invalid old review does not invalidate again during disposal or later auth notifications. No storage schema, request identity algorithm, booking-attempt coordinator implementation or submission transport changed.

The existing per-process coordinator remains the production default; an optional coordinator argument supplies controlled production-coordinator instances to tests. Opening Review Event performs no attempt read/write or request-ID generation. Only a deliberate authorized Prepare action invokes M4.4 preparation. Tests verify stable identity on repeated authorized preparation, no preparation after A-to-B replacement, rejection of queued work during same-UID replacement, and rejection after ordinary route disposal. Already-dispatched operations retain their original storage scope, as in the existing M4.4 contract.

Agreement and refund navigation are session-checked before push. Their existing resolver/loader constructor callbacks are wrapped in before/after authorization checks, preventing an old asynchronous resolution from initiating another disclosure request under a new lifetime. Their route boundaries unmount the screens and their controllers on invalidation. No agreement, refund, payment or consent policy was changed.

## Maps and nested descendant graph

Maps receives the same original binding. All location/search/geocoding/selection/confirmation entry points check authorization and active-route lifetime. Async completions check again before publishing, starting follow-on work, animating the map, returning a result, or acting on a nested manual result. Invalidation cancels debounce, advances request IDs, and drops the controller reference. The boundary removes the map, markers, address panel, search field and their semantics. The GoogleMap subtree owns native-controller disposal; this ownership was verified in the installed google_maps_flutter source. Actual device/platform-view teardown was not newly exercised.

The inspected and protected graph is:

| Origin | Descendant | Protection |
|---|---|---|
| Customization | Review Event | Original binding, boundary, guarded operations |
| Customization | Maps | Original binding, boundary, guarded operations/results |
| Maps | Manual address entry/edit | Bound route and invalid-result stripping; Maps rechecks returned results |
| Customization | Direct manual address | Bound route; parent epoch/authorization check |
| Customization | Add-on Marketplace | Bound route; parent epoch/authorization check; stream subtree unmounted |
| Customization | Date, start-time, end-time dialogs | Boundary in each dialog builder; returned values checked by the parent |
| Customization | Discard confirmation | Boundary; parent authorization checked before delete |
| Review Event | Agreement/refund reviews | Bound routes and guarded resolver/loader callbacks |
| Customization | Service/theme and provider add-on controls | Inline subtree concealed by the existing parent closed state |

The event-category dropdown contains only the package's published category, not private freeform customer data; the parent state guard rejects old selection callbacks. Maps' draggable address panel is an inline subtree, not an independent modal. Its nested manual editor is explicitly bound. Agreement/refund screens open no further customer-data-bearing route in this graph. Booking Summary's submission/Booking Submitted branch remains unreachable through `preparationOnly: true`.

While authorized, Maps preserves full address fields and coordinates on return, including its pre-existing timestamp/default normalization. The authorized test compares the complete address map. Existing Maps selection, draft recovery and Google Maps address regressions remain enabled.

## iOS Back test correction

The edge-swipe scenario now tests its own behavior: the dirty route remains until the held save finishes, then its gesture-requested exit completes. It no longer claims a subsequent missed tap caused that exit.

A separate iOS app-bar scenario finds the BackButton within the AppBar, requires it to be hit-testable and to have an enabled callback, and temporarily makes missed-tap warnings fatal. Before the real tap, the saving state is absent; after the tap, the saving live region must appear while navigation remains blocked. Releasing storage then causes exactly one durable save and exit. Diagnostics are not suppressed and no synthetic route pop replaces the control interaction. The final focused and full logs contain **zero missed-tap warnings**.

## Retained root navigation, drafts and session security

The previously reviewed root-return implementation is unchanged. Registered customization guards prepare the latest intended draft before any authorized bulk removal. The coordinator checks ownership, authorization, parent/top-route validity and progress after each pop. The only `popUntil` is the non-removing top probe with an immediately true predicate. Save failure retains edits and the original unchanged-stack root request for accessible Retry. Clean Back/root exit creates no default draft write.

Both Event List and Package Details retain generation-bound authorization and route-completion ownership. Their navigation callers await `route.completed` directly; widget disposal closes the binding and caller cleanup releases the owning lock. Dirty ordinary Back awaits verified persistence; popped routes cannot publish edits during exit animation. True authorization invalidation remains separate: old queued draft writes/deletes are rejected and security root return does not await held old-session storage. Bound descendants introduce no pop veto or synchronous removal loop.

Snapshot tracking, 350 ms debounce, latest-snapshot ordering, serialized secure storage, UID/provider/package keys, verified writes, recovery retention, failed-save Retry and no unchanged-recovery write are preserved. Event List fresh server validation, exact identity/eligibility/price checks, mutation-intent invalidation, failed Clear, dialog-open lookup races, Maps restoration and fixed inclusions remain covered.

## Open-descendant tests and evidence

`customization_descendants_test.dart` uses actual Navigator routes, the production session/coordinator classes, production entry screens and persistence/preparation implementations with controlled storage, Maps/GPS and disclosure futures. Its one runner case contains **31 separately identified scenarios**:

- `open Review Event conceals content and rejects retained Prepare: invalidate`
- `open Review Event conceals content and rejects retained Prepare: A to B`
- `open Review Event conceals content and rejects retained Prepare: A to B to A`
- `open Review Event conceals content and rejects retained Prepare: same UID`
- `open Review Event conceals content and rejects retained Prepare: suspend`
- `queued Prepare is rejected on same UID replacement without publishing`
- `authorized explicit Prepare preserves stable identity and opening never writes`
- `open Maps conceals address and rejects retained marker/confirm: A to B`
- `open Maps conceals address and rejects retained marker/confirm: same UID`
- `open Maps conceals address and rejects retained marker/confirm: suspend`
- `Maps rejects old debounce callback after invalidation`
- `Maps rejects old search callback after invalidation`
- `Maps rejects old details callback after invalidation`
- `Maps rejects old reverse callback after invalidation`
- `Maps rejects old GPS callback after invalidation`
- `nested Maps manual edit is concealed while its route remains open`
- `nested Review Event disclosure is unmounted on session closure: Review Booking & Payment Agreements`
- `nested Review Event disclosure is unmounted on session closure: Review Refund Policies`
- `authorized Maps returns complete address and coordinates`
- `Event List production handoff passes original binding into open Review Event`
- `Package Details production handoff passes original binding into open Review Event`
- `Event List production Maps inherits the original binding`
- `Package Details production Maps inherits the original binding`
- `production customization date route conceals on generation replacement`
- `production customization start time route conceals on generation replacement`
- `production customization end time route conceals on generation replacement`
- `production customization manual address route conceals on generation replacement`
- `production customization discard route conceals on generation replacement`
- `production customization marketplace route conceals on generation replacement`
- `normal Review disposal cancels pending preparation before later reauthorization`
- `disposing descendants releases listeners and rejects held preparation`

Privacy assertions occur while the existing descendant route is still current; tests do not pop it before checking closure. They check removal from the visible widget tree and the actual semantics tree, absence of sensitive actions, rejection of retained callbacks before/after rebuild, and inability to restore the old route through A-to-B-to-A or same-UID reauthorization. Nested tests keep the manual editor/policy route/date/time dialog/marketplace/discard route open during invalidation. Held policy responses are completed afterward to verify stale publication is rejected. Both Event List and Package Details production handoffs are checked for binding propagation into Review and Maps.

The existing handoff UI file is still one runner case, now containing **21 scenarios** after separating gesture and app-bar coverage. The root-navigation file remains one runner case with **18 scenarios**. Those 70 grouped scenarios are part of three runner cases; they are not added to runner pass totals. Exact identities are saved in `grouped-scenario-identities.json`.

Evidence directory, outside the repository:
`C:/Users/Pia/AppData/Local/Temp/feasta-phase4-descendants-20261021`.
Earlier evidence in `feasta-phase4-bulk-exit-20261021` was retained.

Installed Flutter command prefix:

```text
C:/flutter/bin/cache/dart-sdk/bin/dart.exe C:/flutter/bin/cache/flutter_tools.snapshot --suppress-analytics
```

| Final run | Command suffix | Result | Exit |
|---|---|---|---:|
| focused-verified | test --no-pub --reporter json, 23 recorded paths | 329 passed, 0 skipped | 0 |
| full-suite | test --no-pub --reporter json | 1,072 passed, 4 optional skips | 0 |
| analysis | analyze --no-pub, all 20 candidate Dart paths | No issues | 0 |
| format-check | dart --suppress-analytics format --output=none --set-exit-if-changed, 20 paths | 0 changed | 0 |
| whitespace | git diff --check | Passed | 0 |

Every command's exact argument vector, log, duration and process exit code is saved in `*.command.json`, `*.log`, `*.duration` and `*.exit`. The external `run_bounded.py` watchdog bounds Flutter test processes (360 seconds focused, 900 seconds full) and can kill their child process tree; no in-isolate timeout is relied upon to stop a synchronous loop. Earlier failed fixture/lint runs remain recorded and are excluded from final totals.

The current complete manifest is **95 test files**, increased from the historical 94 by the new descendant test file. Raw JSON runner evidence confirms **95/95 unique suite paths with completed cases**, no missing or unexpected paths, and no started-but-uncompleted tests. Both final runners emitted success completion events. All 329 focused case identities are included among the 1,072 full passes; they are not additional passes. `test-manifest.txt`, `full-suite.executed-suites.txt`, `full-suite.summary.json`, `focused-verified.summary.json` and `focused-subset-verification.json` retain this comparison. The focused subset intentionally excludes the other 72 manifest paths.

The four individually verified optional skips are:

- `real uploaded logo: Sophie's Shot`
- `real uploaded logo: Lerie's Photo`
- `real uploaded logo: JS Catering`
- `real uploaded logo: SB`

They belong to `real_provider_logo_review_test.dart`, gated on the optional external-image/golden review directory. No other skip is claimed. All 20 analyzed/formatted Dart paths are retained in `affected-dart-files.txt` and the exact command argument vectors. Additional whitespace checks include new/untracked candidate files.

## Repository and booking boundaries

Final branch/HEAD remain `feat/mobile-customer-parity` / `59ca173`; the index is empty and all work remains uncommitted. The protected `customer-bookings-search-contract-review.md` and `m4-4-android-persistence-validation.md` match their before SHA-256 hashes byte-for-byte. The web reference received no writes. Final status, full candidate inventory/hashes and protected-file verification are retained outside the repository.

No booking attempt or request ID is created merely by opening customization or Review. Existing explicit M4.4 preparation remains separate and session-checked. M4.5 submission and Gabriel's search/filter UI remain inactive. No payment, booking document, cancellation/refund permission, agreement requirement, provider-recovery workflow or multiple-provider checkout change was made. No stage, commit, push, branch change, reset, clean, stash, merge, rebase, deployment, production Firebase operation, package/SDK installation or Realme application installation/update occurred.

## Remaining limitations

Concealment is enforced by synchronous authorization rejection and removal on the next valid Flutter frame; it does not depend on old storage or network completion. Already-dispatched platform writes/requests cannot always be canceled and retain their original captured scope. Explicit preparation can be canceled when its bound Review route exits and safely retried; no success is fabricated for canceled work.

The guarantees concern the enumerated session-bound customization graph. Future private descendants must explicitly receive the original session/bound route. Standalone unbound legacy screen uses retain their previous caller contract. Ordinary draft saving still requires the coordinated exit path: arbitrary raw popUntil, forced removal/replacement outside that contract, persistent-root removal and process termination are not awaited save guarantees.

Eligibility and estimates are point-in-time checks, not a price lock or event-date availability guarantee. Native authorization transitions invisible to Dart cannot be synchronously detected. Physical Android/iOS secure storage, Google Maps platform-view teardown, native predictive Back and physical screen-reader behavior were not newly verified. Optional external-logo reviews were skipped as enumerated. Widget/semantics tests do not replace those device checks.

**READY FOR INDEPENDENT RE-REVIEW**
