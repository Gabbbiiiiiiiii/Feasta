# M4.4 — Durable booking attempt identity and retry reconciliation

Verdict: **BLOCKED — BACKEND COORDINATION REQUIRED** for submission activation and authoritative unknown-outcome recovery. Preparation infrastructure is implemented for independent review; normal navigation remains preparation-only. No submission activation is included.

## Baselines and scope

Mobile branch `feat/mobile-customer-parity`, HEAD `c69adf0`; read-only reference HEAD `0c3f6f5` verified. Inspected the reference submit callable, package-offer fingerprint fields, main-event rules, mobile M4.1 selection/result models, both disclosure controllers/screens, authentication handling, secure address storage, booking history/detail reads and preparation navigation.

No backend, rules, web-reference, payment implementation, M5 behavior, production data or Git history changes. No real booking/payment requests, commits, pushes or deployment.

## Exact file inventory

Paths relative to `apps/customer_mobile/`:

- `lib/features/customer/booking_attempt_coordinator.dart` — typed attempt, secure store, serialized lifecycle, readiness and response handling.
- `lib/features/customer/booking_summary_screen.dart` — explicit preparation action, status message, account invalidation; existing reviews retained.
- `lib/features/customer/booking_agreement_controller.dart` — selection/account binding query and successful disclosure-load timestamp.
- `lib/features/customer/booking_refund_policy_controller.dart` — separate selection/account binding query and successful disclosure-load timestamp.
- `test/features/customer/booking_attempt_test.dart` — 24 lifecycle, storage-ordering, race and simulated-outcome tests.
- `test/features/customer/booking_attempt_readiness_test.dart` — 9 separate-consent/readiness tests.
- `test/features/customer/booking_attempt_storage_test.dart` — 2 native-storage configuration/failure tests.
- `docs/m4-4-booking-attempt-review.md` — this report.

## Identity and selection

Each new intended attempt uses `Random.secure()` to generate 32 random bytes, encoded as `mobile_` plus 64 hexadecimal characters. No UID, clock or customer information appears in the request ID. UID ownership is stored separately.

The snapshot is captured synchronously before joining the storage queue. Its immutable identity is the JSON serialization of M4.1's validated, normalized package payload without `clientRequestId`. All booking-defining fields are included: provider/package, optional service tier/theme, event type, Manila calendar day, canonical times, guest count, location/address, menu/decor/furniture, add-on IDs, customer-arranged add-on flag/note and special request. Add-on IDs are deduplicated by M4.1 and sorted locally. Menu/decor/furniture order is preserved, matching the backend's trimmed list treatment. Optional tier/theme omissions are preserved.

This identity is a local equality guard, NOT a claim of byte-equivalent Node SHA-256. The backend fingerprints customer UID, canonical server fields and an ISO timestamp for the event date, and remains authoritative. The backend derives booking ID as the first 40 hexadecimal characters of SHA-256 of `uid:clientRequestId`. Existing transaction replay checks customer ownership and submissionFingerprint; mismatches yield `already-exists` rather than a new identity.

Snapshot getters return detached decoded data. Source-list mutation, queued calls, widget reconstruction, repeated preparation, restart, timeout and uncertain responses do not change the existing intended attempt's ID. Material changes generate a distinct ID only while the old attempt is known safe to supersede. Unknown outcomes block both replacement and abandonment. An explicit close of an undispatched attempt safely abandons it; closing a confirmed result marks the local attempt completed, allowing a deliberately new intended booking. Completion refers to this local attempt lifecycle, not the event's business status.

## Persistence and safety assessment

Reuses the installed `flutter_secure_storage` dependency (resolved version 10.3.1). Android uses an isolated `feasta_booking_attempts_v1` namespace, AES-GCM default storage, and `resetOnError: false`. This prevents plugin auto-reset from silently discarding an unreadable attempt. iOS uses a separate Keychain account, `unlocked_this_device` accessibility and no synchronization. Web and desktop fail closed rather than using a plaintext fallback.

Each customer's single active record has a UID-scoped key. The record contains version, UID, random ID, normalized selection identity, lifecycle status, UTC creation/update metadata and strictly parsed confirmed result identifiers when available. It excludes tokens, passwords, customer profile/display snapshots, prices, coordinates and all acknowledgment evidence. Event address and request text are retained only because they define the intended booking, and are protected by native storage.

Writes are awaited and read back before an attempt is returned. No dispatch callback or transport is exposed. Mock tests demonstrate that a simulated downstream action cannot receive an attempt before its write finishes. Restoration revalidates the snapshot with M4.1, record version, UID, ID format, timestamps, state and strict result parser. Corrupt/read-failing records are retained and block new identities. JSON validation is structural integrity checking; native authenticated storage supplies the confidentiality/integrity boundary, not a home-grown unsigned checksum.

All mutations serialize through the process-wide coordinator used by the summary. Caller UID and session epoch are checked before queued work and after asynchronous storage/ownership operations. Auth events invalidate queued work; screen-local messages clear on account changes. Account A's record remains isolated when account B signs in. No attempt is deleted on sign-out, because deleting unknown identity would make later retries unsafe.

Limitations: tests mock native storage; physical Android/iOS interruption, locked-device, backup/restore and keystore-loss behavior still require device validation before M4.5. Local storage alone cannot establish absence after app-data erasure, uninstall, rollback, or use on another device. Android application backup policy was not changed. Decryption errors fail closed; genuinely missing records after loss require backend coordination before claiming cross-install/cross-device duplicate prevention.

## Lifecycle/state machine

