# Phase 3 backend foundation

Security references: [secret management](domain/secret-management.md),
[Cloud Functions security inventory](domain/cloud-functions-security.md), and
[payments](domain/payments.md).

Phase 4 security references: [security logging and monitoring](security/security-logging-and-monitoring.md),
[Flutter security](security/flutter-security.md), and
[adversarial test matrix](security/adversarial-test-matrix.md).
The combined verification entry point is documented in
[Phase 4 security hardening](phase-4-security-hardening.md).

## Status

Phase 3 establishes the trusted Firebase backend, client authentication
boundaries, provider onboarding and verification lifecycle, storage policy,
security-rule coverage, query policy, retention controls, emulator workflow,
and repeatable verification command.

The implementation spans Flutter customer mobile, Next.js web, Firebase Cloud
Functions, Firestore and Storage Rules, shared TypeScript types, and domain
documentation. Firebase Admin credentials and other secrets remain server-only.

## Completed architecture

- Firebase Auth is the identity authority.
- `users/{uid}` is the account and authorization record.
- `customers/{uid}` stores private customer profile data.
- `providers/{providerId}` stores provider business state and public fields.
- `providerVerifications/{verificationId}` and its `documents` subcollection
  store the trusted verification workflow.
- `mainEvents` and `providerRequests` are the canonical booking aggregates;
  legacy `bookings`, `addonRequests`, and `bookingTimelines` remain temporary
  compatibility paths.
- Cloud Functions own privileged creation, lifecycle transitions, audit logs,
  trusted notifications, rate limits, and idempotency records.
- Firestore and Storage Rules default-deny access outside documented ownership
  and public visibility policies.

## Authentication flows

### Customer mobile

Email/password registration creates Firebase Auth identity and the initial
customer profile. If initial Firestore creation fails, the newly created Auth
identity is rolled back. Login refreshes verified email state, rejects blocked
or disabled accounts, detects missing profiles, and maps Firebase errors to
friendly messages. Logout, password reset, verification refresh, and resend are
implemented.

Google Sign-In calls `ensureUserProfile`. The callable creates missing
`users/{uid}` and `customers/{uid}` records idempotently, fixes the role to
`customer`, sets active account state and `providerId=null`, and rejects
provider/admin, blocked, or disabled identities.

Provider Auth identity is created first, `ensureProviderIdentity` establishes
the provider user record, and `registerProvider` creates privileged provider
and verification documents.

Clients cannot assign administrator identity, provider approval, account
blocking state, or verification approval.

### Password operations

Password reset uses Firebase Auth directly. FEASTA currently has no custom
password proxy callable. Any future password backend must use the shared
server-side rate limiter.

## Web session flow

1. The browser signs in with the Firebase client SDK using in-memory
   persistence.
2. A fresh ID token is posted to `/api/auth/session`.
3. Firebase Admin verifies the token and active Firestore profile.
4. The server creates the `feasta_session` cookie with `HttpOnly`, `SameSite=Lax`,
   root scope, a five-day lifetime, and `Secure` in production.
5. Server-only guards verify the cookie with revocation checking, reload the
   account record, and enforce customer/provider/admin role access.
6. Logout revokes refresh tokens and clears the cookie.

Privileged session state is not trusted from local storage. Production uses
Application Default Credentials; service-account private keys must never use a
`NEXT_PUBLIC_` environment variable.

## Firestore collections

Canonical collections include:

- `users`, `customers`, `providers`, `providerVerifications`;
- `packages`, `menuItems`, `addons`;
- `mainEvents`, `providerRequests`, `payments`;
- `chatRooms`, `reviews`, `favorites`, `notifications`;
- `complaints`, `announcements`, `appSettings`, `adminLogs`;
- server-only `rateLimits` and `idempotencyKeys`.

See [domain/collections.md](domain/collections.md) for ownership,
subcollections, fixed-ID policy, and remaining legacy paths.

## Provider verification lifecycle

