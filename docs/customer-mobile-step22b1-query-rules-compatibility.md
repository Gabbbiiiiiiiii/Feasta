# Step 22B-1 — customer provider-request query/rules compatibility

Date: 2026-11-15 (Asia/Manila).
Branch: `chore/monorepo-setup`.
HEAD: `dc8cf32edca44d1b86497af14e5e6f1daa8f4309` (verified before edits and after checks).

## Contract finding and correction

`firebase/firestore.rules:322` permits provider-request reads for an active signed-in user when `resource.data.customerId == request.auth.uid`, or through the separate provider-owner/admin branches. `currentUserId()` returns `request.auth.uid`. `providerRequests` applies that predicate at line 1036. Customer ownership is the correct mechanism; mainEventId alone does not establish it. Rules still enforce active-account status, which the client query does not replace.

There was no shared repository method for these collection queries. Two display sources independently queried providerRequests by mainEventId alone:

- `BookingLifecycleBuilder` in booking_lifecycle_presentation.dart: used by BookingStatusCard and BookingNextActionCard in Booking Details, and the legacy card in Customer Bookings.
- `IndependentBookingDetails` in independent_booking_display.dart: used by the schema-v2 branch of Booking Details.

Production has no BookingLifecycleScope override; tests can supply that scope. All customer library providerRequests collection references were inspected. Other repository reads use specific document IDs for payment detail/list, complaint relationship validation, chat and review. Those are document authorization checks, not the broad collection query causing this blocker, and are unchanged.

A new CustomerProviderRequestsSource now owns both display fallback reads. Its production wrapper obtains the default FirebaseFirestore and FirebaseAuth instances. The source derives UID from FirebaseAuth.authStateChanges(), checks it against currentUser.uid, and rejects a booking whose customerId does not match that UID. No arbitrary caller UID is accepted as a query argument.

Before:

```dart
collection('providerRequests')
  .where('mainEventId', isEqualTo: booking.id)
  .snapshots()
```

After:

```dart
collection(FirestoreCollections.providerRequests)
  .where('customerId', isEqualTo: uid) // Firebase authentication UID
  .where('mainEventId', isEqualTo: booking.id)
  .snapshots()
```

Null/empty authentication, empty event IDs and foreign-owner bookings emit an error without constructing a Firestore query. Auth changes switch/cancel the old snapshot listener; each snapshot also rechecks currentUser and customer/event ownership to reject queued stale data. Errors reach existing unavailable/review UI. No polling was introduced. There is no orderBy, limit, package/type filter, concatenation or provider loop; existing SDK ordering and downstream assignment order/validation remain intact.

The existing complete-set validator still rejects missing, duplicated or inconsistent requests and hides unsafe mixed payment actions. Payment calculations, request targeting, provider acceptance logic and authentication/login implementation were not edited.

## Stored ownership contract

`functions/src/bookings/submit-multi-provider-booking.ts` derives customerId from the authenticated callable actor. Its shared request base includes `bookingId`, `mainEventId` and `customerId`; that base is spread into every provider request for both schema-v1 Catering and schema-v2 Catering/marketplace rows. The v2 parent marker is packageAssignmentVersion; the customer query does not filter on parent version or request assignment kind, so all legitimate provider requests remain eligible.

The older `submit-booking-request.ts` likewise writes `customerId: actor.uid` in Catering and marketplace provider-request documents. No writer or historical-data migration was needed. Records missing customerId cannot establish customer ownership and remain unreadable through this query; the display's existing missing-set handling remains fail closed.

## Files changed in this step

1. Added `apps/customer_mobile/lib/features/authentication/data/repositories/customer_provider_requests_source.dart`.
2. Updated `apps/customer_mobile/lib/features/customer/booking_lifecycle_presentation.dart`: replace only its fallback query with the shared source, plus import/comment.
3. Updated incoming `apps/customer_mobile/lib/features/customer/independent_booking_display.dart`: replace only its fallback query, plus import.
4. Added `apps/customer_mobile/test/features/customer/customer_provider_requests_source_test.dart`.
5. Added this report.

