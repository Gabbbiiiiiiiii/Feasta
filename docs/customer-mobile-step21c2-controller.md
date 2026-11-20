# Step 21C-2 controller integration

Branch: `chore/monorepo-setup`
HEAD verified before and after work: `dc8cf32edca44d1b86497af14e5e6f1daa8f4309`.

Changed files relative to the incoming working tree:

- `apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart`: exact trusted catalog lookup rejects multiple records, including ambiguous ownership. Authentication behavior is unchanged.
- `apps/customer_mobile/lib/features/customer/event_list/event_list_submission_controller.dart`: refreshes each marketplace service through `getEligiblePreparationAddon`, validates actual identity, availability and revision, and passes refreshed metadata to the Step 21B builder. Repeats this before dispatch; stale or unavailable metadata clears reviews and prevents submission.
- `apps/customer_mobile/lib/features/customer/event_list/event_list_submission_screen.dart`: invalidates reviews when the saved list revision, session or list error changes. No layout changes.
- `apps/customer_mobile/test/features/customer/event_list_mixed_controller_test.dart`: 15 controller/catalog tests.
- `docs/customer-mobile-step21c2-controller.md`: this report.

Mixed requests are wired to the existing regional `getMultiProviderBookingDisclosures` and `submitMultiProviderBookingRequest` callables. The production metadata lookup uses the owner-verified catalog. Separate payment and refund acknowledgements retain the exact server-provided keys and provider IDs. Marketplace configuration contains event details and instructions, with no client price authority. Catering-only requests remain schema v1 and do not refresh marketplace records. Changed revisions are rejected, requiring the saved selection to be refreshed and reviewed again.

No live call was made to verify deployed behavior. All execution used local test fakes. The existing backend remains responsible for transactional price, availability, revision and consent validation after the final client refresh.

## Verification

| Run | Passed | Failed |
| --- | ---: | ---: |
| Final focused models, builder, catalog revisions, submission controller/UI and new mixed controller tests, 6 files | 68 | 0 |
| Historical preparation failures' containing suites, 4 files | 61 | 0 |
| Completed broader Event List run excluding separately diagnosed auth, guest-panel and transfer-prompt suites | 268 | 3 |
| Authentication suite excluding pending-read cases | 11 | 1 |
| Seven pending-read auth cases, each in a fresh test process | 0 | 7 |
| Pre-edit snapshot: representative auth read case | 0 | 1 |
| Pre-edit snapshot: remaining auth notification case | 0 | 1 |
| Pre-edit snapshot: Home service revision suite | 0 | 3 |
| Pre-edit snapshot: guest confirmation case | 0 | 1 |

These rows overlap; do not sum them as distinct test coverage. Targeted Flutter analysis of all four Dart files: no issues. `git diff --check`: passed.

Focused files: `event_list_mixed_models_test.dart`, `event_list_mixed_submission_test.dart`, `event_service_revision_test.dart`, `event_list_submission_test.dart`, `event_list_submission_ui_test.dart`, `event_list_mixed_controller_test.dart`.

The six historical preparation failures named in `customer-mobile-step3-final-alignment.md` do not reproduce now. Their containing suites (`booking_step3_alignment_test.dart`, `booking_preparation_flow_test.dart`, `booking_submission_navigation_test.dart`, `customization_descendants_test.dart`) passed all 61 tests. Existing documentation already records subsequent green preparation/navigation coverage; this step did not repair those flows.

The current broader failures are pre-existing:

- Three `event_services_revision_test.dart` Home tests omit `EventListScope`; `_HomeHeader` fails at `EventListScope.of`. All three reproduce in the pre-edit snapshot.
- Pending-read authentication tests expect zero notifications after `load()`, but `load()` emits a loading notification. All seven fail immediately at the same assertion when isolated. The first failed test never releases its gate, poisoning the process-wide storage queue and causing later timeouts. This is not evidence of a new authentication regression. The remaining authentication notification test similarly expects two calls and receives four; it also reproduces in the pre-edit snapshot.
- `guest Clear All requires confirmation` calls the customer-only `addPackage` API in a guest session and receives `unauthorized`. It reproduces in the pre-edit snapshot. Other guest/transfer tests can stall across fake-async zones because the storage queue is process-wide. Those suites were not repaired or declared green.

Two exploratory broad runs were interrupted after blocked queues (28 passed with 7 failures in the auth-containing selection; 269 passed with 4 failures in the auth-excluded selection). They are incomplete, not acceptance results. The completed 268/3 run excludes all three problematic suites. Initial tool invocations also encountered sandbox SDK/cache access and an unsupported exclusion flag; the completed runs above supersede those invocations.

Local ignored logs are under `apps/customer_mobile/*21c2.log`; pre-edit comparison logs are under `.tmp/step21c2-baseline/`.

## Retry and preservation

The existing clientRequestId, pending persistence, unknown-outcome blocking and reconciliation flow remain in use. Backend failure never creates local success. The retry decoder is byte-for-byte unchanged: it still reconstructs package-shaped selections and cannot restore schema-v2 marketplace requests. A mixed request interrupted after dispatch therefore remains conservatively blocked for reconciliation/support; schema-v2 restoration and related retry review remain Step 21C-3 work.

Before editing, all 50 incoming modified/untracked files were copied with matching SHA-256 hashes to `C:\Users\gabbyyy\AppData\Local\Temp\feasta-21c2-20261115-111404`; `manifest.json` records the hashes. Final comparison confirmed that only the three production files listed above differ among those original 50 files. The new test and report are additional files. An isolated pre-edit source copy was used for failure comparisons; working sources were never temporarily reverted.

No commits, staging, pushes, merges, deployments, production Firebase reads/writes, emulator tests, real booking/payment operations or identity-verification implementation. Customer Bookings and booking details were untouched. Step 21C-3 was not started.
