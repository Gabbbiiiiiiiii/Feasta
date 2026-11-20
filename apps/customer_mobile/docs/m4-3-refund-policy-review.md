# M4.3 refund-policy review

Assessment: READY FOR INDEPENDENT REVIEW. Implemented M4.3 only against mobile 1e4d198 and read-only web/backend 0c3f6f5 on feat/mobile-customer-parity.

## Implementation and contract

The preparation summary now opens a separate emerald refund-policy review screen alongside the unchanged M4.2 Booking & Payment Agreement screen. Both return without changing event selections. Refund review displays each provider business name, provider-default/package-override source, current version, all three eligibility stages, backend basis-point rates divided by 100, optional terms, and an initially unchecked per-provider checkbox. It distinguishes cancellation policy from deposit eligibility, deadlines and payment default; no guaranteed refund amounts are calculated.

The repository reuses its existing asia-southeast1 Functions instance, authentication and App Check setup with a 30-second timeout. getBookingRefundPolicyDisclosures receives exactly providerId, packageId, addonIds and cateringSelectionType: package. The immutable M4.2 snapshot supplies these values; other booking fields are never forwarded. No new Firestore writes were introduced.

Typed immutable responses require exactly rolloutMode, acknowledgementsRequired and policies. Modes are off/required; the boolean must agree with the mode. One to 21 unique provider policies are required. Policy records, stage rules, IDs, nonempty bounded names, server key syntax/source/version metadata, positive safe-integer versions, optional bounded terms and integer basis points (0–10000) are validated. Every stage must occur exactly once. Package overrides must belong to the selected catering package. Keys are retained from the server and never generated locally.

Provider completeness reuses M4.2's current eligible add-on lookup and immutable ownership/source comparison. Catering-owned add-ons share the catering relationship; multiple marketplace add-ons from the same provider share one relationship. Returned providers must exactly equal the reconciled set. Ownership is reconciled before and after loading to catch changes during the callable, including ownership swaps. Deleted/unavailable services, unresolved or changed ownership, missing/unexpected/duplicate policies and malformed data fail closed.

## Consent, rollout and asynchronous behavior

Each provider's explicit consent is transient and separate from payment agreement consent. Export requires every displayed current policy to have been acknowledged and contains only providerId and effectivePolicyKey. No draft consent, timestamps, rates, policy text, financial authority or cross-account consent is restored. Refresh clears disclosure and consent immediately, including refresh failures. Selection signature changes cover the full validated selection, local add-on context and customer account. New selection/account generations discard old responses; duplicate in-flight loads share one future. Disposal suppresses late responses and notifications.

Backend reasons REFUND_POLICY_REQUIRED, REFUND_POLICY_INVALID, REFUND_POLICY_CHANGED, REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED and REFUND_POLICY_ACKNOWLEDGEMENT_INVALID have recovery messages, as do authentication, permission, availability, timeout, network and rate-limit failures. Preparation data is preserved.

Both rollout modes require successful complete disclosure loading. Off is displayed as server enforcement off; users may explicitly acknowledge disclosures, but neither off nor required authorizes submission. No failed disclosure load becomes accepted review.

Backend configuration: a missing appSettings/refundPolicyBookingAgreement document means off. Existing configuration requires schemaVersion 1, isPublic false and enforcementMode off/required. The disclosure callable resolves policies even when off. The web requires all displayed policy acknowledgments before submission irrespective of its required flag, while submit-booking-request enforces policy evidence only when required. Product/backend coordination must settle the rollout-off submission gate before M4.5. M4.3 does not implement that future gate or infer permission to submit.

## Validation

- Initial focused and regression run: 108 passed across refund models/controller, M4.2 agreements/completeness/review, M4.1 contract, preparation/availability/navigation, customization and Maps location picker/action panel.
- Refund repository/widget checks: 2 passed, verifying exact callable region/timeout/payload, authentication rejection, unchecked controls and refresh failure.
- After the ownership race guard and navigation extension: 29 passed across refund and preparation flow tests.
- Final expanded focused refund run: 13 passed, including account invalidation, ownership changes in flight and backend error mapping. No remaining failures. An intermediate test-mock constructor compile error was corrected before this run.
- Affected-code Flutter analysis: 8 Dart files, no issues found. Intermediate brace-style findings were corrected.
- All tests use mocks; no production booking/payment functions invoked.

## Scope and remaining work

Booking submission remains disabled. Existing-booking payment code is unchanged. No functions, security rules, production data, web reference or diagnostic files were modified. No branch switching, reset, clean, stash, merge, rebase, commit, push or deployment was performed.

Deployment availability of the existing callable, current published provider/package policies, eligible services, account verification and valid rollout configuration remain backend dependencies. Production connectivity was intentionally not tested.

M4.4 durable retry persistence remains unimplemented. M4.5 must integrate both separate acknowledgment exports into final submission, revalidate current selection/account/policies at submission, handle changed keys and settle rollout-off gating. No M5 cancellation, refund execution or recovery was added.

## Exact changed-file inventory

All paths below are relative to apps/customer_mobile/:

- lib/features/authentication/data/repositories/feasta_repository.dart
- lib/features/customer/booking_summary_screen.dart
- lib/features/customer/booking_refund_policy_controller.dart
- lib/features/customer/booking_refund_policy_review_screen.dart
- lib/shared/models/booking_refund_policy.dart
- test/features/customer/booking_preparation_flow_test.dart
- test/features/customer/booking_refund_policy_test.dart
- test/features/customer/booking_refund_policy_review_test.dart
- docs/m4-3-refund-policy-review.md

Final inventory inspection found only these intended M4.3 changes. git diff --check passed with no output.
