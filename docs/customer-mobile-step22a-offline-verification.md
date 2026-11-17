# Step 22A — final customer mobile offline integration verification

Date: 2026-11-15 (Asia/Manila).
Repository: C:\flutterProject\feasta.
Branch: chore/monorepo-setup.
HEAD: dc8cf32edca44d1b86497af14e5e6f1daa8f4309.

## Verdict: BLOCKED

The selected mocked backend and Flutter contract suites pass except for the proven pre-existing copy assertion. Full integration and controlled live E2E readiness are blocked by a customer read-query / Firestore authorization incompatibility found during source review. This is not an observed financial-authority bypass. No bypass or product change was made.

### Release blocker: provider request query cannot establish customer ownership

`apps/customer_mobile/lib/features/customer/independent_booking_display.dart:97` queries `providerRequests` with only `mainEventId == booking.id`. The production fallback runs when no BookingLifecycleScope is supplied. Booking Details routes mixed events directly to IndependentBookingDetails. The existing legacy BookingLifecycleBuilder uses the same query pattern.

`firebase/firestore.rules:322` defines canReadExistingProviderRequest using the document's customerId matching the signed-in user, provider ownership, or admin authority; line 1036 uses it for request reads. There is no parent-event-ownership alternative in that predicate. Filtering only by mainEventId does not prove customerId ownership for the possible result set. Under these local rules an ordinary customer query will be denied, even when the stored requests actually belong to that customer. Post-read Dart validation cannot authorize a Firestore query.

The offline widget tests inject streams and therefore cannot detect this rules boundary. This is a static local contract finding, not a deployed observation; no emulator or Firebase request was used to confirm it. Do not weaken rules to make the query pass. A separately reviewed correction should constrain reads to the authenticated customer (and event), preserve complete-set validation, review any required index, and verify signed-in customer/other-customer/provider access before release. The shared legacy query should be included in that review.

## Phase A contract evidence

These are composed boundary tests using mocked callables, fake streams and in-memory Firestore transactions, not one executable device-to-server E2E test.

| Requirement | Offline evidence and result |
| --- | --- |
| Independent identities | Mixed envelope, selection, transaction-reader, atomic submission, acceptance and independent display suites preserve provider/request/service identities. Marketplace requests do not fabricate package IDs. PASS. |
| Authoritative prices | Backend rejects supplied client prices and invalid monetary precision; trusted Catering resolution and fixed marketplace prices determine independent amounts and aggregate centavos. Mixed fixture verifies 15,000 Catering + 12,000 Photography = 27,000, with separate 7,500 and 12,000 upfront obligations. PASS. |
| Provider instructions | Marketplace-instructions and existing submission integration tests preserve separate requests/notes. PASS. |
| Refresh every revision | Mixed controller tests cover one and multiple marketplace services, refresh before disclosure/dispatch, invalid identity/revision and consent invalidation. Server transaction rechecks expected revision. PASS. |
| Provider agreements/refunds | Mixed agreement/refund preparation and controller tests check identity-linked disclosures, acknowledgements and mismatch rejection. PASS. |
| Stable clientRequestId | Submission, retry restoration, outcome and backend replay tests retain identity; changed fingerprint conflicts do not duplicate writes. PASS. |
| No false success | Backend atomic-write failures/rejections and controller failure cases do not establish success. PASS. |
| Uncertain restoration | Original envelope/ID retained; reconciliation only; no automatic resubmission; malformed envelopes fail closed. PASS. |
| Independent acceptance | Mixed acceptance/integrity and display tests cover independent accepted/pending/rejected states. PASS. |
| Correct payment target | Independent checkout and existing mobile payment contract tests retain request.id, option choice and centavos. Manage Payments opens the existing request-selection flow. No payment executed. PASS at mocked contract boundary. |
| Inconsistent snapshots | Independent model/widget tests reject missing, duplicated, mismatched identity, amount, financial and settlement evidence and hide unsafe actions. PASS. |
| Catering compatibility | Existing v1 backend suites plus mobile configuration, preparation, review, submission, lifecycle, bookings and deadline regressions passed except the unrelated pre-existing copy assertion below. |

The read-query blocker prevents certifying the complete actual customer read path despite those mocked passes.

## Phase B regression evidence

The rerun fails only `customer_payment_contract_test.dart`, `P13-D full payment customer copy new package and booking summary present Full Payment`, at line 144. It expects the exact quoted literal `'Full Payment'` in booking_summary_screen.dart. The literal is absent in HEAD's summary and present in HEAD's package details. `git diff --exit-code HEAD --` for all three files returned zero. Their HEAD and working-tree Git object hashes match:

- test: 274f73e6977effa0e44acbc65cccabf0eb105857
- package_details_screen.dart: 7362b46a7a8c96170b47f3946f15148bb3f9d61f
- booking_summary_screen.dart: 1fd42aa2d5de95dd77c89c64d2f48418da33ed92

The current executed test therefore reproduces against the exact pre-edit inputs; no alternate checkout or copy change is needed to establish this deterministic failure. Product copy was not edited.

Previously documented eight broader authentication assertion failures and three broader Home/Event List failures remain unresolved. They were not independently rerun here. Passing selected Event List and Home timeline tests does not clear those broader findings.

## Phase C exact completed totals

| Runtime | Passed | Failed | Skipped | Cancelled |
| --- | ---: | ---: | ---: | ---: |
| Functions | 427 | 0 | 0 | 0 |
| Flutter | 456 | 1 | 0 | 0 |

