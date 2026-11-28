# Customer Web booking synchronization

## Feasibility and cause

The list retained its initial page in client state. Pagination/search loaded new data,
but nothing invalidated it on backend changes. The drawer loaded only when opened;
the details route rendered only on navigation/refresh.

Existing email/Google customer sign-in retains Firebase browserLocalPersistence after
exchanging an ID token for the server session. Logout clears the session and Firebase
Auth. The browser Firebase initializer already configures reCAPTCHA Enterprise App
Check; production requires its site key. No auth or App Check settings were changed.

Existing Firestore rules permit active users to read mainEvents and providerRequests
whose customerId equals request.auth.uid (firestore.rules mainEvents/read and
canReadExistingProviderRequest). Server booking services requireCustomer and enforce
ownership before creating the subscription DTO. Listeners additionally require the
browser UID to equal that DTO's customerId. Missing/mismatched browser authentication
uses the manual server-authorized fallback; it never manufactures credentials.

Provider request updates do not universally update mainEvents: for example,
remaining-balance-enforcement.ts can update a request's enforcement/payment state
without changing the parent. Parent listeners alone cannot refresh all service and
checkout presentations.

## Architecture and files

- customer-booking-service.ts / customer-booking-types.ts: add an optional subscription
  scope containing only the owned customer UID and normalized canonical request IDs.
  Existing normalization bounds request membership to 30 IDs per booking. Historical
  records retain the same server projection and do not require new schema fields.
- booking-change-subscriptions.ts: reference-counted onSnapshot registry keyed by
  customer and document path. Firebase Auth gates reads and immediately detaches on
  sign-out/identity mismatch. Retains only a signal fingerprint, not snapshot payloads.
- use-booking-changes.ts: scope subscriptions to current UI data, debounce signals
  for 250 ms, serialize refreshes, and retain a trailing change during an outstanding
  request or blocked interaction. Identical snapshots, cache-only events, and local
  pending writes do not trigger refreshes. Metadata-only reconnect notifications
  are deduplicated against the last server fingerprint.
- actions.ts: server-authorized displayed-document revalidation; aggregate counts are requested
  only for status changes, initial reconciliation, or explicit manual refresh.
- customer-booking-experience.tsx: revalidate only signaled bookings on the current bounded page with its exact
  filters/cursor; keep search, page number, cursor history, selection and scroll.
  Sequence numbers reject responses superseded by navigation/filter requests.
  Automatic refresh reads explicit IDs rather than rerunning history-scanning search
  or awaiting-provider pagination. Rows that leave a filter are removed without
  backfilling from history; navigation/manual refresh fills the page. Search results
  now respect the existing requested page-size bound.
- customer-booking-details-drawer.tsx: silently reload authorized details without
  clearing the content or closing the drawer. Existing request sequence numbers
  reject stale responses. Queue refreshes during checkout. Server DTOs determine
  badges, deadlines, expiration presentation and checkout options.
- customer-booking-detail-content.tsx: minimal refresh controller inside the existing
  client component calls router.refresh(), updating the parent server-rendered page,
  banner and timeline. It waits through checkout, review/cancellation dialogs, and
  an outstanding route transition. Existing component identity and scroll are kept.
- customer-booking-realtime.test.tsx, customer-booking-revalidation.test.tsx, the
  customer-booking-security.test.mts contract, and existing customer-bookings/detail test
  files cover the listener coordinator and UI integration.

## Observed documents and costs

Only mainEvents/{displayedBookingId} and its canonical
providerRequests/{linkedRequestId} documents are observed. The open drawer observes
its selected booking even if the list page changes. List/drawer consumers share SDK
listeners for overlapping documents. The details route observes just its booking and
linked requests. There are no collection queries/listeners, payment/ledger/admin
listeners, timeline listeners, recurring polls, or offline persistence changes.

The default list page is 10 bookings (existing maximum 30); request membership is
bounded by the existing 30-request limit per booking. Actual reads scale with those
displayed documents, not historical booking volume. Rule-dependent user-document
reads and Firestore reconnect billing still apply.

Summary refreshes retain the existing aggregate queries and the projected
status/pendingProviderRequestCount query for pending-response totals. That query can
read all pending bookings, but does not fetch full historical booking DTOs and runs
only on relevant invalidation or manual refresh.

The first authoritative server snapshot triggers one coalesced reconciliation to
close the server-render-to-listener race. It may reload unchanged server DTOs once.
Brief hidden tabs retain listeners to avoid reconnect costs. After five hidden
minutes subscriptions are released; returning reconnects and reconciles once. During
hidden periods server refresh work is deferred. Permission/listener failures do not
automatically loop; users have an explicit Refresh control. Navigating away releases
subscriptions; signing out detaches SDK reads.

## Validation and limits

Automated validation uses mocked SDK events and existing server DTO fixtures, without
Firebase emulators or production writes. Coverage includes acceptance, expiration,
confirmation, cancellation/completion signals, cache/metadata filtering, independent
requests, shared subscriptions, sign-out, permission failure/manual retry,
reconnection, long-hidden cleanup, serialized refreshes, checkout deferral, drawer
preservation, server eligibility, pagination, summary revalidation, and route refresh.

Production browser/Auth/App Check connectivity and end-to-end deployed transitions
were not exercised. An off-page booking/new booking cannot signal this deliberately
bounded subscription set; navigate or manually refresh to update those counts/list
entries. A timeline-only write with no observed parent/request signal likewise needs
manual refresh. When live/refresh connectivity fails, prior DTOs remain visible;
checkout still reauthorizes through the existing server payment endpoint.

No Cloud Functions, payment policy/logic, rules, indexes, Customer Mobile, deployment,
commit, push, branch, or worktree changes are part of this work.

Validation commands (apps/web):

- `pnpm.cmd exec vitest run --maxWorkers=1` with customer-booking-revalidation,
  customer-booking-realtime, customer-bookings, customer-booking-detail,
  customer-booking-deadline, and customer-booking-lifecycle-evidence suites.
- `node --experimental-strip-types --test test/customer-booking-security.test.mts`.
- `pnpm.cmd exec tsc --noEmit`.
- Targeted `pnpm.cmd exec eslint` over all changed TypeScript/test files.
- Repository `git diff --check`.

Final results: six Vitest suites passed (124 tests); security contracts passed
(20 tests); web TypeScript, targeted ESLint, and git diff --check passed. One earlier
parallel run timed out in an existing search/filter UI assertion; it passed alone
and in the final single-worker run. No Firebase emulators were used.

Git scope: chore/monorepo-setup remains at a37deb60; nine tracked files modified and
five new untracked files (including this report). The starting working tree was
clean. All implementation/test files are in apps/web; this report is in docs.
