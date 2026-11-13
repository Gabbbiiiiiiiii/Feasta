# Phase B9-C booking acknowledgments and reconciliation

Local implementation on `chore/monorepo-setup`; existing B6–B9-B edits retained.

## Behavior

Review Booking owns both disclosure controllers. Review screens borrow them rather than disposing of the customer's explicit acceptance when a route closes. Acceptance is scoped to authenticated UID and the normalized selection, including package revision and add-on ownership. Each review opening and submission reloads authoritative disclosures. Only an explicitly accepted provider/key pair that still matches the fresh disclosure survives revalidation. Failed loads and changed keys clear acceptance. No acknowledgment is persisted to disk or fabricated.

Submission prepares the durable identity, reloads disclosures, invokes `reviewReadiness`, obtains current acknowledgment evidence, then persists dispatch. `beginDispatch` requires `ready`, preventing direct dispatch of a merely prepared attempt. Provider lookup errors before dispatch block review rather than creating an uncertain submitted outcome. Backend validation remains authoritative for changes during transport.

Canonical payload additions:

| Field | Per-provider entry |
| --- | --- |
| `agreementAcknowledgements` | `{providerId, agreementKey}` |
| `policyAcknowledgements` | `{providerId, effectivePolicyKey}` |

No client-authored prices, policy text, timestamps, or refund rules are added as acceptance evidence. Existing V2 selection serialization remains in place.

## Recovery and unresolved live request

The inspected server derives the booking ID from SHA-256 of `${uid}:${clientRequestId}` (first 40 hexadecimal characters). Its transaction checks the existing booking and submission fingerprint before creating anything. A matching existing booking returns `created: false`; conflicting content rejects. A successful booking, provider requests, and other canonical effects are written transactionally. Acknowledgment validation occurs before creation.

There is no durable terminal-rejection receipt or server fence in the current contract. A failed-precondition response, missing history row, or empty server lookup cannot prove that all earlier transports have terminated. Consequently this implementation does **not** transition a dispatched attempt to `rejectedBeforeCreation` or clear it. Automatic recovery from a proven terminal rejection remains unavailable until an authoritative server reconciliation/fencing contract exists. That regression case cannot honestly be claimed as implemented or passed.

Review Booking restores saved attempts before enabling submission. An unresolved attempt disables submission and exposes its retained request ID. “Check previous request” uses a server-only, account-scoped `mainEvents` lookup by the same client request ID. Exactly one valid result can be recorded as confirmed; absence, permission/index/network errors, malformed results, and ambiguity retain the identity and block another submission. No replay of the booking callable occurs. Secure storage is never deleted/reset. A server query may require an existing composite index; failure stays blocked and directs the customer to support.

The previously failed real-device attempt was **not accessed or reconciled** in this workspace session. Its UID and request ID were not supplied. It requires the original device/account recovery check or authorized manual investigation. Support must correlate the retained UID/request ID with the deterministic canonical booking and transaction evidence. Do not delete local secure storage or assign a fresh request ID on the strength of an absent document. If rejection cannot be authoritatively established with late writes prevented, retain the block.

## Changed files in this task

- `apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart`
- `apps/customer_mobile/lib/features/customer/booking_agreement_controller.dart`
- `apps/customer_mobile/lib/features/customer/booking_agreement_review_screen.dart`
- `apps/customer_mobile/lib/features/customer/booking_attempt_coordinator.dart`
- `apps/customer_mobile/lib/features/customer/booking_refund_policy_controller.dart`
- `apps/customer_mobile/lib/features/customer/booking_refund_policy_review_screen.dart`
- `apps/customer_mobile/lib/features/customer/booking_summary_screen.dart`
- `apps/customer_mobile/test/features/customer/booking_agreement_review_test.dart`
- `apps/customer_mobile/test/features/customer/booking_attempt_readiness_test.dart`
- `apps/customer_mobile/test/features/customer/booking_attempt_test.dart`
- `docs/phase-b9-c-booking-acknowledgments.md`

## Verification

`flutter analyze --no-pub`: no issues. `git diff --check`: passed.

171 targeted Flutter tests passed across these 13 suites under `test/features/customer/`:

- `booking_attempt_readiness_test.dart`
- `booking_attempt_test.dart`
- `booking_attempt_storage_test.dart`
- `booking_agreement_review_test.dart`
- `booking_refund_policy_review_test.dart`
- `booking_agreement_completeness_test.dart`
- `mobile_v2_compatibility_test.dart`
- `booking_submission_navigation_test.dart`
- `customer_availability_test.dart`
- `booking_agreement_test.dart`
- `booking_refund_policy_test.dart`
- `booking_contract_test.dart`
- `customization_session_test.dart`

Coverage includes both policy types acknowledged, either acceptance missing, changed versions, selection/provider invalidation, account loss/switch and generation changes, readiness before dispatch, duplicate dispatch prevention, timeout/unknown outcomes, restart restoration, and V2 pricing/availability. The new lifecycle test verifies explicit checkbox acceptance survives review-screen disposal and fresh unchanged disclosure validation. Tests use mocked/local transports. Final test output is in `.tmp/b9c-tests.log`.

No emulator, production booking submission, rules modification, deployment, commit, or push was performed. Real-device terminal rejection reconciliation remains an explicit limitation, as described above.