Functions: local TypeScript compilation (`node node_modules/typescript/bin/tsc -p tsconfig.json`) passed before executing the tests. Test selection: all top-level `multi-provider-*.test.cjs`, plus event-service-catalog-parity, independent-provider-checkout, provider-request-integrity, provider-request-relationships, provider-request-financial-snapshot, provider-acceptance-plan, provider-request-payment-set, submission-outcome and submission-outcome-callable. No rules/emulator suites ran.

Flutter: 31 files, run once to completion with installed flutter_tools.snapshot, `test --no-pub --timeout 30s --concurrency=2 --reporter expanded`. Selection (all under test/features/customer, suffix `_test.dart`): event_list_mixed_controller, event_list_mixed_models, event_list_mixed_submission, event_list_retry_restoration, event_list_submission, event_list_submission_ui, event_service_revision, independent_booking_display, customer_booking_presentation, customer_bookings_pagination, customer_bookings_source, booking_lifecycle_presentation, customer_payment_contract, initial_payment_deadline_v4, booking_complaint_action, home_booking_timeline, booking_step3_alignment, event_list_restore_edit, event_list_review_parity, booking_preparation_flow, booking_submission_navigation, booking_summary_ui, customization_descendants, booking_agreement_review, booking_refund_policy_review, customer_event_list, event_list_ui, event_list_review_controller, save_review_configuration, event_list_catalog, event_list_configuration_codec.

Targeted Dart analyzer: all 26 incoming modified/new Dart files, including the pre-existing repository edit: no issues. `git diff --check`: passed (only Git CRLF conversion notices). An initial Flutter launch and analyzer launch could not access local tool-state/cache files; completed runs with SDK access supersede these launch failures. They are not extra tests or skipped cases.

Evidence logs: `.tmp/step22a/functions-tsc.log`, `functions-tests.log`, `flutter-tests.log`, `flutter-analyzer.log`. `.tmp/step22a/before.json` records SHA-256 hashes of incoming tracked/untracked files. No incoming file changed during verification.

## Phase D deployment prerequisites — no deployment performed

Functions requiring deployment from this work:

- getMultiProviderBookingDisclosures
- submitMultiProviderBookingRequest
- listCustomerEventServices (updated marketplace metadata projection)

Use the existing asia-southeast1 callable contract. Deployment must also carry the changed shared provider-request integrity code into every deployed consumer, particularly acceptProviderRequest, rejectProviderRequest, completeProviderBooking, markProviderBookingInProgress and advanceProviderRequestRefundEligibilityStage. Verify all other importing exports in the release artifact rather than assuming a two-endpoint deployment updates shared code everywhere. Reconcile, request checkout, payment expiry/settlement and refund handlers must have compatible assignment-aware versions. Deployed inventory/parity was not queried.

Client compatibility: preserve schema-v1 Catering and bounded schema-v2 mixed selection contracts, explicit kind/provider/service identities and revisions, clientRequestId idempotency/fingerprint, exact per-provider agreement/refund acknowledgements, independent providerAssignments/providerRequestIds and immutable server financial authority. The mobile build must follow backend availability. Older consumers must not treat singular parent provider/package projections as authority for every provider or double-count marketplace totals.

Rules/index dependencies: resolve the customer read-query blocker above first. Existing customer-owned mainEvents list indexes and providerRequests customerId/createdAt, mainEventId/createdAt and providerId/status/eventDate indexes are declared locally. Occupancy reads use providerId, eventDate range and status filters. No new rule or index edit was made. Index requirements for the corrected query and deployed index readiness still require verification; local declarations are not deployment evidence.

Security/data: no financial-authority mismatch was found in the tested contracts. No migration was run or identified as required for new schema-v2 records; preserve legacy records and v1 decoding. Eligible marketplace catalog rows must already have authoritative ownership, active category/provider state, fixed price, published availability and positive revision; missing data is rejected rather than synthesized. Catalog population/backfill needs assessment before enabling affected selections. Unresolved authentication regressions and rules compatibility are release gates. Mixed nonpayment chat/cancellation/recovery/complaint UX beyond this display scope remains a separate assessment.

Safe future sequence: resolve and review the query authorization issue; triage unresolved regressions; validate release artifact/shared-runtime contents, consumer compatibility, catalog prerequisites and rules/index plan; obtain separate release authorization; release compatible backend/read prerequisites first; verify readiness in an approved nonproduction environment; distribute a limited mobile build; perform controlled device checks; expand only after results are reviewed. Nothing in this report authorizes deployment or live testing.

Minimal later device scenarios: signed-in Catering + Photography review/submission and independent request visibility; separate provider acceptance/rejection in both directions; each request's correct checkout choice/amount in approved payment test mode; changed service revision invalidating consent; connection loss/process restart retaining ID with reconciliation and no duplicate; missing/inconsistent snapshot hiding actions; account change and other-customer denial; Catering-only regression; narrow-screen/large-text navigation. No real payment is needed for those initial checks.

Controlled live E2E testing ready: NO, pending the read-contract blocker, regression disposition, release prerequisite checks and separate authorization.

## Git/Firebase status

Branch and HEAD remained exactly as expected. All incoming tracked and untracked files were preserved byte-for-byte (SHA-256 comparison: zero changed). Only this report and ignored local evidence were added; no product edits were necessary, so no product-file backup/edit occurred. No staging, commits, pushes, merges, deployments, Firebase production reads/writes, emulators, real payments or customer identity-verification implementation. Firebase deployed state remains unverified.
