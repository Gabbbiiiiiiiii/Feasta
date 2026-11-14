# Durable checkout attempts

This is an internal payment foundation, not a booking expiration or refund policy.
The existing all-provider readiness, exact provider-request membership, ownership,
amount, confirmation and non-revival checks remain authoritative.

## Stored contract

`payments/{paymentId}` remains one logical required provider down payment. It adds
`attemptSchemaVersion: 1`, `attemptCount`, and `currentCheckoutAttemptId`. Existing
checkout/resource identifiers remain compatibility fields, not complete history.

`payments/{paymentId}/checkoutAttempts/{attemptId}` records:

- Server-generated UUID, logical payment ID, immutable request fingerprint and
  `checkout_<sha256([paymentId, attemptId])>` gateway idempotency identity.
- `createdAt` and trusted backend `firstDispatchAt`, committed before dispatch.
- Known checkout ID/URL and append-only payment ID/payment-intent ID arrays.
- `resolution`: `unresolved`, `outstanding`, `success`, `failed`, or `expired`.
- Reconciliation observations and timestamps. Conflicting checkout identities are
  retained and block further creation.

`payments/{paymentId}/gatewayPayments/{gatewayPaymentId}` records each distinct
successful financial payment: amount/currency, attempt association where proven,
intent, source, processing timestamp and webhook event IDs. Only the gateway
payment's `attributes.paid_at` supplies `gatewayPaidAt`. Missing/malformed values
remain absent. Conflicting timing evidence is flagged, not silently overwritten.
The existing logical `paidAt` continues to have its original FEASTA semantics.

No client can write these documents. Existing default-deny rules cover both
subcollections; emulator tests verify unauthenticated and customer writes fail.
No index or rule changes are needed.

## Dispatch, retry and concurrency

The existing checkout validation runs before attempt reservation and again before
logical checkout persistence. A transaction selects/reserves one current attempt.
Concurrent calls can dispatch the same gateway key; they cannot reserve two new
attempt identities. Gateway identity persistence survives later booking-validation
failure. Final persistence also checks the current attempt and its checkout ID.

PayMongo retains idempotency keys for 24 hours. FEASTA retries for strictly less
than 23 hours from the original `firstDispatchAt`, retaining the existing refund
guard's one-hour margin. Refund and checkout code share that constant. Retry never
renews the window. The fingerprint prevents retry with different parameters.

An ambiguous response stays unresolved. A known current checkout can be reused
after normal gates pass. An unknown outcome outside the retry window blocks
dispatch. A new attempt is allowed only when every earlier attempt is authoritatively
terminal without success (`failed`/`expired`), history is complete, and no
reconciliation conflict exists. It gets a new UUID/key; older documents stay.

**This foundation deliberately does not infer terminal settlement from a failed
payment or expired-session notification.** The retrieval service does not promote
these observations to `failed`/`expired`. A future trusted settlement procedure
must prove that no pending intent can succeed before writing those resolutions.
Tests seed terminal proof solely to exercise the new-attempt transaction contract.
There is no client/admin callable that bypasses this requirement.

## Webhooks and retrieval

The existing raw-body signature verifier remains unchanged. Verified events bind
to the logical payment and a unique attempt through server-issued attempt metadata
or recorded checkout/payment/intent relationships. Conflicting associations block
booking application while preserving correctly valued financial evidence. Older
known attempts can succeed; older failure notifications cannot downgrade a newer
attempt. Money/linkage validation and canonical booking validation remain in place.

`paymentWebhookEvents/{eventId}` still deduplicates delivery. Multiple events for
one gateway payment create one financial record. Distinct successful payment IDs
create distinct records and set `reconciliationRequired` with an audit entry.
The original accounting resource ID and `paidAt` are retained. No automatic refund,
second booking application or terminal-booking revival occurs.

`reconcileCheckoutAttempts` retrieves every known checkout with the existing secret
authenticated PayMongo client. It validates checkout/payment/customer/request/event
relationships and accumulates payment/intent IDs and successful payment evidence.
Retrieval never confirms a booking. A success awaiting canonical application is
flagged for reconciliation. Network failures, unknown checkout IDs, incomplete
responses and expired sessions without settlement proof remain unresolved.

`readCheckoutAttemptResolution` reads the payment, ALL attempts and success records
transactionally. Any success proves financial success, even on an older attempt.
Without success, incomplete history or any unresolved/outstanding attempt means
`unresolved`. Only complete, entirely terminal unsuccessful history can be
`definitely_unpaid`. These results alone never authorize capacity release.

## Compatibility and remaining work

Legacy documents are not migrated or assigned invented dispatch/completion times.
A compatible known legacy processing checkout may still be reused, but another
dispatch requires reconciliation. Legacy successful financial status remains
success; authoritative completion timing remains unknown without gateway evidence.
Incomplete legacy unpaid history remains unresolved.

FEASTA still has separate logical payments/checkouts per required provider down
payment, with the all-provider gate before checkout. The pure event aggregation
helper excludes providers requiring no payment: all successes = `fully_paid`,
some successes plus definitively unpaid = `partially_paid`, all definitively unpaid
= `unpaid`, any uncertainty = `unresolved`. No partial checkout eligibility was added.

Before deadline reconciliation/capacity release: establish terminal intent settlement
proof, resolve old ambiguous/legacy histories, integrate retrieved successes through
canonical booking application, and define handling of late payments and distinct
duplicate charges. Do not infer safe release from only the latest checkout, from
webhook arrival time, or from this financial-success classification alone.

Official contracts:

- https://docs.paymongo.com/reference/idempotent-requests
- https://docs.paymongo.com/reference/checkout-session-resource
- https://docs.paymongo.com/reference/get_checkout_sessions
