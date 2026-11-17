Customer Mobile Step 3 and coordinated Event List submission — local review report

Repository: C:\flutterProject\feasta
Branch: chore/monorepo-setup
Baseline: dc8cf32edca44d1b86497af14e5e6f1daa8f4309
Date: 2026-11-14 (Asia/Manila)

Status: Step 3 and Event List review are verified locally. Coordinated submission is implemented for the existing bounded server contract: 2–4 distinct catering providers, one configured package per provider, for the same event. Task C is PARTIAL for the requested arbitrary multi-provider workflow. Attached FEASTA add-ons, non-catering package contracts, multiple packages from one provider, and more than four selections remain unsupported. Such lists fail as a whole; no selections are dropped or submitted in a client loop. This report does not claim full heterogeneous Event List submission is complete.

1. What was already complete

Mobile already contained typed Event List identities, secure owner-scoped persistence, customization snapshots, provider grouping, catalog revalidation, configuration summaries, restore/edit flows, shared-event reuse, and the Step 3 review screen. Comparing against apps/web/src/components/customer/bookings/event-customization-experience.tsx confirmed the main Mobile review sections already existed: event and package edit actions, selected services and their providers, published selections, separate payment/refund review, server payment requirements, estimates, and guarded submission. The existing single-provider submitBookingRequest still supports its established catering-plus-marketplace-add-ons contract.

The baseline backend draft already supplied authoritative package/payment/refund preparation, bounded transaction reads, availability validation, deterministic idempotency, terminal acknowledgement receipts, atomic event/request creation, notifications/audit, assignment-aware acceptance validation, and the customer booking restriction gate. It was not exported from functions/src/index.ts and was not connected to Mobile. No deployed behavior was inferred from source presence.

The earlier docs/customer-mobile-step3-final-alignment.md records six historical preparation failures. The current focused run passes the relevant preparation, navigation, and descendant cases. This report records the current checkout's verification; it does not rewrite historical evidence.

2. What was missing and what changed

The Event List had no coordinated review/submit route. It now opens a read-only snapshot of the entire saved list, shows shared event details and each provider/package configuration, loads all server disclosures in one call, requires separate current acknowledgements, and submits one coordinated event request. Back leaves saved selections intact. Saving/adding and disclosure loading do not create bookings or reservations.

Shared event comparison previously included provider-specific special requests. Those instructions can now differ while schedule, guest count, occasion and venue must agree. Existing display labels and legacy revision metadata are normalized only in transport, matching the established booking client; saved configurations remain unchanged. Provider cards remain compact and grouped without redundant headings. Step 3 provides a direct Review Event List action after saving or detecting an existing selection.

Agreement and refund term widgets are shared with the existing review routes. Payment deadlines/eligibility and amounts still come from authoritative disclosures. Consent expires at the current applicable deadline and is never persisted. The new submission controller binds to the account authorization generation, list revision, and active route. It persists the complete request identity before dispatch, blocks duplicate taps, and uses the existing reconcileBookingSubmission callable after uncertain outcomes or process restarts. Missing/corrupt storage or unresolved server outcomes never establish that a fresh request is safe. An unresolved attempt can require FEASTA support; this implementation does not erase or replace it to force another submission.

Backend requests now preserve provider-specific special requests, custom-theme notes and customer-arranged-service notes instead of losing them. The parent keeps its shared event instructions. Parent upfront totals sum existing authoritative integer centavos before conversion to pesos, preventing floating-point drift without changing any provider amount or payment policy. The new disclosure response includes explicit authoritative refund rollout metadata. New local callable exports are limited by the existing catering-only contract and existing add-on rejection guard.

The Dynamic Payment Expiration Engine and deployed 3-Strike implementation were not modified. Their existing submission, eligibility, payment, expiry and restriction helpers remain in use. Financial authority and refund rules were not changed. No Web production files or shared-type sources were changed.

3. Exact files changed

| File | Purpose |
| --- | --- |
| apps/customer_mobile/lib/features/customer/booking_agreement_review_screen.dart | Reuse existing agreement presentation in both review paths. |
| apps/customer_mobile/lib/features/customer/booking_agreement_terms.dart | New shared authoritative agreement term widget. |
| apps/customer_mobile/lib/features/customer/booking_refund_policy_review_screen.dart | Reuse existing refund presentation. |
| apps/customer_mobile/lib/features/customer/booking_refund_policy_terms.dart | New shared refund term widget. |
| apps/customer_mobile/lib/features/customer/event_list/customer_event_list_screen.dart | Group compact cards, compare shared scheduling correctly, open coordinated review after eligibility verification. |
| apps/customer_mobile/lib/features/customer/event_list/save_review_configuration.dart | Direct navigation from saved Step 3 configuration to Event List review. |
| apps/customer_mobile/lib/features/customer/event_list/event_list_submission_contract.dart | New complete-list transport projection and canonical shared-event comparison. |
| apps/customer_mobile/lib/features/customer/event_list/event_list_submission_controller.dart | New disclosure/consent, secure pending identity, single dispatch and reconciliation orchestration. |
| apps/customer_mobile/lib/features/customer/event_list/event_list_submission_screen.dart | New responsive coordinated event review route. |
| apps/customer_mobile/test/features/customer/event_list_submission_test.dart | New transport, readiness, persistence, idempotency, outcome, session and expiry coverage. |
| apps/customer_mobile/test/features/customer/event_list_submission_ui_test.dart | New 320px, normal/200% text, read-only review and Back preservation coverage. |
| apps/customer_mobile/test/features/customer/event_list_ui_test.dart | Updated submission-availability copy expectation; robust button-centered scrolling assertion. |
| functions/src/bookings/multi-provider-submission-contract.ts | Validate provider-specific planning note fields before storing them. |
| functions/src/bookings/submit-multi-provider-booking.ts | Preserve separate instructions/notes, expose refund rollout in disclosures, sum authoritative centavos. |
| functions/src/index.ts | Local exports of the reviewed bounded submit/disclosure callables. |
| functions/test/multi-provider-submission.integration.test.cjs | Read-only disclosure, note preservation, invalid notes, unsupported-contract atomic rejection and fractional-price aggregation tests. |
| docs/customer-mobile-event-list-coordinated-submission.md | This report. |

