# Step 166-B: asynchronous read-only Awaiting Provider adapter

Implemented for review at `bf41139c371686be4566f9edf73b5377d0ef2ea9` on
`chore/monorepo-setup`. All seven existing untracked Step 164/165/166-A files
remain unchanged. No public callable or index export is added.

Added files:

- `functions/src/bookings/customer-booking-search-adapter.ts`
- `functions/test/customer-booking-search-adapter.test.cjs`
- `docs/customer-booking-search-step166-b-decision.md`

## Design and consistency

The internal adapter accepts a server-only verified-customer context, page size,
and an already authenticated/decoded cursor position. There is no client-supplied
ownership binding. The eventual callable must derive this context from its
verified active-customer authentication and decode the cursor against that UID.
This adapter is not an authentication boundary or public request parser.

One `runTransaction(..., {readOnly: true})` contains the parent query and every
related query. Parent filters/order/31-row limit follow the Step 166-A plan;
continuations use an SDK Timestamp retaining seconds and nanoseconds plus ID.
The unchanged pure consumer validates the complete fetched batch's scope and
ordering before related reads. The adapter then sequentially awaits exhaustive
bounded related queries and invokes the unchanged v1 evidence inspector through
`awaitingProviderCandidateMatches`. Only resolved booleans are replayed through
the pure consumer for its unchanged consumption/cursor behavior.

This avoids passing an async evaluator to the synchronous consumer. Deleted
candidates never cause related reads. Relationship preflight and evidence checks
apply only to consumed live candidates. Early completion leaves every subsequent
candidate unread for relationship purposes, including the 31st lookahead.
Any reconciliation exception rejects the whole transaction result; no page,
partial rows, or advanced position escapes. V2 remains rejected.

The installed Admin dependency resolves to `@google-cloud/firestore` 7.11.6.
Its `build/src/transaction.js` sets read-only attempts to one, lazily starts a
read-only transaction on the first read and reuses its transaction ID thereafter.
`build/src/reference/query-util.js` restarts query streams only when there is no
transaction/read-time argument. Transactional reads therefore do not restart
query evaluation through that path. The adapter also rejects a second callback
entry before issuing any further read. There are no application retry loops,
fallback queries, write methods, or external caches.

The SDK's [read-only transaction contract](https://googleapis.dev/nodejs/firestore/latest/Firestore.html#runTransaction)
guarantees a consistent snapshot (potentially up to 60 seconds old) and no
transaction retries. Related query `readTime` is additionally required to equal
the parent query's readTime; mismatch fails closed. Mock tests verify the
transaction boundary and mismatch failure; they do not constitute live backend
verification. Transport-level RPC retries/charges remain SDK/service concerns,
not additional callback/query/evidence evaluations. Dependency upgrades must
recheck these implementation details. No emulator or remote database was used.

Consistency applies within one page. Independent pages are not a frozen session;
stable-dataset traversal has no skipped/duplicate matches, while concurrent
changes can affect later pages as described in Step 166-A.

## Read budget and latency

At most 31 parents fetched, 30 candidates consumed, and 30 related queries of
limit 31. No loop fills a short page. Empty pages can carry continuations based
on the last consumed candidate. Query count is at most 31 per application call.
The agreed conservative document-return budget is **961 = 31 + 30 * 31**.
A successful page returns at most **931 = 31 + 30 * 30** source documents.
Immediate overflow failure tightens the actual maximum to **932**: 31 parents,
29 successful 30-document related sets, then one 31-document overflow set.
Tests count mock query executions and returned documents, including late overflow.
Deleted-only batches need one query; a page filled by its first candidate needs
two. Stored membership overflow fails before that candidate's related query.

Reads are sequential to avoid unnecessary evidence reads after early completion
or failure. Worst-case latency includes 31 serial query round trips plus SDK
authentication/connection and processing overhead; no production latency estimate
is claimed. SDK transaction expiry bounds backend transaction lifetime; this
internal adapter does not provide configurable cancellation of in-flight RPCs.
The future callable still needs its request deadline, response-byte budget,
safe presentation field allowlist, rate limiting and operational latency review.
Document counts do not bound bytes, index charges, or transport billing.

## Validation and readiness

Functions build, affected regression tests, changed-file ESLint, CJS/emitted JS
syntax checks and whitespace validation passed. Tests cover deferred nonmatching
evidence, ownership, query limits, consistency, lookahead, early completion,
empty continuation, deleted records, stale/contradictory evidence, v2, stored and
query overflow, callback replay, query errors, stable traversal and frozen inputs.

There is no consistency blocker for this scoped adapter. Full callable work may
proceed for review, subject to the unresolved Step 166-A modes, draft-section
contract, auth/parser/cursor integration, safe DTO, runtime/byte limits, historical
readiness and index verification. A full production callable or mobile activation
is not yet ready. No writer, financial data, lifecycle outcome, rule, or existing
prerequisite file was changed. No branch/worktree, migration, commit, push,
deployment, emulator, or production access was performed. Stop for review.
