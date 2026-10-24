# FEASTA initial-payment expiration policy V4

Implemented locally on `chore/monorepo-setup`. Applies to initial payment after provider acceptance. Remaining-balance policy and PayMongo session expiry are independent.

## Deadline rules

Use the exact scheduled event-start instant minus the provider acceptance instant:

- More than 168 hours: standard, acceptance plus six hours.
- At most 168 hours (including exactly seven days): rush, acceptance plus two hours.
- Philippine local time is Asia/Manila, UTC+08:00. The calculator uses explicit offset arithmetic and UTC accessors, never the host timezone.
- The protected interval is 22:00 inclusive through 07:00 exclusive. If acceptance is overnight, use the first 10:00 following that overnight period. Otherwise, if the base expiry is overnight, use the first 10:00 following that period.
- Overnight acceptance takes precedence even when 10:00 is earlier than the base countdown (for example, standard acceptance at 06:59 expires at 10:00).
- Truncate the candidate at event start and every applicable frozen hard payment boundary. V3's T-24-hour cutoff takes precedence; canonical V2's existing due boundary is also retained. Nonpositive windows fail closed.

| Acceptance (PHT) | Classification | Expiration (PHT), before hard-cutoff truncation |
| --- | --- | --- |
| 09:00 | Standard | 15:00 same day |
| 15:00 | Standard | 21:00 same day |
| 17:00 | Standard | 10:00 next day |
| 23:00 | Standard | 10:00 next day |
| 13:00 | Rush | 15:00 same day |
| 20:00 | Rush | 10:00 next day |
| 01:00 | Rush | 10:00 same day |
| 22:00 | Either | 10:00 next day |
| 07:00 | Standard | 13:00 same day |
| 06:59 | Standard | 10:00 same day |

An expiry exactly at 22:00 is protected. An expiry at 07:00 has no expiry-based protection, but overnight acceptance still triggers protection.

## Frozen contract and compatibility

The canonical pure function is `calculateInitialPaymentDeadlineV4` in `functions/src/payments/initial-payment-deadline.ts`. Call sites are new acceptance and the version-aware frozen-evidence verifier `originalInitialPaymentDeadline` in that same module.

New acceptance stores `initialPaymentDeadlinePolicyVersion: 4`, `initialPaymentDeadlineAt`, exact `acceptedAt`, and `eventStartAt`. `expiresAt` remains the payment presentation/query compatibility field while waiting for payment. Acceptance and financial-snapshot capture use the same server-controlled instant. Financial values, eligibility, and remaining-balance semantics are unchanged.

The verifier recomputes V4 from accepted/event evidence and validated V2/V3 timing, checks the stored deadline and any non-null compatibility expiry, and rejects unknown versions or conflicting evidence. Acceptance replay takes the existing branch before new V4 calculation and preserves the original deadline. Checkout creation never renews it.

Unversioned accepted requests retain the original minimum of acceptance plus 24 hours, event start, stored expiry, frozen hard deadline, and existing canonical balance boundary. The historical 24-hour constant remains available to legacy availability consumers. No accepted records are migrated or enrolled retroactively. Shared-types has no existing initial-deadline field contract to update; these server evidence fields are read through existing record-shaped contracts.

## Payment and capacity safety

- Availability uses the V4 verifier for versioned requests and releases a valid unpaid hold exactly at the deadline, independently of worker execution. Invalid versioned evidence keeps capacity reserved for review while checkout fails closed.
- Existing gateway processing, payment identities, dispatch reservations, reconciliation and review holds retain priority over elapsed time. No accounting, refunds, cancellations, capacity policy, reservation counters or transaction ordering changes were made.
- Acceptance retains the provider reservation guard write in the transaction, so concurrent acceptance/availability changes use the existing conflict-and-retry protocol. Existing capacity rules were preserved; this change does not add a single-event-per-day assumption.
- Checkout's existing transactional reservation verifier enforces V4 before new dispatch. Existing callbacks, reconciliation and late-payment handling remain intact.
- The worker already uses the shared verifier. Its transaction still rechecks rollout settings, relationship membership, immutable financial evidence, payment identities, attempt subcollections and locks. Only safely proven never-attempted requests can expire. Ambiguous or late evidence goes to review.
- No rollout flag was enabled. The scheduled worker was neither changed nor deployed.
- Web customer options suppress new initial checkout at the stored V4 deadline even before status changes. Customer request DTOs already expose stored `expiresAt`. Provider calendar now uses the frozen V4 deadline and preserves payment/review holds. Existing presentation was retained without redesign.
- Flutter has separate legacy mainEvents payment timers: FeastaRepository.acceptBooking (line 1680; no caller found in lib) and selectRecoveryOffer (line 545; called by recovery_offers_screen.dart). They set paymentDeadline from the client clock plus 24 hours and do not use the canonical providerRequests acceptance contract. The follow-up mobile compatibility change below now blocks both legacy payment-authorizing writers before any Firestore access, while retaining read-only recovery and history. Canonical mobile payments display frozen provider-request deadlines and use the existing checkout callable.

