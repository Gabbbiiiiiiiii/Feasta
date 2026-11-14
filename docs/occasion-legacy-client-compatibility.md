# Occasion Lifecycle: legacy customer compatibility review

Local review on 2026-10-28, branch `chore/monorepo-setup`. This document is not
release authorization or readiness evidence. Production was not inspected or
modified. The nine approved/inactive occasions are the supplied rollout state.

## Paths traced

- Flutter `FeastaRepository` package discovery and `packagesByProvider` filter
  raw Firestore documents with `isLegacyOccasionPublicPackage` before decoding.
  `getEligiblePackageForPreparation` performs a server read and repeats this
  check, publication checks, provider association and provider eligibility.
  Package details, event customization and event-list preparation call it.
  Old installed binaries do not receive this filter automatically.
- Flutter `getPackageById` remains an unfiltered generic read; it currently has
  no callers. Do not reuse it for new booking preparation. No new filter was
  applied to this method or historical booking models.
- `FirestoreCustomerBookingsSource` queries customer-owned `mainEvents`, using
  stored booking snapshots, without joining the live package or occasions.
  Withdrawal must not delete historical documents or rewrite their snapshots.
- Web home/discovery/provider detail and package detail use
  `normalizePublicPackage`. Package book/plan pages resolve
  `getPublicPackageDetail`, so the same compatibility filter applies. These
  public package reads do not establish active occasion authority.
- `submitBookingRequest` and payment-agreement preparation share the actual
  booking selection handler. New requests read stable catalog generation and
  the selected active occasion inside the transaction. Stored package data is
  checked independently of the request/client version. V2 occasion tuples and
  unknown offer envelopes are rejected; the existing booking contract rejects
  V2 pricing. Historical replay returns before mutable occasion/package checks,
  retaining its existing ownership and fingerprint validation.
- `publishProviderPackage` checks the legacy guard before publication and reads
  catalog generation plus approved/active/applicable occasion authority before
  writing. Existing pricing safeguards keep per-pax/per-bundle offers draft-only.
  No approval grants are inferred. Other existing generation fences and release
  gates remain unchanged.

## Narrow changes

Functions' legacy publication/booking guard and Web normalization now match
Flutter's rejection of unknown `offerSchemaVersion` markers (including null).
Explicitly present malformed schema fields fail closed. Web also rejects a
present `pricingModel` property even if undefined; omission remains compatible.
Existing V1 scalar records and explicit version 1 markers remain accepted.

## Deployment blockers — do not bypass

1. **Zero active occasions means zero new bookings through this handler.** All
   nine legacy event types fail with `OCCASION_UNAVAILABLE`, including agreement
   preparation. Stable catalog state alone is insufficient. Missing/transitioning
   catalog authority also fails closed. This also gates custom-menu submissions.
   Deploying the pending unconditional active-occasion checks into a live legacy
   booking service while all records remain inactive would interrupt new legacy
   bookings. Do not deploy that combination. An approved coordinated activation
   plan or separately reviewed legacy migration strategy is required; this review
   does not authorize activation, manufacture evidence, or add a bypass flag.
2. **Current public package rules are not a V2 boundary.** Emulator tests confirm
   that a V2 package with all existing publication flags can be read directly and
   returned by an old client's query. An inactive occasion does not stop these
   reads. Client-side filters protect only updated clients. Keep V2 records
   withdrawn under the existing publication fences until a verified server-side
   reader strategy covers every public writer and reader, including Admin SDK
   writers, restoration and migration paths. No production inventory was taken.
3. Adding a schema predicate to the current rules alone is not a safe migration:
   old queries do not constrain that field, and rules reject queries rather than
   filtering their results. Before enabling V2 public offers, coordinate a
   versioned discovery/projection or equivalent server-enforced strategy, client
   migration, old-client policy, writer coverage and rules verification. The
   release gate must remain closed until that work has real evidence.
4. Legacy public packages can still appear in Flutter/Web while their occasion is
   inactive; final server preparation/submission rejects them. Align discovery
   availability and customer messaging as part of the coordinated rollout, without
   applying discovery filters to booking history or payment/recovery records.
5. Existing historical replay still uses the pre-existing input/auth checks
   before its transaction. This patch does not broaden replay eligibility or
   change date validation, payment, refund, cancellation or recovery behavior.

## Local validation

- Functions TypeScript compilation and Web TypeScript checks passed.
- 168 targeted Functions tests passed, including actual compiled callable tests
  with in-memory transaction/I/O doubles: old-client V2 rejection, all nine
  inactive occasions, agreement preparation, historical replay and replay security.
- Firestore emulator on `demo-feasta-occasion-compat`: 39 tests passed, including
  withdrawal/history isolation and an explicit characterization of the unresolved
  public-V2 exposure. That characterization passing does not establish readiness.
- Flutter targeted helper/preparation/history/pagination/replay suites: 91 tests
  passed, followed by 7 passing history-source tests after adding the explicit
  historical-snapshot regression (92 distinct tests across these runs).
- Web: 4 compatibility normalization tests and 90 discovery/history tests passed.
- `git diff --check` passed. No test assertion failed. Initial sandbox launcher
  issues were resolved using an isolated Firebase CLI config directory and
  approved Flutter SDK-cache access. Firestore ran locally and shut down after
  all 39 tests passed; the lingering CLI wrapper was interrupted afterward.
- No live old-device test, full end-to-end booking/payment flow, production
  inventory, Firebase deployment or production write was performed.
