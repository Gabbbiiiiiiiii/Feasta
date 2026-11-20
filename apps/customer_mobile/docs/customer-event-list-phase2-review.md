# Customer Event List Phase 2 review

Verdict: **READY FOR INDEPENDENT REVIEW**

Baseline: `feat/mobile-customer-parity`, approved checkpoint and current HEAD `0a3d590`.
No commit, staging, push, deployment, production Firebase mutation, or device installation was performed.

## Implementation and lifecycle

One app-owned `EventListScope` sits above MaterialApp's Navigator. It owns the production EventListController, which uses CustomerSessionCoordinator.shared through Phase 1's authentication adapter. All customer screens share that controller; screens never construct competing controllers. The scope loads once per newly authorized UID/generation, listens for authorization changes, and removes its listener and disposes its owned controller at teardown. The screen reloads on entry. The existing coordinator's suspend/resume validation drives restoration after application lifecycle changes.

Phase 1 synchronously hides previous state and rejects obsolete asynchronous operations using UID, generation, and epoch checks. The UI also binds Save, Remove, and Clear callbacks to the session they were rendered for. Confirmation is checked again after the dialog closes. Previously returned callbacks cannot apply changes to another customer.

## Package saving

Package details retains its Select Package customization action and adds Add to Event List plus View Event List. Saving requires no customization. It validates provider/package ownership, trims names, normalizes a usable HTTPS package image, and constructs the existing CustomerEventListEntry. Nonfinite, negative, or unknown prices remain unknown rather than becoming zero. The existing tuple identity handles repeat saves and identical package IDs under different providers.

Duplicate save taps are disabled while saving or opening login. Added to Event List is shown only from verified persisted state/success. Failed saves and capacity errors provide inline feedback without evicting existing entries. Feedback is scoped to the initiating customer session. Guests use the existing login sheet; guest package selections are never automatically saved or merged after login.

## Saved-list presentation and mutations

My Event List displays count, preparation-only guidance, package names, provider names, stored package covers through FeastaImage, optional PHP estimates, and neutral storefront fallbacks. No provider-logo lookup or new backend reads are introduced. Cards do not imply availability, and no catalog-navigation validation contract is invented.

Remove targets the exact provider/package tuple. Clear List offers Cancel and Confirm Clear List, describes its limited scope, and uses Phase 1's valid empty envelope. Both publish success only after verified persistence. Failed writes retain previously verified state and show an error. Storage-read failures are distinguished from a verified empty list, expose Retry, and never silently overwrite storage. Loading and signed-out presentations are included.

## Navigation and isolation

Home has a discoverable My Event List button. Package details has View Event List. The navigation helper requires customer authorization through the existing login flow and checks the live Event List authorization again before pushing. A completed guest login can continue to the list using the retained Navigator. This is an imperative customer-gated screen; no named protected route or route-guard allowlist change was added. Continue Browsing returns to the existing root shell. Home, Messages, Plan, Bookings, and Account remain intact; no second CustomerMainScreen is created.

## Validation

Final selected regression run: **292 passed, 0 failed, 0 skipped**, across 20 test files. Counts exclude Flutter runner loading/setup/teardown records. The new widget test is one runner test containing **19 sequential scenarios**, kept in one fake-async error zone because Phase 1 intentionally shares a process-wide Future queue. Scenario counts are not counted as additional runner tests.

Coverage includes add/re-add, unknown prices, verified success, save/read/remove/clear failures, capacity, empty/restored lists, exact-tuple removal, cancel/confirm clear, account switching during confirmation, A/B/A restoration, sign-out during a dispatched save, stale rendered callbacks, shared navigation/controller lifecycle, guest login gates with no guest writes, and 320px layouts at 200% text scale. Existing model/controller/authentication regressions cover multiple providers, tuple identity, verification mismatch, restart recovery, old asynchronous completion, and coordinator authorization guarantees.

The regression run includes Phase 1 Event List authentication/storage, session coordinator, route guard, booking attempts/readiness/storage/contracts, package preparation and flow, agreement/completeness/review, refund policies/review, persistent event drafts, customer payment contracts, and affected provider discovery tests.

