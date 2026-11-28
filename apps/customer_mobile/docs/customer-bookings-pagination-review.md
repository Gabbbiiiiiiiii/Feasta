# Customer booking history pagination review

Date: 2026-10-20 (Asia/Manila)
Base: bb4803f, branch feat/mobile-customer-parity. Local implementation only.

## Implementation

The former My Bookings stream had a hard limit of 20 and no continuation. The screen also simulated refresh with a 500ms delay. The screen now owns a disposable pagination controller and a customer-scoped Firestore source created by FeastaRepository.

Each query filters mainEvents by the captured authenticated customer ID, orders by createdAt descending and document ID descending, requests 21 documents, displays at most 20, and retains the last displayed document snapshot as the next startAfterDocument cursor. The extra record establishes hasMore and is fetched again as part of the next page. Equal timestamps retain the document ID tie-break, including timestamp precision carried by the original snapshot. Results are deduplicated by document ID without changing query order. There are no offsets, totals, cross-customer queries, or collection-wide reads.

Every requested page retains a live listener. Any server emission on a page replaces that page and cancels/discards all later pages and pending requests. This conservative policy applies even to status-only changes and lookahead changes, avoiding a stale chain of cursors. The UI tells customers that bookings changed and older bookings can be loaded again. Changes/deletions on older loaded pages are observed by their own listeners. No guarantee of an atomic multi-query snapshot is made; Firestore delivers independent listener events. Records outside loaded ranges become visible when their page is requested. Listener/read cost grows with the number of pages explicitly requested.

Pull-to-refresh resets the loaded pages and awaits the first fresh server page or error. Returning from details, payment, or chat invokes the same refresh. Cache-only and pending-write snapshots do not establish the authoritative page boundary. A 30-second initial page deadline exposes retry if the server cannot respond. Offline cached history is intentionally not presented as a complete page.

The controller cancels listeners on account changes, refresh, invalidation, and disposal. Per-listener identity tokens and UID checks ignore stale events, including A-to-B-to-A transitions. The source checks authentication before querying and again before decoding an emission; the controller also rejects ownership mismatches. Signed-out users issue no new query and loaded state is cleared. Firestore rules remain the authorization boundary.

The UI preserves booking cards, action eligibility, loading/empty/error states, and malformed-status presentation. It adds guarded Load More, progress, retry, end-of-list text, and 'Showing N bookings'. A failed additional-page request retains earlier loaded bookings.

## Index and historical data limits

firebase/firestore.indexes.json already defines mainEvents(customerId ASC, createdAt DESC). Firestore implicitly appends the document-name key in the final ordering direction, matching document ID DESC. The deployed index state was not contacted or verified. No index or rules file changed.

Firestore orderBy excludes documents lacking the ordered field. Documents with explicit null or non-timestamp createdAt values are ordered according to Firestore's type ordering, not chronological event history. Existing date decoding returns null for non-timestamps. Original document snapshots preserve the actual cursor values; the implementation does not reconstruct cursors from decoded dates. Missing-createdAt history is not recovered by this query. No production data audit or schema migration was performed.

## Validation

- 21 focused tests passed across customer_bookings_pagination_test.dart and customer_bookings_source_test.dart. Controlled SDK doubles exercise the production query builder, 0/7/20/21/45 records, equal timestamps, document ID order, snapshot cursors, owner filters, and exact end detection. Controller/widget tests cover multiple pages, deduplication, double tap, failure/retry, real pull refresh, head/older-page invalidation, stale events, account switching/sign-out, ownership mismatch, disposal, timeout, 320px width and 2x text.
- 235 existing mobile tests passed: customer_booking_presentation, phase2_refinement, representative_screen_migration, customer_payment_contract, chat_repository_contract, booking_contract, booking_agreement, booking_agreement_review, booking_agreement_completeness, booking_refund_policy, booking_refund_policy_review, booking_attempt, booking_attempt_readiness, booking_attempt_storage, event_draft_persistence, booking_preparation, booking_preparation_flow, and runtime_security test files.
- Affected-file Flutter analysis: six Dart files, no issues found.
- git diff --check passed.
- Additional legacy scripts/verify-flutter-security.mjs failed at its obsolete _StartupFailureApp assertion. Current main.dart is unchanged from HEAD and uses StartupShell. This pre-existing checker mismatch was not changed in this checkpoint.
- Four optional backend suites (booking-contract, booking-payment-agreement, booking-package-offer, phone-booking-security) could not start because functions/lib compiled modules are absent. No backend build, source edit, or dependency installation was performed.
- No production, device, or Firestore emulator tests were run. SDK doubles validate query construction and controlled behavior, not deployed index availability or the Firestore server implementation.

## Scope and security assessment

M4.1-M4.4 booking, agreement/refund consent, stable request identity, persistent recovery, payment/chat eligibility, cancellation/refunds, and provider replacement behavior were not modified. Relevant mobile regressions passed. M4.5 submission remains disabled; no submission transport was introduced. No search, status filters, Event List, Functions/rules/index changes, production writes, deployment, commits, pushes, branch operations, or Realme installation occurred. The existing untracked m4-4-android-persistence-validation.md was preserved.

## Changed-file inventory

1. lib/features/authentication/data/repositories/feasta_repository.dart
2. lib/features/authentication/data/repositories/customer_bookings_source.dart (new)
3. lib/features/customer/customer_bookings_controller.dart (new)
4. lib/features/customer/customer_bookings_screen.dart
5. test/features/customer/customer_bookings_pagination_test.dart (new)
6. test/features/customer/customer_bookings_source_test.dart (new)
7. docs/customer-bookings-pagination-review.md (new)

READY FOR INDEPENDENT REVIEW