The only provider verification states are:

```text
draft
submitted
under_review
resubmission_required
approved
rejected
suspended
```

Allowed transitions are:

```text
draft -> submitted
resubmission_required -> submitted
submitted -> under_review
under_review -> approved | rejected | resubmission_required
approved -> suspended
```

Approval activates a provider. Rejection and resubmission keep it inactive;
resubmission permits document replacement. Suspension removes public
availability. Providers cannot review themselves. Admin review updates the
provider and verification transactionally, preserves ownership fields, writes
an audit log, and creates an owner notification.

The minimum server-owned document policy requires `business_permit` and
`valid_id`. See [domain/provider-verification.md](domain/provider-verification.md).

## Storage path policy

| Purpose | Path | Maximum |
|---|---|---:|
| Customer profile | `users/{uid}/profile/{fileName}` | 5 MB |
| Provider logo | `providers/{providerId}/logo/{fileName}` | 5 MB |
| Provider cover | `providers/{providerId}/cover/{fileName}` | 10 MB |
| Verification | `providers/{providerId}/verification/{documentType}/{fileName}` | 10 MB |
| Package assets | `providers/{providerId}/packages/{fileName}` | 10 MB |
| Booking attachment | `bookings/{bookingId}/attachments/{fileName}` | 10 MB |
| Complaint evidence | `complaints/{complaintId}/evidence/{fileName}` | 10 MB |

Verification, booking, and complaint files are private, immutable client-side
retention paths. Booking and complaint corrections use a new unique object name;
client overwrite and delete are denied. The
verification callable checks actual Storage existence, MIME type, size, and
exact provider/document-type path; public download URLs are not required.

## Security model

App Check and web request hardening are documented in
[`domain/app-check-and-web-security.md`](domain/app-check-and-web-security.md).
The backend-owned PayMongo lifecycle, signed webhook, refund boundary, and
validation commands are documented in [`domain/payments.md`](domain/payments.md).

- Firestore and Storage use default deny.
- Account roles and active/block state come from trusted server records.
- Public provider reads require approved, active, non-deleted state.
- Provider owners can manage their profile/catalog but cannot approve or
  activate themselves.
- Verification metadata and review actions are callable-only.
- Review and complaint creation are callable-only, rate-limited, and
  idempotent.
- Canonical payments, audit logs, verification history, and lifecycle history
  are immutable to clients.
- Notifications are owner-readable; users may update only read state.
- `rateLimits` and `idempotencyKeys` are inaccessible to clients.

Abuse-sensitive callables use Firestore transaction counters. Authenticated
subjects key by UID; suitable anonymous Maps requests use App Check app ID and
IP when available. Rejections include explicit retry timing. See
[domain/rate-limiting-and-idempotency.md](domain/rate-limiting-and-idempotency.md).

## Pagination and search policy

- Default page size is 20 and maximum size is 50.
- Lists use cursor pagination, never offsets.
- Stable ordering includes document ID as a tie-breaker.
- Normal Flutter list streams are bounded.
- Provider search uses server-owned normalized `searchTokens`; it does not
  silently filter only a previously loaded page.
- Composite indexes in `firebase/firestore.indexes.json` reflect supported
  Flutter/admin/backend query patterns. Single equality fields use automatic
  Firestore indexes.

## Soft-delete policy

Retained user-facing records use `isDeleted`, `deletedAt`, `deletedBy`, and
`deletionReason`. Providers, packages, add-ons, reviews, complaints, and
announcements are hidden from public queries after soft deletion. Hard deletion
is denied.

Payments, payment events, admin logs, booking/provider-request history, and
verification audit history are never deleted. Existing production documents
must run the documented query-policy backfill before clients begin filtering on
`isDeleted=false`.

## Emulator commands

