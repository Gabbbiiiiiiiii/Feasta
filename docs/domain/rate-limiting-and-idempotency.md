# Rate limiting and idempotency

Abuse controls are server-enforced in Cloud Functions and persisted in
Firestore. No production decision depends on process memory.

## Rate limits

| Operation | Limit |
|---|---:|
| `registerProvider` | 5 per 15 minutes |
| `submitProviderVerification` | 5 per 10 minutes |
| `registerVerificationDocument` | 30 per 10 minutes |
| `reviewProviderVerification` | 30 per 10 minutes |
| `submitReview` | 5 per hour |
| `createComplaint` | 3 per hour |
| Maps search/details/geocoding | 30 per minute |
| Maps directions | 20 per minute |
| Promotion notification fan-out | 6 per promotion per hour |

Authenticated callables key counters by Firebase UID. Anonymous Maps calls use
the verified App Check app ID plus IP when App Check is present, otherwise IP.
App Check enforcement can therefore be rolled out without changing the counter
schema. A rejected request returns `resource-exhausted` with
`retryAfterSeconds`, `limit`, and `windowSeconds` details.

Counters use fixed-window Firestore documents and transactional increments.
Their document IDs and subject values are SHA-256 hashes. Client access to
`rateLimits` and `idempotencyKeys` is denied.

Firebase Authentication password reset is currently performed by the Firebase
Auth client SDK; FEASTA has no password proxy callable to rate-limit. Firebase
Auth applies its own service-side anti-abuse controls. Any future password
backend must use the shared limiter before sending email or mutating Auth.

## Idempotency

Provider registration, verification submission, admin verification review,
review submission, complaint creation, and promotion notification fan-out use
the Firestore idempotency utility. Callers may send `idempotencyKey`; when they
do not, a stable hash of actor, operation, and validated payload is used.

Completed calls replay their stored normalized result with
`idempotentReplay=true`. Concurrent processing returns `aborted` with retry
timing. Processing leases expire after 60 seconds, failed calls may be retried,
and records are retained for 24 hours by default.

Payment creation claims a deterministic idempotency key before calling PayMongo.
The webhook uses the provider event ID and a Firestore transaction so replayed
events have no duplicate effects. Canonical payment events, booking history,
audit logs, and notification records use deterministic IDs or transactional
creation. Future booking-transition callables must use the same shared
idempotency policy before creating lifecycle or notification side effects.