| State | Meaning and allowed preparation behavior |
| --- | --- |
| draft | New immutable intended selection; immediately persisted as blockedFreshDisclosures. |
| blockedFreshDisclosures | Prepared only. Current separate reviews must load after preparation/restoration and be explicitly acknowledged. |
| ready | Preparation evidence passed in required refund rollout mode. No submission transport or UI activation exists. Restore clears this readiness. |
| dispatchPending | Reserved for the future persisted dispatch boundary; used only in fake persisted fixtures in M4.4. No production method enters this state. |
| confirmedCreated | Strict authoritative result with `created: true`. IDs retained. |
| confirmedExisting | Strict authoritative replay result with `created: false`. IDs retained. |
| rejectedBeforeCreation | Reserved for a future backend outcome that definitively guarantees no creation. Generic exceptions never enter it. |
| outcomeUncertain | Timeout, connection interruption or account interruption reported by a future adapter; identity retained. |
| requiresReconciliation | Fingerprint conflict, malformed/conflicting response, ownership uncertainty, inconclusive read, or restored in-flight/uncertain attempt. Blocks replacement and close. |
| selectionChanged | Readiness selection mismatch; old identity is not repurposed. A new preparation may supersede only a safe old attempt. |
| completed | Explicitly closed, confirmed local attempt; retains identifiers. |
| safelyAbandoned | Explicitly closed attempt known safe to abandon. |

No API accepts an arbitrary lifecycle status. Future pending and definite-rejection entry points are intentionally reserved rather than activated merely for persistence testing. `recordResponse` requires the matching request ID and a non-draft/in-flight state or existing confirmed result. It reuses `BookingSubmissionResult.fromJson`; malformed results require reconciliation. Repeated results cannot replace conflicting confirmed booking/main-event/provider-request identifiers. Interruptions/conflicts never allocate a fresh ID. A restored pending attempt is never presented as a known failure.

## M4.2/M4.3 compatibility

Both existing review screens and their separate exact provider/key acknowledgment maps are preserved. Readiness checks their selection/account signatures, current all-acknowledged state, successful load timestamps after the attempt barrier, exact exported key pairs and freshly resolved provider ownership. Evidence is checked again after asynchronous ownership lookup. Changed agreement/refund keys, missing consent, wrong account, stale loads and refreshes during lookup block readiness. Provider changes/read failures require reconciliation. The production resolver checks each add-on's current owner against its selection ownership snapshot, including swaps that retain the aggregate provider set.

No accepted checkbox, agreement key or refund-policy key is persisted in the attempt. Restart creates fresh review controllers; restore also establishes a newer disclosure-load barrier, so reusing an old in-memory controller cannot restore readiness. The UI preparation action does not join review consent or activate submission.

Rollout-off remains blocked even after acknowledging displayed policies. M4.4 does not resolve the outstanding mismatch between web review gating and backend rollout-off enforcement. That product/backend decision is an M4.5 blocker.

## Reconciliation and backend handoff

Existing authorized mobile customer reads are `customerBookings()` (customer filter, descending creation order, limit 20) and `bookingById()` (Firestore snapshot stream). They remain unchanged. Lists can omit older bookings; snapshots can be cached or fail. Neither method supplies a strict attempt-bound response that verifies UID + clientRequestId + submission selection and all canonical result references. A missing list/detail entry never establishes non-creation.

The deterministic backend ID provides a possible future server-read lookup design. It is not implemented as an unverified mobile absence/retry decision. M4.4 exposes typed strict-result handling for a future authoritative adapter and conservatively retains uncertain attempts; it does not invent a callable or assert a live reconciliation capability.

Backend handoff: provide or approve an authenticated attempt-resolution contract bound to customer UID and clientRequestId, verify submission fingerprint/selection, and return validated bookingId, mainEventId and providerRequestIds on confirmed existence. Define explicit still-pending/unknown/conflict semantics. Any definitive non-creation result must address transaction races before authorizing a new identity. Also define recovery after local data loss and cross-device preparation. No live existence query was issued in this milestone.

## Validation

- Focused final lifecycle/readiness run: **33 passed** (24 lifecycle + 9 readiness).
- Native-storage options/failure run: **2 passed**.
- Broader customer and authentication navigation suite: **330 passed, 4 skipped, 0 failed**. This includes the 33 lifecycle/readiness tests, M4.1/M4.2/M4.3, provider discovery/preparation/customization, Maps selection/action panel, preparation-only navigation, existing customer payment contracts and auth navigation. Native-storage tests were added afterward and passed separately; the final timeout/conflict test adjustment also passed the focused run.
- Tests use fake stores, mocked channels/repositories and simulated outcomes. Pending fixture seeding is test-only; no real submission/payment transport is called.
- Affected-code Flutter analysis: **7 Dart files, no issues found** (after all code/test changes).
- `git diff --check`: **passed**; new-file whitespace checked separately with `git diff --no-index --check`.
- Physical device tests and production connectivity were intentionally not performed.

## M4.5 dependencies and stop point

1. Authoritative attempt reconciliation and local-data-loss/cross-device recovery semantics.
2. Product/backend rollout-off refund-policy decision.
3. Future transport integration must persist dispatchPending before dispatch, bind the existing stable ID, revalidate current auth/ownership and both exact disclosure acknowledgments at the final dispatch boundary, and explicitly classify only guaranteed pre-creation rejections.
4. Replace the legacy repository timestamp-per-call submission path when activation is independently authorized. M4.4 does not route preparation into it or change existing-booking payments.
5. Native device secure-storage, crash/interruption and backup behavior validation.

**BLOCKED — BACKEND COORDINATION REQUIRED**. Stop for independent review; submission activation remains outside this change.
