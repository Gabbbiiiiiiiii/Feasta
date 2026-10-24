# P13-C final submission authorization

Path: readiness processing ? reserveProviderDisbursement (financial hold and all
constituent locks) ? transport.dispatch ? test wallet GET/funding validation ?
authorizeProviderDisbursementSubmission ? PayMongo /v2/batch_transfers POST.

Immediately before **each** POST exchange, a short Firestore transaction reads
current platform settings, the exact allowlisted disbursement, its active attempt,
the provider payment account and verification proof, provider and owner. It checks
Test Mode, amount, destination, source wallet/merchant, proof freshness and bindings,
account readiness and eligibility, active reservation identity, and elapsed hold.
Missing, stale or unreadable authority prevents that exchange. The body and
idempotency key remain identical across permitted retries.

The transaction also records a random dispatcher token on the attempt. Only that
dispatcher can authorize retries; another dispatcher cannot submit the reservation.
The authorization count/time records exchanges authorized, not proof of HTTP delivery.
Firestore conflict handling serializes concurrent changes to documents read by the
transaction. No transaction spans a network call.

The authorization commit is the protocol's linearization point. Revocation committed
before it blocks the exchange. Revocation committed afterwards cannot atomically
cancel an external request entering flight; Firestore and PayMongo do not share a
transaction. Each subsequent retry requires another fresh authorization commit.

An authorization claim is conservatively treated as possibly submitted, including
crashes between commit and HTTP. Unknown attempts retain their financial locks and
can only be reconciled by read-only gateway evidence lookup or trusted webhooks.
Revocation does not disable retrieval. An empty lookup does not prove failure and
cannot unlock or create a replacement payout. Definitely-not-submitted recovery
is rejected for an attempt with a submission claim. Only a recorded definitive
terminal outcome may release claimed funds or permit controlled replacement.

Tests use mocked HTTP and in-memory transaction records; they never POST to PayMongo.