## Modified file inventory

1. `functions/src/payments/initial-payment-deadline.ts` (new pure calculator and centralized verifier)
2. `functions/src/payments/initial-payment-reservation.ts` (imports/re-exports shared verifier)
3. `functions/src/provider-availability/validate-provider-availability.ts` (version-aware occupancy)
4. `functions/src/provider-requests/accept-provider-request.ts` (calculate and freeze V4)
5. `functions/test/initial-payment-deadline-v4.test.cjs` (new deterministic policy regressions)
6. `functions/test/initial-payment-expiration.test.cjs` (V4 transactional, replay and checkout cases)
7. `functions/test/provider-availability.test.cjs` (updated acceptance wiring assertion)
8. `apps/web/src/lib/provider/calendar/provider-calendar-service.ts` (frozen deadline and payment holds)
9. `apps/web/src/lib/customer/bookings/customer-booking-checkout-options.ts` (deadline-aware projection)
10. `apps/web/test/components/initial-payment-expiration.test.tsx` (V4 projection regression)
11. `docs/feasta-initial-payment-expiration-v4.md` (this document)

Validation output is retained in `.tmp/initial-payment-v4-*.log`. Functions TypeScript emitted ignored `functions/lib` output. Existing tracked and untracked work, including Setup Gallery V2, was preserved.

## Exact validation results

- Functions TypeScript: `node functions/node_modules/typescript/bin/tsc --project functions/tsconfig.json` passed. Called TypeScript directly to avoid the build script's dependency-install step.
- Targeted backend: **156 passed, 0 failed, 0 skipped**, across 12 test files listed below.
- Targeted Web Vitest: **23 passed, 0 failed**, across three files.
- Web TypeScript: `node node_modules/typescript/bin/tsc --noEmit` from `apps/web` passed.
- Functions targeted ESLint: **0 errors, 53 max-length warnings** across four changed production files.
- Web targeted ESLint: **0 errors, 0 warnings** across the two changed production files and changed test file.
- `git -c core.safecrlf=false diff --check`: exit 0. Git reported line-ending normalization warnings, no whitespace errors.

Backend command (from repository root):

```powershell
node --test functions/test/initial-payment-deadline-v4.test.cjs functions/test/initial-payment-expiration.test.cjs functions/test/provider-availability.test.cjs functions/test/provider-acceptance-plan.test.cjs functions/test/initial-payment-checkout.test.cjs functions/test/initial-payment-eligibility-checkout.test.cjs functions/test/checkout-attempts.test.cjs functions/test/full-payment-only-checkout.test.cjs functions/test/independent-provider-checkout.test.cjs functions/test/booking-policy-v3.test.cjs functions/test/customer-provider-availability.test.cjs functions/test/marketplace-provider-availability.test.cjs
```

Web command (from `apps/web`):

```powershell
node node_modules/vitest/vitest.mjs run test/components/initial-payment-expiration.test.tsx test/components/provider-calendar-preview.test.tsx test/components/customer-initial-payment-eligibility.test.tsx
```

Tests include all clock examples, 06:59/07:00/22:00 boundaries, exact seven-day classification, event and V3 truncation, historical holds, version freezing wiring, replay preservation, malformed evidence, worker transaction conflicts with late payment evidence, availability release, and real checkout rejection before gateway dispatch. Acceptance storage/guard ordering is covered by source wiring assertions and acceptance-plan regressions; a live acceptance transaction was not executed. The first backend run had one test-file initialization failure (missing offline Firebase app initialization in the new test); this was corrected. Final counts above are the completed verification run.

## Rollout and remaining verification