Pre-existing generated-file modifications were preserved: functions/vendor/shared-types-manifest.json, packages/shared-types/dist/freelance-service-details.cjs, and packages/shared-types/dist/freelance-service-details.d.cts. They are not task changes.

4. Validation

All verification used local unit/widget tests or in-memory transaction fixtures. No emulator or live booking/payment operation ran.

| Check | Final result |
| --- | --- |
| Focused Flutter acceptance set, 15 files | 178 passed, 0 failed. Includes existing aggregated accessibility/session scenarios. |
| Changed Dart production/test files | dart analyze: no issues. Formatting completed. |
| Functions TypeScript | tsc -p functions/tsconfig.json passed. |
| functions/test/multi-provider-*.test.cjs | 149 passed, 0 failed. |
| Immediate relationship/acceptance/financial/payment-set, payment eligibility/deadline/expiration and customer violation tests | 233 distinct tests passed. |
| Shared customer-package-v2, payment, refund-policy contracts | 19 passed, 0 failed. |
| Scoped Functions ESLint | No errors; existing max-len warnings remain. |
| git diff --check | Passed. |

The final Flutter command selected: booking_step3_alignment_test.dart, event_list_restore_edit_test.dart, event_list_review_parity_test.dart, booking_preparation_flow_test.dart, booking_submission_navigation_test.dart, booking_summary_ui_test.dart, customization_descendants_test.dart, booking_agreement_review_test.dart, booking_refund_policy_review_test.dart, event_list_submission_test.dart, event_list_submission_ui_test.dart, customer_event_list_test.dart, event_list_ui_test.dart, event_list_review_controller_test.dart, and save_review_configuration_test.dart. It used flutter_tools.snapshot test --no-pub --timeout 30s --concurrency=2.

The safeguard selection was provider-request-integrity.test.cjs, provider-request-relationships.test.cjs, provider-request-financial-snapshot.test.cjs, provider-acceptance-plan.test.cjs, initial-payment-expiration.test.cjs, initial-payment-expiration-worker.test.cjs, initial-payment-deadline-v4.test.cjs, initial-payment-eligibility.test.cjs, customer-violations.test.cjs, and provider-request-payment-set.test.cjs. One source-reading violation test initially failed because it was invoked from the repository root; rerunning from functions passed all 54 violation tests. No remaining assertion failure is attributed to that invocation.

Intermediate UI runs exposed an offscreen text-target tap and the production store's process-wide Future queue crossing separate fake-async test zones. The button assertion now centers the button; both new layout scenarios run in one fake-async zone, consistent with the existing Event List suite. Interrupted diagnostic runs are superseded by the green final acceptance run.

Ignored local evidence: .tmp/customer-event-flutter-final.log, .tmp/customer-event-functions-final.log, .tmp/customer-event-functions-integration-final.log, .tmp/customer-event-safeguards-tests.log, .tmp/customer-event-violations-tests.log, .tmp/customer-event-shared-tests.log, and .tmp/customer-event-ui-final.log. The safeguard log retains the initial working-directory error; combine its other 179 successful tests with the corrected 54-test violation run for the distinct 233-test result.

5. Firebase and client release requirements

Nothing was committed, pushed, deployed, or published. Everything remains local for review.

Two new Firebase Functions require a separate release from this checkout in the existing asia-southeast1 callable region: getMultiProviderBookingDisclosures and submitMultiProviderBookingRequest. Their local exports are not evidence that they exist in Firebase. reconcileBookingSubmission is reused without contract changes. No Firestore rules or index changes were made.

The release must also ensure assignment-aware downstream handlers from this baseline are present: acceptProviderRequest, rejectProviderRequest, completeProviderBooking, markProviderBookingInProgress, and advanceProviderRequestRefundEligibilityStage directly use the existing assignment/relationship helpers. Those handlers were not edited here. The deployed inventory was not queried, so their deployment parity cannot be certified; publishing only the two new endpoints must not assume older downstream code can handle packageAssignments.

The updated Customer Mobile client requires a new build/release after the backend contract is available. Customer Web is unchanged and does not use these new endpoints. Device appearance, deployed end-to-end behavior and heterogeneous provider/add-on submission remain unverified or unsupported as stated above. Completing the arbitrary mixed-service workflow still requires authoritative coordinated add-on/service resolution and corresponding integration coverage; the current guards were not removed to simulate that support.