Affected-file Flutter analysis: **no issues found**. Dart formatting is clean. `git diff --check` and an additional whitespace scan covering new Dart files pass. Physical-device behavior was not revalidated and the Realme application was not installed or updated.

Machine-readable test output is outside the repository:
`C:\Users\Pia\AppData\Local\Temp\feasta-event-list-phase2-cc63a6cd46cb464f868fde138be94e81`.

## Exact file scope

Modified:
- `apps/customer_mobile/lib/app/app.dart`
- `apps/customer_mobile/lib/features/customer/customer_home_screen.dart`
- `apps/customer_mobile/lib/features/customer/package_details_screen.dart`

Created:
- `apps/customer_mobile/lib/features/customer/event_list/event_list_scope.dart`
- `apps/customer_mobile/lib/features/customer/event_list/event_list_navigation.dart`
- `apps/customer_mobile/lib/features/customer/event_list/customer_event_list_screen.dart`
- `apps/customer_mobile/lib/features/customer/event_list/save_package_to_event_list.dart`
- `apps/customer_mobile/test/features/customer/event_list_ui_test.dart`
- `apps/customer_mobile/docs/customer-event-list-phase2-review.md`

The existing Event List model, controller, secure store, session coordinator, route guard, and authentication contract are unchanged. The two pre-existing untracked review documents were preserved and remain unstaged. The web reference was not modified. HEAD and branch remain unchanged, and the index is empty.

## Preserved controls and deferred work

No new Firestore writes, Functions, payments, booking records, booking attempt preparation, or event-draft synchronization were added. The secure storage namespace/format, verified read-back, 24-entry capacity, UID/generation guards, clientRequestId behavior, M4.1-M4.4 controls, draft/address recovery, password/phone controls, payment/chat eligibility, booking pagination, and cancellation/refund behavior remain unchanged. M4.5 remains disabled.

Phase 3 still owns deeper catalog revalidation, provider-grouped review, and current price/availability checks. Combined submission, multiple-provider checkout, custom-menu editing, service configuration snapshots, draft synchronization, new payments, and booking preparation from the Event List remain outside this implementation.

## Accessibility correction and full regression validation — 2026-10-20

Verdict: **READY FOR INDEPENDENT RE-REVIEW**

Root cause: the card supplied a semanticLabel containing only “Estimated price”; FeastaPriceText excludes its child text from semantics, suppressing the numeric amount. The card now uses FeastaPriceFormatter.format with an empty symbol to announce “Estimated price: 12,500.75 Philippine pesos.” for the visible ₱12,500.75. Both use the same default two decimal places. Unknown prices continue to announce “Estimate unavailable”. The shared price component, visual layout, calculations, and persisted values are unchanged.

Only customer_event_list_screen.dart, event_list_ui_test.dart, and this report were changed for this correction. The cumulative nine-file Phase 2 scope above is unchanged.

Two scenarios were added to the existing widget runner test, bringing its total to 21 scenarios (one runner test). Actual semantics nodes are inspected for the formatted amount/currency/estimate; traversal verifies exactly one node contains the numeric amount. Remove is checked for its label, button/enabled/focusable flags and tap/focus actions. Clear, Cancel, Confirm Clear List and Retry remain exposed; dialog actions support semantic tapping. Removing the card removes its price and removal semantics. A gated read checks Loading Event List and Updating Event List semantics; read failure and unknown-price descriptions are checked in the semantics tree.

The responsive scenario uses a 320×640 viewport, 200% text scaling, long provider/package names, a missing image, and a 12,500.75 estimate. The visible price intersects the viewport after scrolling; Remove and Clear remain reachable, confirmation cancellation and removal work, and no layout exception occurs.

Executed the entire normal-configured Flutter suite with --no-pub --reporter json: **976 passed, 0 failed, 4 skipped**, across **87 test files**, final success true. Hidden loading/setup/teardown records are excluded. The four pre-existing real-provider-logo cases (Sophie's Shot, Lerie's Photo, JS Catering, SB) skip because FEASTA_LOGO_REVIEW_DIR is unset. No cases failed to execute beyond these configured skips. Focused UI reruns are excluded from these totals. After an analysis-only test API cleanup, the final UI test was rerun successfully; production behavior did not change after the full run.