Canonical provider-request implementation and focused checks are complete. Mobile deadline compatibility is now implemented by isolating the legacy writers and displaying frozen canonical deadlines (see follow-up below). Restoring legacy replacement selection still needs a trusted backend replacement contract; it cannot mint payment authority from the device. Deployment approval, staged rollout configuration, and live acceptance/payment checks are separate future work. Before rollout, verify the deployed callable and stored fields together, Manila clock examples, historical records, concurrent provider acceptance against the real reservation guard, customer refresh/checkout behavior, and late PayMongo callbacks in the approved test environment. Offline mock tests do not substitute for that operational verification. Worker rollout settings remain unchanged/off.

Nothing was deployed, committed, pushed, or written to live Firebase. No emulator, dependency installation, Git branch switch, reset, stash, rebase, merge or destructive cleanup was used.

## Follow-up: Flutter payment expiration compatibility (2026-10-24)

### Active path and root cause

`booking_details_screen.dart` routes customers to `RecoveryOffersScreen`. The screen actively read offered replacements and invoked `FeastaRepository.selectRecoveryOffer`. That method calculated `DateTime.now() + Duration(hours: 24)`, then directly batched writes to `mainEvents.paymentDeadline`/`acceptedAt`, provider identity, booking/payment status, offer selection/declines, linked add-ons, timeline and notifications. It could replace a previously frozen deadline and implicitly claim capacity/payment readiness without the canonical acceptance transaction. It used no trusted Function. The separate legacy `acceptBooking` did the same deadline calculation; no caller was found under mobile `lib`.

The repository contains no trusted legacy recovery-selection/replacement Function that verifies financial evidence, the old/new provider relationship, capacity, and frozen acceptance timing. `acceptProviderRequest` authorizes a provider's pending canonical request, not customer selection of a legacy offer. Routing an offer ID into it or attaching legacy money/deadlines would invent authority.

### Implemented isolation and canonical display

- Both legacy authorizing methods now call `requireTrustedLegacyBookingPaymentAuthority`, which throws before any Firestore read/write or Function call. Repeated attempts cannot modify a deadline, change providers, decline competing offers, relink add-ons, change status, or partially commit recovery. `acceptBooking` is explicitly deprecated.
- Recovery offer lists and detail sheets remain available. Selection is visibly disabled in both locations, with an explanation that replacement selection is temporarily unavailable and a direction to FEASTA support. No successful-selection/payment-required promise remains in those controls.
- Existing `BookingModel.fromDoc`, `RecoveryOfferModel.fromDoc`, booking/history streams, payment readers and cancellation methods were preserved. Historical selected offers, original 24-hour `mainEvents.paymentDeadline` values, and prior payment evidence are not migrated or rewritten. This change does not claim to complete a replacement booking without server authorization.
- `InitialPaymentDeadline` is a read-only projection of canonical provider-request evidence. V4 displays `initialPaymentDeadlineAt`; `expiresAt` must agree for a new initial checkout option. Unversioned requests retain their stored `expiresAt` without reconstructing acceptance plus 24 hours. The parser checks timestamp types, known policy version, positive acceptance-to-deadline ordering, required V4 event evidence, and any stored event/hard bounds. Missing or conflicting evidence suppresses new initial options while leaving readable status/history intact. Remaining-balance eligibility is not routed through the initial deadline parser.
- The payment screen displays the stored instant with an explicit Philippine offset and PHT label, including standard, rush and overnight values. It does not calculate V4 itself or reconstruct a booking deadline on restart.
- Device time is not used by the deadline projection or initial eligibility projection. A visible option is only a request to the existing `createPaymentSession` callable; that backend still validates actual server time, original frozen event/acceptance evidence and capacity transactionally before dispatch. Stale open screens do not authorize checkout after expiration. The payload contains request ID, choice and retry key, never a deadline, acceptance instant, amount or eligibility override. Its existing device-derived retry-key suffix is unrelated to deadline authority and remains unchanged.
- The current local Firestore rules already restrict canonical request lifecycle writes and non-draft main-event writes. No rules were relaxed or deployed. The recovery writer could not satisfy that local rules contract; it is now blocked at the application boundary as well.

### Files changed in this follow-up

