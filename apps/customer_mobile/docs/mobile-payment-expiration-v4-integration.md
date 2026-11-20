# Mobile Payment Expiration V4 integration ? 2026-10-24

Integrated the verified Flutter reference into Pia?s existing app using selective changes. No transfer verification was repeated. Repository discovery, customer authorization, styling, event customization, draft persistence, booking preparation and navigation were retained. Every pre-existing modified/untracked file was compared by SHA256 before/after and remains byte-for-byte unchanged.

## Files

Added:
- `lib/core/domain/legacy_booking_payment_authority.dart`
- `lib/shared/models/initial_payment_deadline.dart`
- `test/features/customer/initial_payment_deadline_v4_test.dart`
- This integration report.

Modified:
- `lib/features/authentication/data/repositories/feasta_repository.dart`: replaced only the two unsafe legacy authorizing method bodies with the fail-closed guard; deprecated legacy acceptance. All other methods retained.
- `lib/features/customer/recovery_offers_screen.dart`: retains offers, provider details and navigation; disables both replacement-selection controls with shared explanatory copy, retaining Pia?s theme.
- `lib/features/customer/payment_required_screen.dart`: displays frozen per-request deadline in PHT.
- `lib/shared/models/customer_payment_request.dart`: reads stored evidence and suppresses initial options for missing/malformed/conflicting deadlines or review holds.
- `test/features/customer/customer_booking_presentation_test.dart`: adds stored historical acceptance/expiry to its existing checkout positive-control fixture. Its malformed-parent assertions are unchanged.

## Authority and compatibility

V4 reads `initialPaymentDeadlineAt` with policy version 4, matching `expiresAt`, acceptance/event timestamps and any hard boundary. Unversioned historical requests read stored `expiresAt`, preserving historical 24-hour windows without recalculating them. Legacy booking/recovery/history model readers remain unchanged. Missing evidence keeps history readable but suppresses new initial options. Remaining-balance options do not use the initial-deadline parser.

PHT rendering uses explicit UTC+08:00. Flutter never computes six-hour/two-hour/overnight deadlines and never renews a deadline on restart, refresh, navigation or retry. A visible checkout option requests the existing `createPaymentSession` callable with identity, payment choice and retry key only. Actual expiry and eligibility remain server-authoritative, including stale open screens; the client projection deliberately does not use device time to authorize payment.

Both `selectRecoveryOffer` and `acceptBooking` throw before Firestore reads/writes or callable execution. No active mobile path retains a device-time-plus-24-hour authorizing writer. Recovery selection stays restricted until a trusted transactional backend replacement operation establishes canonical identity, financial/event evidence, provider capacity and idempotency. No existing backend code or policy was changed.

## Validation

Used installed Flutter SDK snapshot directly (`C:/flutter/bin/cache/dart-sdk/bin/dart.exe C:/flutter/bin/cache/flutter_tools.snapshot --suppress-analytics --no-version-check`) because the batch launcher stalled; normal SDK-cache permissions were required. All Flutter commands used `--no-pub`. No installation, emulator or live Firebase access occurred.

- `test --no-pub test/features/customer/initial_payment_deadline_v4_test.dart`: **21 passed, 0 failed**. Covers PHT rendering, historical deadlines, restart immutability, malformed evidence, review holds, legacy guards/readers and checkout payload restrictions.
- Existing regression suite: **135 passed, 0 failed**, across `customer_payment_contract_test.dart`, `customer_booking_presentation_test.dart`, `booking_preparation_test.dart`, `booking_preparation_flow_test.dart`, `customer_root_navigation_test.dart` and `features/authentication/customer_auth_navigation_test.dart`. Initial run had one affected positive-control fixture without deadline evidence; the fixture was adapted and the full suite passed.
- Total final tests: **156 passed, 0 failed** (seven files).
- Full `analyze --no-pub`: exit 1; **0 errors, 2 warnings, 12 informational notices**. Existing warnings: unused `_friendlyFunctionMessage` in `maps_api_service.dart:197`, unused import in `promotion_service.dart:3`. Retained informational notices concern initializing formals, deprecated `withOpacity` and unnecessary underscores. Unrelated code was not changed to silence them.
- Direct Dart focused analysis of all eight changed/added Dart files: exit 0; **0 errors, 0 warnings, 8 existing informational notices**, all in retained recovery UI code.
- `git diff --check`: passed (line-ending normalization warnings only).

Backups of all five modified existing files are outside the repository at `C:/Users/Pia/AppData/Local/Temp/feasta-v4-backup-b37wcbf_`. Regression and focused-analysis logs are `C:/Users/Pia/AppData/Local/Temp/feasta-v4-regression.log` and `C:/Users/Pia/AppData/Local/Temp/feasta-v4-targeted-analysis.log`.

## Readiness

Locally ready for canonical Web/Mobile V4 integration testing against a compatible approved backend. This run verifies offline mobile behavior, not deployed callable compatibility or live payment behavior. Staged acceptance, restart, historical display, expired checkout and late callback checks remain operational integration work. Legacy replacement selection remains blocked pending the trusted backend contract. Full-repository analysis retains the unrelated warnings above.

No deployment, live Firebase access, dependency installation, emulator, branch switching, checkout, reset, stash, merge, commit, push or rebase was performed.