Coverage includes all existing authentication restoration/gates/navigation/login/registration/Google consent, startup, Home hierarchy, provider/package/customization, persistent drafts/locations, booking presentation/pagination/attempt security, password/recovery, payments and chat suites, as detailed below.

Flutter analysis of all eight affected/new Phase 2 Dart files: **no issues found**. Formatting of the two corrected Dart files: clean. Git whitespace and new-Dart trailing-whitespace checks: clean. Earlier focused iterations corrected test expectations for Flutter's merged card semantics and focus action; the final focused test passes.

Machine-readable full-suite and final UI results, stderr, analysis and validation outputs are stored outside the repository at:
C:\Users\Pia\AppData\Local\Temp\feasta-event-list-phase2-accessibility

Save/remove/clear implementation, controller lifecycle, navigation, guest login, capacity, tuple identity, session coordinator, secure persistence, and booking protections are unchanged by this correction. Full-suite regressions passed under the normal test configuration. M4.5 remains disabled. No staging, commit, push, deployment, device installation, backend operation, Phase 3 work, or web-reference modification was performed.

Limitations: Flutter semantics-tree tests do not replace physical TalkBack/VoiceOver validation; the Realme application was not updated. Optional real-logo tests retain their normal configuration skips. Native secure-storage/device behavior was not revalidated by these host tests.

### Full-suite inventory

Paths are relative to apps/customer_mobile. Passed totals exclude skipped and hidden runner records.