1. `apps/customer_mobile/lib/core/domain/legacy_booking_payment_authority.dart` (new guard and shared explanatory copy)
2. `apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart` (isolate the two legacy authorizing writers)
3. `apps/customer_mobile/lib/features/customer/recovery_offers_screen.dart` (retain reads/details, visibly disable unsupported selection)
4. `apps/customer_mobile/lib/shared/models/initial_payment_deadline.dart` (new read-only stored-deadline projection and Philippine formatting)
5. `apps/customer_mobile/lib/shared/models/customer_payment_request.dart` (project deadline evidence and fail closed on malformed initial authority)
6. `apps/customer_mobile/lib/features/customer/payment_required_screen.dart` (display frozen per-provider deadline)
7. `apps/customer_mobile/test/features/customer/initial_payment_deadline_v4_test.dart` (new focused model/widget/contract tests)
8. `docs/feasta-initial-payment-expiration-v4.md` (this update)

No Functions, Web, rules, shared-types, or Setup Gallery files were changed by this follow-up. Existing local work was preserved.

### Follow-up verification

Final results:

- Flutter: **33 passed, 0 failed** in the three files below. Coverage includes actual rendered standard/rush/overnight PHT values, unchanged historical deadline, restart/read immutability, absence of device-clock eligibility, malformed/missing evidence, review holds, repeated writer-guard denial before IO, historical booking/recovery readability, and no client checkout overrides. Repository/UI connection tests use the existing source-contract pattern; model/widget tests run directly against local stored snapshots with no Firebase initialization.
- Targeted Flutter analysis of all seven changed Dart files: **0 errors, 0 warnings, 10 informational notices**, exit 0 using `--no-fatal-infos`. Notices are existing `withOpacity` deprecations and unnecessary underscores in the retained recovery screen. No production diagnostics were suppressed. The test-only snapshot double documents its sealed-type lint exception.
- Unchanged backend regression verification: **76 passed, 0 failed**, running `initial-payment-deadline-v4.test.cjs` and `initial-payment-expiration.test.cjs`. Includes authoritative server expiry rejection before gateway dispatch and late-payment/transactional protection.
- `git -c core.safecrlf=false diff --check`: exit 0.
- No backend or Web TypeScript changed; earlier TypeScript results above remain applicable. No emulator or live service checks were performed.

Installed Dart/Flutter tools needed their normal SDK cache/analytics-state writes outside the workspace; checks used approved tool access and existing dependencies, with `--no-pub` and `--no-version-check`. No dependencies were installed. Final logs are `.tmp/v4-mobile-tests.log`, `.tmp/v4-mobile-analysis.log`, `.tmp/v4-mobile-backend-regression.log`, and `.tmp/v4-mobile-diff-check.log`.

Commands from `apps/customer_mobile` (the installed SDK snapshot was invoked directly because the batch launcher stalled):

```powershell
C:/flutter/bin/cache/dart-sdk/bin/dart.exe C:/flutter/bin/cache/flutter_tools.snapshot --suppress-analytics --no-version-check test --no-pub test/features/customer/initial_payment_deadline_v4_test.dart test/features/customer/customer_payment_contract_test.dart test/features/customer/booking_lifecycle_presentation_test.dart
C:/flutter/bin/cache/dart-sdk/bin/dart.exe C:/flutter/bin/cache/flutter_tools.snapshot --suppress-analytics --no-version-check analyze --no-pub --no-fatal-infos lib/core/domain/legacy_booking_payment_authority.dart lib/shared/models/initial_payment_deadline.dart lib/shared/models/customer_payment_request.dart lib/features/authentication/data/repositories/feasta_repository.dart lib/features/customer/payment_required_screen.dart lib/features/customer/recovery_offers_screen.dart test/features/customer/initial_payment_deadline_v4_test.dart
```

### Remaining dependency and integration testing

The client-timer authority blocker is resolved using the explicitly authorized isolation fallback. Canonical Web/Mobile V4 integration testing can proceed in an approved environment. Legacy replacement selection is intentionally unavailable until a trusted, transactional backend replacement operation exists that establishes canonical request identity, frozen financial/event evidence, provider capacity and idempotency. Support messaging does not substitute for that operation, and the client does not attempt an unapproved migration. Existing selected recovery records and history remain readable; no new initial payment is authorized from incomplete legacy evidence.

Live/staged acceptance, restart, expired checkout, historical record display, and late gateway callbacks still require approved integration testing. Nothing was deployed, committed, pushed, or written to live Firebase.