```powershell
pnpm emulator:start
pnpm emulator:seed
pnpm emulator:export
pnpm emulator:reset
pnpm emulator:test
pnpm emulator:tooling:test
pnpm emulator:auth-web:test
pnpm emulator:provider-workflow:test
pnpm emulator:roundtrip:test
pnpm emulator:hosting:test
pnpm phase3:verify
```

Exports use ignored `firebase/emulator-data`. Reset accepts only localhost
emulator endpoints and clears Auth, Firestore, and Storage. Hosting validation
runs on port 5000 and tests a static page plus `/api/health`; normal Next.js
development remains `pnpm --dir apps/web dev`.

## Seed accounts

All accounts use password `FeastaTest!2026`.

| Email | State |
|---|---|
| `customer@feasta.test` | Active customer |
| `provider.pending@feasta.test` | Draft provider |
| `provider.submitted@feasta.test` | Submitted provider |
| `provider.approved@feasta.test` | Approved provider |
| `admin@feasta.test` | Active admin |

Seed data uses fixed IDs and includes profiles, verification variants,
catalog, event/request, legacy booking compatibility, payment, notification,
review, complaint, announcement, and app settings.

## Verification command

Run:

```powershell
pnpm phase3:verify
```

It runs, in order:

1. shared-types TypeScript build;
2. Functions TypeScript build and lint;
3. Next.js lint and explicit TypeScript typecheck;
4. Flutter analysis plus customer-registration rollback unit tests, with
   legacy warnings nonfatal but errors fatal;
5. Cloud Function lifecycle and query-policy unit tests;
6. Firestore and Storage Rules Emulator tests;
7. deterministic seed and Auth/Firestore/Storage reset validation;
8. Auth Emulator, Google mock identity, Next.js cookie, logout, and role-route
   acceptance tests;
9. provider registration, Storage upload, submission, admin review,
   notification, audit, idempotency, and rate-limit acceptance tests;
10. seed/export/fresh-import round-trip validation;
11. Hosting Emulator static page and Functions health-rewrite validation.

The verification uses a `demo-*` project and local emulators. Maps, FCM,
production Firebase, and other external production services are not required.

## Known limitations

- Payment creation/webhook and trusted booking-transition callables are not yet
  present; future implementations must use the shared idempotency utility.
- Some Flutter workflows still use legacy `bookings`, `addonRequests`, and
  `bookingTimelines` paths pending canonical migration.
- App Check contributes to anonymous rate-limit identity when present, but
  global enforcement rollout remains an operational deployment decision.
- Provider token search is prefix/token based, not fuzzy relevance search.
- Production SSR hosting for Next.js remains undecided. Phase 3 validates
  Firebase Hosting locally without claiming the dynamic app is static.
- Flutter analysis currently reports legacy nonfatal style/deprecation warnings;
  the verification command still fails on analyzer errors.
- Verification Storage objects are not included in seed data; document metadata
  is seeded for workflow screens, while Storage behavior is covered by emulator
  rules tests.

## Completion checklist

- [x] Shared provider-verification lifecycle across TypeScript, Dart, rules,
  Functions, and documentation.
- [x] Customer email/password and Google identity foundation.
- [x] Secure Next.js Admin session cookies and role guards.
- [x] Trusted, idempotent provider registration.
- [x] Trusted verification document, submission, review, and suspension flow.
- [x] Storage ownership, MIME, size, and privacy policy with emulator tests.
- [x] Firestore security-rule test coverage for primary domains.
- [x] Composite indexes, bounded query policy, cursors, and token search.
- [x] Soft deletion and immutable financial/audit retention policy.
- [x] Transaction-backed rate limiting and idempotency replay tests.
- [x] Repeatable emulator start, seed, export, reset, and validation scripts.
- [x] Local Hosting Emulator integration validation.
- [x] One-command local `pnpm phase3:verify` pipeline.

The strict criterion-by-criterion results are recorded in
[phase-3-acceptance.md](phase-3-acceptance.md). The final local gate passed on
2026-07-17 with 54 of 54 completion criteria satisfied.