The incoming modified/untracked files and the previously unchanged lifecycle source (62 unique paths total) were copied before edits to `.tmp/step22b1/backup`. Every copy matched its original SHA-256 hash; `.tmp/step22b1/before.json` records the manifest. Final comparison found changes only to the two intended existing display source files. All other incoming work was preserved.

## Index review

The corrected query has two equality filters, no range, ordering, array operator or limit. It can use Firestore equality index merging with the automatic single-field indexes; a new composite index is not required by this shape. `firebase/firestore.indexes.json` has `fieldOverrides: []`, so this repository does not disable either field's automatic indexes. Existing providerRequests composite definitions include customerId/createdAt, mainEventId/createdAt and providerId/status/eventDate; the corrected display query introduces no new ordering dependency on them.

No index or rules change was made. Both files still match HEAD by Git object hash. Deployed rules, automatic-index configuration and readiness were not queried. Future deployment validation must verify they match the local ownership contract; no new index deployment is proposed here.

## Verification

| Completed run | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| New production query source suite | 17 | 0 | 0 |
| Broader 32-file Flutter run (includes those 17) | 473 | 1 | 0 |

Distinct current Flutter result: **473 passed, 1 pre-existing failure, 0 skipped**. The focused run overlaps the broader run and is not added again. Targeted Dart analyzer on all four changed/new Dart files: **no issues**. Dart formatting passed. `git diff --check` passed; new files were also checked directly for trailing whitespace.

The new source tests use Firebase SDK interface doubles that record the actual production collection/where/snapshots calls and execute their filters. They do not replace the repository method with widget streams. They verify exact owner/event constraints, authoritative auth identity, no query for unauthenticated/foreign bookings, both independent request kinds, multiple provider requests once, original ordering, realtime status changes, sign-out/account-change cancellation, queued stale snapshots, invalid/missing ownership evidence, read failures, and wiring of both display fallbacks. Existing mixed display tests cover full assignment consistency, duplicate projection handling, missing requests, live card replacement, Catering compatibility and payment eligibility/request relationships.

The completed broader selection uses the same 31 suites as Step 22A plus the new query suite (32 files). It covers Customer Bookings source/pagination/presentation, mixed display, lifecycle, payment/deadline/complaint, Event List mixed models/controller/submission/retry/UI, metadata, Catering preparation/review/navigation/configuration, Home timeline and catalog regressions. Exact suite names are in the Step 22A report; the additional file is customer_provider_requests_source_test.dart.

The known failure remains `customer_payment_contract_test.dart`, `P13-D full payment customer copy new package and booking summary present Full Payment`, line 144. The test and inspected package/summary sources still match HEAD exactly. The booking summary lacks the literal required by this deterministic source assertion; no product copy was changed. The prior eight broader authentication failures and three broader Home/Event List failures remain unresolved and were not independently rerun. Passing the selected tests does not clear them.

No Functions tests or TypeScript compilation were rerun for this Dart-only change; Step 22A's 427/0 Functions result is historical evidence, not a new run.

Evidence: `.tmp/step22b1/query-tests.log`, `flutter-regressions.log`, `analyzer.log`, `diff-check.log`, and `before.json`. Initial Dart formatter access to local tool state failed; successful SDK-access checks supersede that launch error.

## Readiness and safety

Step 22A's specific customer query/rules blocker is resolved locally: query construction now proves authenticated customer ownership and retains event scoping. This conclusion is based on local rules/writer inspection and production query unit tests, not an emulator or deployed rules execution.

Controlled deployed E2E remains blocked pending separate release authorization, deployed backend/rules/index/catalog compatibility checks and disposition of unresolved regressions. Step 22A's function/shared-consumer deployment prerequisites still apply. This correction additionally requires a new customer mobile build. No rules/index deployment is required by this change.

No staging, commits, pushes, merges, deployment, production Firebase reads/writes, emulator, real payment or customer identity/selfie/facial-recognition work occurred. Branch/HEAD remain unchanged; all pre-existing work remains local. Do not automatically deploy or begin live E2E.
