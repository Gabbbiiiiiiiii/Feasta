# Cloud Functions security inventory

Deployed callables enforce App Check; the Functions emulator alone bypasses
attestation. Authorization comes from Firebase Auth and trusted `users/{uid}`
documents. Rate limits use transactional Firestore buckets, not process memory.

| Export | Classification | Principal and controls |
| --- | --- | --- |
| `ensureUserProfile` | callable authenticated | Auth; server-fixed customer role; transaction; rate limit |
| `ensureProviderIdentity` | callable provider bootstrap | Auth; server-fixed provider role; transaction; rate limit |
| `syncUserAuthState` | callable authenticated | Auth disabled state, active profile and role; rate limit |
| `registerProvider` | callable provider | Active provider; validation; rate limit; deterministic IDs; idempotency; audit transaction |
| `registerVerificationDocument` | callable provider | Active owner; Storage path/metadata validation; rate limit; deterministic replay; audit transaction |
| `submitProviderVerification` | callable provider | Active owner; strict transition; rate limit; idempotency; audit transaction |
| `reviewProviderVerification` | callable admin | Active admin; strict transitions and reasons; rate limit; idempotency; audit and notification transaction |
| `createComplaint` | callable authenticated | Active account; validation; rate limit; idempotency; audit transaction |
| `submitReview` | callable customer | Active customer; completed owned booking; rate limit; idempotency; transaction |
| `createPaymentSession` | callable customer | Active customer; trusted booking/provider/amount; rate limit; deterministic payment; bound secret |
| `requestPaymentRefund` | callable admin | Active admin; reason; rate limit; local and gateway idempotency; audit; webhook confirmation |
| `searchPlaces` | callable authenticated | Active account; bounded input/output; rate limit; server key; cache; timeout |
| `reverseGeocode` | callable authenticated | Active account; Philippines bounds; rate limit; server key; cache; timeout |
| `getPlaceDetails` | callable authenticated | Active account; strict place ID; response field mask; rate limit; cache; timeout |
| `getDirections` | callable authenticated | Active account; Philippines bounds; one route/leg; rate limit; cache; timeout |
| `payMongoWebhook` | webhook | Public POST transport; raw signature and timestamp; replay receipt; transaction; no App Check |
| `healthCheck` | public HTTP | Read-only liveness; no secret or privileged state |
| `onPromotionWrite` | Firestore trigger | Not public; event idempotency; bounded fan-out; rate limit |
| `onUserSecurityStateChanged` | Firestore Auth-context trigger | Not public; deterministic immutable block/unblock/status audit with triggering principal |

There are no scheduled exports. Future scheduled handlers must use bounded
stable-cursor pages, progress/idempotency state, and retry-safe writes. They
must not also be unauthenticated HTTP handlers.

Maps cache keys are hashed after removing API keys, values are capped at 256
KiB, and each entry expires. Rules provide no client access to internal cache,
rate-limit, idempotency, webhook receipt, or audit collections.

Security contract tests enumerate every export and assert required App Check,
authentication, active-role, rate limit, idempotency/signature, secret, and
trigger controls. Emulator tests cover Auth, provider verification, payments,
Firestore Rules, and Storage Rules.