| Test file | Passed | Skipped |
| --- | ---: | ---: |
| test/app/router/customer_route_guard_test.dart | 4 | 0 |
| test/core/domain/provider_onboarding_test.dart | 6 | 0 |
| test/core/security/customer_session_coordinator_test.dart | 21 | 0 |
| test/core/theme/app_theme_test.dart | 6 | 0 |
| test/core/utils/startup_timings_test.dart | 1 | 0 |
| test/core/widgets/feasta_primitives_test.dart | 25 | 0 |
| test/core/widgets/responsive_layout_test.dart | 14 | 0 |
| test/features/authentication/account_recovery_controller_test.dart | 6 | 0 |
| test/features/authentication/account_recovery_screen_test.dart | 2 | 0 |
| test/features/authentication/auth_account_presentation_test.dart | 2 | 0 |
| test/features/authentication/auth_account_state_test.dart | 4 | 0 |
| test/features/authentication/auth_guard_bootstrap_test.dart | 3 | 0 |
| test/features/authentication/authentication_gate_widget_test.dart | 7 | 0 |
| test/features/authentication/authentication_responsive_accessibility_test.dart | 6 | 0 |
| test/features/authentication/authentication_restoration_test.dart | 3 | 0 |
| test/features/authentication/customer_auth_controller_test.dart | 18 | 0 |
| test/features/authentication/customer_auth_navigation_test.dart | 28 | 0 |
| test/features/authentication/customer_auth_state_repository_test.dart | 33 | 0 |
| test/features/authentication/customer_consent_screen_test.dart | 28 | 0 |
| test/features/authentication/customer_login_controller_test.dart | 15 | 0 |
| test/features/authentication/customer_login_modal_test.dart | 15 | 0 |
| test/features/authentication/customer_login_screen_test.dart | 4 | 0 |
| test/features/authentication/customer_profile_bootstrap_test.dart | 10 | 0 |
| test/features/authentication/customer_registration_controller_test.dart | 23 | 0 |
| test/features/authentication/customer_registration_screen_test.dart | 15 | 0 |
| test/features/authentication/email_registration_repository_test.dart | 10 | 0 |
| test/features/authentication/email_verification_controller_lifecycle_test.dart | 10 | 0 |
| test/features/authentication/email_verification_return_test.dart | 11 | 0 |
| test/features/authentication/firebase_phone_verification_service_test.dart | 35 | 0 |
| test/features/authentication/google_consent_button_test.dart | 8 | 0 |
| test/features/authentication/legal_document_screen_test.dart | 10 | 0 |
| test/features/authentication/password_reset_repository_test.dart | 19 | 0 |
| test/features/authentication/password_reset_screen_test.dart | 10 | 0 |
| test/features/authentication/phone_verification_controller_test.dart | 6 | 0 |
| test/features/authentication/phone_verification_screen_test.dart | 2 | 0 |
| test/features/chat/chat_repository_contract_test.dart | 3 | 0 |
| test/features/customer/booking_agreement_completeness_test.dart | 17 | 0 |
| test/features/customer/booking_agreement_review_test.dart | 10 | 0 |
| test/features/customer/booking_agreement_test.dart | 13 | 0 |
| test/features/customer/booking_attempt_readiness_test.dart | 9 | 0 |
| test/features/customer/booking_attempt_storage_test.dart | 2 | 0 |
| test/features/customer/booking_attempt_test.dart | 24 | 0 |
| test/features/customer/booking_contract_test.dart | 10 | 0 |
| test/features/customer/booking_preparation_flow_test.dart | 29 | 0 |
| test/features/customer/booking_preparation_test.dart | 6 | 0 |
| test/features/customer/booking_refund_policy_review_test.dart | 2 | 0 |
| test/features/customer/booking_refund_policy_test.dart | 11 | 0 |
| test/features/customer/circular_provider_logo_test.dart | 9 | 0 |
| test/features/customer/customer_account_controller_test.dart | 11 | 0 |
| test/features/customer/customer_account_management_screen_test.dart | 8 | 0 |
| test/features/customer/customer_booking_presentation_test.dart | 64 | 0 |
| test/features/customer/customer_bookings_pagination_test.dart | 21 | 0 |
| test/features/customer/customer_bookings_source_test.dart | 6 | 0 |
| test/features/customer/customer_event_list_test.dart | 50 | 0 |
| test/features/customer/customer_password_change_repository_test.dart | 46 | 0 |
| test/features/customer/customer_payment_contract_test.dart | 7 | 0 |
| test/features/customer/event_draft_persistence_test.dart | 16 | 0 |
| test/features/customer/event_list_authentication_integration_test.dart | 20 | 0 |
| test/features/customer/event_list_authentication_test.dart | 19 | 0 |
| test/features/customer/event_list_ui_test.dart | 1 | 0 |
| test/features/customer/event_services_revision_test.dart | 3 | 0 |
| test/features/customer/explore_marketplace_test.dart | 5 | 0 |
| test/features/customer/home_text_hierarchy_test.dart | 1 | 0 |
| test/features/customer/location_action_panel_test.dart | 3 | 0 |
| test/features/customer/location_picker_selection_test.dart | 10 | 0 |
| test/features/customer/package_customization_revision_test.dart | 8 | 0 |
| test/features/customer/password_recovery_store_test.dart | 5 | 0 |
| test/features/customer/phase2_refinement_test.dart | 7 | 0 |
| test/features/customer/preparation_availability_test.dart | 4 | 0 |
| test/features/customer/provider_brand_visual_test.dart | 8 | 0 |
| test/features/customer/provider_discovery_test.dart | 21 | 0 |
| test/features/customer/provider_profile_layout_test.dart | 6 | 0 |
| test/features/customer/provider_review_card_test.dart | 7 | 0 |
| test/features/customer/real_provider_logo_review_test.dart | 0 | 4 |
| test/features/customer/representative_screen_migration_test.dart | 2 | 0 |
| test/features/customer/review_repository_contract_test.dart | 2 | 0 |
| test/features/customer/review_screen_test.dart | 6 | 0 |
| test/features/customer/search_relevance_test.dart | 4 | 0 |
| test/features/splash/branding_assets_test.dart | 2 | 0 |
| test/features/splash/compiled_opening_artwork_test.dart | 5 | 0 |
| test/features/splash/opening_animation_test.dart | 12 | 0 |
| test/features/splash/opening_artwork_cache_test.dart | 1 | 0 |
| test/features/splash/opening_visibility_test.dart | 2 | 0 |
| test/features/splash/startup_auth_handoff_test.dart | 4 | 0 |
| test/features/splash/startup_shell_test.dart | 8 | 0 |
| test/registration_rollback_test.dart | 3 | 0 |
| test/security/runtime_security_test.dart | 3 | 0 |
