# Phase 4 security architecture

Status date: 2026-07-17

This document is the security architecture and production-enablement record for
FEASTA Phase 4. It describes controls implemented in the repository and keeps
environment-owned deployment work explicit. A checked implementation item does
not imply that Firebase Console, Vercel, Google Play, or PayMongo production
configuration has been completed.

## Security objectives and threat model

FEASTA protects account identity, private customer and provider data,
verification evidence, booking and complaint records, canonical payment state,
administrative actions, and backend credentials. The model assumes an attacker
may control a browser or mobile client, modify client requests, replay valid
requests, upload hostile content, use another legitimate account, or send an
arbitrary request to a public endpoint. Client code, client claims, object
metadata, route parameters, and payment redirects are therefore untrusted.

Primary security objectives are:

- authenticate every protected actor and reject disabled, blocked, inactive,
  revoked, expired, and missing-profile identities;
- authorize from trusted Auth and Firestore state, with ownership and role
  checks at every data or server boundary;
- keep approval, audit, payment, and other privileged lifecycle fields
  backend-owned;
- keep sensitive uploads private and constrain path, owner, type, size, and
  replacement behavior;
- contain abuse and replay with App Check, persistent rate limits,
  idempotency, transactions, and provider webhook signatures;
- minimize credentials and personal data in code, errors, storage, and logs.

### Threat-model register

Residual risk is the risk remaining with the listed control in place. Required
mitigations include both repository work and environment-owned operating work.

| Asset | Threat | Attacker | Attack path | Existing control | Residual risk | Required mitigation | Test coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Firebase identity and session | Account takeover or replayed session | Credential thief or malicious site | Stolen password, ID token, or cookie | Firebase Auth, email verification, HTTP-only session cookie, revocation verification, active-profile checks | Compromised device may retain a valid session until detection | Enable MFA for admins when product policy permits; alert on anomalous Auth activity; revoke affected sessions | Auth/session unit tests and `emulator:auth-web:test` |
| Role and account state | Customer/provider self-escalates or clears a block | Authenticated user | Direct Firestore write or forged client field | Rules protect `role`, `providerId`, `isBlocked`, and `accountStatus`; server guards reload trusted profile | Misconfigured new collection/function could omit the shared guard | Require security review and deny-by-default tests for every new privileged surface | Firestore Rules and web route-role tests |
| Customer private records | Cross-account disclosure or modification | Another customer/provider | Guessed document ID or broad query | Ownership-based Firestore Rules; query/rule tests; active-account requirement | Rules/schema drift can expose newly added fields | Update ownership policy and tests with every schema change; minimize stored PII | Firestore adversarial suite |
| Provider profile and public catalog | Inactive, suspended, or deleted provider appears publicly | Provider or anonymous caller | Self-activation, stale query, direct read | Approval fields are backend-owned; public reads require approved, active, non-deleted state | Cached UI/search results can temporarily be stale | Apply the same filters in every public query and expire external caches | Firestore provider and soft-delete tests |
| Verification evidence | Private document disclosure, overwrite, or self-approval | Customer or provider | Storage URL guessing, path spoofing, client status update | Owner/admin-only read; exact path/type/size policy; lifecycle-gated upload; callable review by active admin | Storage Rules validate declared metadata, not file bytes; malware may be embedded in an allowed format | Add quarantine/content scanning before high-risk production use; retain approved evidence under policy | Storage Rules and provider workflow tests |
| Admin actions and audit history | Unauthorized decision or audit tampering | Non-admin or compromised admin | Callable invocation or direct log write | Active-admin guard, strict transitions, reason validation, immutable client-denied `adminLogs`, structured security events | A compromised admin remains powerful | Require MFA/least privilege, alert on sensitive decisions, and regularly export/retain audit records | Function contracts, Rules, provider workflow tests |
| Booking/request data | Participant impersonation or backend lifecycle tampering | Unrelated or linked user | Direct update or guessed booking ID | Participant reads; backend-controlled lifecycle fields; deny-by-default writes for canonical records | Incorrect linkage data could grant access | Validate customer/provider linkage transactionally when records are created | Firestore booking/request tests |
| Payment records | Client marks paid, changes amount, or refunds | Customer/provider | Direct Firestore write or forged callable payload | All canonical writes denied to clients; backend derives amount/currency/ownership; strict status transitions | Gateway or backend configuration error can reject legitimate payments | Reconcile gateway records and alert on amount/currency mismatch | Payment unit, Rules, and emulator integration tests |
| PayMongo webhook | Forged or replayed event | Internet attacker | Public HTTP POST with fabricated body/signature | Raw-body HMAC verification, constant-time comparison, five-minute timestamp tolerance, event-ID idempotency, Firestore transaction | Leaked webhook secret permits forgery until rotation | Restrict secret access, rotate on suspicion, monitor invalid signatures and duplicates | Webhook-signature and payment emulator tests |
| File storage | Malware, oversized data, owner spoofing, or unauthorized replacement | Authenticated user | Crafted MIME/extension/metadata/path | Explicit MIME and extension allowlists, size limits, Firestore ownership lookup, create-only audit paths | Polyglot/malicious content can pass metadata checks | Add server-side scanning/quarantine and download response hardening | Storage Rules suite |
| Web session mutations | CSRF, disallowed origin, or open redirect | Malicious website | Cross-site POST or crafted `returnTo` | Exact Origin allowlist, double-submit CSRF token, constant-time compare, relative return-path validation | XSS on the FEASTA origin can bypass CSRF | Continue CSP tightening and dependency scanning; avoid unsafe DOM sinks | Web request-policy tests |
| Browser application | XSS, clickjacking, data exfiltration, Admin SDK leakage | Malicious content/dependency | Injected script, framing, or client import | CSP, frame denial, `nosniff`, referrer/permissions/cross-origin headers, server-only Admin modules | CSP currently permits inline scripts/styles for Next.js compatibility | Move to nonce/hash CSP when framework integration is ready; monitor dependency advisories | Web CSP/header and source-boundary tests |
| Callable/API capacity and Maps key | Resource exhaustion or unrestricted proxy abuse | Bot or abusive user | Rapid callable requests or oversized Maps input | App Check, persistent Firestore rate counters, bounded validation/results, timeouts, cache | Distributed users/IPs can remain below per-subject limits | Add budget/quota alerts, tune rates from staging metrics, consider edge/WAF controls | Rate-limit and function-contract tests |
| App Check tokens | Unattested automation or token replay | Scripted client | Callable/Firestore/Storage request without valid attestation | Callable enforcement outside emulator; Play Integrity/App Attest and reCAPTCHA Enterprise clients; product rollout plan | App Check is an abuse signal, not identity; token consumption is not enabled | Enable product enforcement after metrics validation; consider limited-use tokens for selected operations | App Check policy test plus staged console validation |
| Secrets and service identities | Credential disclosure or excessive privileges | Repository reader, log reader, compromised runtime | Committed `.env`, client bundle, verbose error, broad IAM | Functions secrets/Secret Manager, server-only Vercel variables, ignore rules, redaction, pattern scan | Scanner cannot detect every secret; runtime/IAM compromise remains possible | Rotate periodically, use least privilege, inspect build artifacts and cloud audit logs | `security:secrets`, web Admin-import test |
| Logs and notifications | PII/token leakage or log injection | User controlling request fields | Crafted headers/body included in logs | Structured allowlisted events, credential redaction, bounded correlation IDs, masked contact helpers | Newly added direct logging can bypass shared helpers | Route security events through shared logger; review logs and retention settings | Log-sanitization and security-event unit tests |
| Mobile release configuration | Debug App Check or emulator endpoint ships to production | Build/configuration error | Release built with debug/emulator settings | Startup guards, release project check, Play Integrity/App Attest selection, release cleartext disabled | Misconfigured Firebase Console/signing can make release unavailable | Validate signed release in staging and Play Integrity metrics before rollout | Flutter analyze and security source validator |

## Trust boundaries

1. **Untrusted clients:** Flutter and browser UI authenticate users but cannot be
   trusted to assign role, ownership, approval, payment, block, or audit fields.
2. **Firebase identity boundary:** Firebase Auth proves UID and token state.
   App Check independently attests the application; it does not replace Auth.
3. **Rules boundary:** Firestore and Storage Rules enforce per-request access
   for direct SDK traffic. Queries must satisfy the same constraints as reads.
4. **Trusted application boundary:** Cloud Functions and Next.js server-only
   modules use Admin SDK credentials. They must validate identity, active state,
   role, ownership, input, transitions, replay, and errors because Admin SDK
   bypasses Rules.
5. **External-service boundary:** PayMongo and Google Maps are untrusted network
   peers until their inputs, responses, and (for webhooks) signatures are
   validated. Keys remain in trusted runtimes.
6. **Operations boundary:** Firebase Console, Secret Manager, Vercel, Google
   Play, PayMongo, IAM, monitoring, backup, and retention settings are controlled
   outside this repository and require separate production verification.

## Role model

The canonical roles are `customer`, `provider`, and `admin`.

| Role | Trusted capabilities | Explicit restrictions |
| --- | --- | --- |
| Customer | Own profile/customer data, own events/bookings/requests, eligible complaint/review callables | Cannot become provider/admin, alter trusted account fields, read another private customer, or mutate canonical payment state |
| Provider | Own provider assets and permitted provider data; own draft/resubmission verification evidence; linked request/booking reads | Cannot approve itself, activate itself, read another provider's evidence, or alter submitted/under-review verification |
| Admin | Server-authorized review, account administration, audit reads, refund request, and private evidence review | Must be active, cannot rely on client actor fields, and privileged actions require audit/reason controls |

Firebase Auth UID establishes identity; `users/{uid}` establishes trusted role
and account state. Provider ownership additionally requires
`providers/{providerId}.ownerId == uid` and a consistent user `providerId` link.
Role alone never establishes resource ownership.

## Authentication architecture

Flutter uses the Firebase SDK for email/password and Google authentication.
Profile callables create or repair trusted customer/provider identity records
idempotently. Clients cannot set `role`, verification flags, block state,
account status, or provider approval. Initial customer registration rolls back
the Auth user if its required Firestore profile transaction fails. Every
protected backend path rejects missing profiles and inactive, blocked, or
role-incompatible users.

The mobile client relies on Firebase's protected token storage rather than
persisting tokens in SharedPreferences. Sensitive saved address fields use
secure storage. Release startup refuses emulator mode or an unexpected Firebase
project; debug App Check is limited to debug builds.

## Authorization model

Authorization is layered:

- direct database/object access is constrained by Firestore/Storage Rules;
- callable Functions use shared Auth, active-account, role, and ownership
  guards before business logic;
- privileged lifecycle changes use transactions and server timestamps;
- Next.js protected layouts and route handlers verify the session server-side
  and authorize from the trusted profile;
- all unmatched Rules paths deny read and write.

App Check, possession of a document ID, a UI route, or a client-side redirect is
never treated as authorization.

## Firestore Rules policy

The deployed source is `firebase/firestore.rules`. Its policy is deny by
default and includes these invariants:

- users may access only policy-approved records and cannot change trusted role,
  ownership, verification, blocking, or account-status fields;
- public provider reads require public eligibility; owner/admin access remains
  available for draft administration;
- provider and verification creation/review are backend-owned;
- booking, request, chat, notification, complaint, and review access follows
  explicit ownership/participant rules;
- canonical payments, webhook events, audit logs, rate limits, idempotency keys,
  caches, and immutable history reject client writes;
- deleted public records are hidden, and client hard deletion is denied where
  retention is required;
- unknown collections fall through to a final deny rule.

Rules tests run against the Firebase Emulator with the Rules Unit Testing
library and must use explicit denial assertions for adversarial cases.

## Storage Rules policy

The deployed source is `firebase/storage.rules`. Ownership is resolved from
Firestore, not upload metadata. Protected writes require an active, unblocked
user. Unknown paths and unspecified MIME types are denied.

| Path | Allowed writer/readers | Allowed types | Maximum | Replacement/delete policy |
| --- | --- | --- | ---: | --- |
| `users/{uid}/profile/` | owner writes; owner/admin reads | JPEG, PNG, WebP | 5 MB | owner replace/delete |
| `providers/{providerId}/logo/` | provider owner writes; public reads | JPEG, PNG, WebP | 5 MB | owner replace/delete |
| `providers/{providerId}/cover/` | provider owner writes; public reads | JPEG, PNG, WebP | 10 MB | owner replace/delete |
| `providers/{providerId}/packages/` | provider owner writes; public reads | JPEG, PNG, WebP | 10 MB | owner replace/delete |
| `providers/{providerId}/verification/{documentType}/` | provider owner writes in draft/resubmission; owner/admin reads | PDF, JPEG, PNG, WebP | 10 MB | no client delete; server registration validates actual object |
| `bookings/{bookingId}/attachments/` | participants write/read | PDF, JPEG, PNG, WebP | 10 MB | create only; no client delete |
| `complaints/{complaintId}/evidence/` | creator writes; creator/related provider/admin reads | PDF, JPEG, PNG, WebP | 10 MB | create only; no client delete |

Verification evidence is never public. MIME metadata and file extensions must
agree; executable, script, HTML, archive, and generic binary uploads are not on
an allowlist. See `domain/storage-foundation.md` for the detailed policy.

## App Check rollout

Flutter debug builds use the debug provider without a hardcoded token. Android
release uses Play Integrity; Apple release uses App Attest where supported. The
browser initializes reCAPTCHA Enterprise once and only client-side. The site
key is public configuration; no App Check server secret enters the bundle.

Deployed callables set `enforceAppCheck: true`; the Functions emulator alone
disables it through `FUNCTIONS_EMULATOR=true`. Webhooks do not enforce App Check
because PayMongo cannot mint Firebase tokens and must use signature validation.
Firestore and Storage enforcement is an environment-level Firebase setting.

Rollout sequence:

1. register production/staging clients and providers;
2. deploy token generation and inspect metrics without enforcement;
3. validate debug/emulator and legitimate staging traffic;
4. enable callable, Firestore, and Storage enforcement in staging;
5. test missing-token denial and valid-token acceptance;
6. enable production enforcement gradually and monitor rejection rates.

Rollback disables enforcement only for the affected product while leaving
client token generation deployed, investigates metrics/configuration, validates
the fix in staging, and then re-enables enforcement. Release builds must never
fall back to the debug provider.

## Next.js session flow

```text
Firebase client sign-in
  -> fresh Firebase ID token
  -> POST /api/auth/session (Origin + CSRF validated)
  -> Admin SDK verifies token and recent sign-in
  -> trusted users/{uid} profile/role/account checks
  -> Firebase session cookie: feasta_session
  -> protected server layout/handler verifies cookie with revocation checking
  -> role-specific page or operation
```

The session cookie is `HttpOnly`, `SameSite=Lax`, path `/`, five days, and
`Secure` in production. It carries the Firebase session mechanism rather than
application role data. Admin SDK modules use `server-only`. Customer, provider,
and admin layouts call exact server role guards; a proxy cookie check is only an
early navigation optimization. Logout validates the mutation, revokes refresh
tokens where required, and clears session/CSRF cookies.

## CSRF, origin, redirects, CSP, and headers

Cookie-authenticated mutations require an exact Origin from
`WEB_ALLOWED_ORIGINS` and a double-submit `feasta_csrf` cookie plus
`x-feasta-csrf` header. The comparison is constant-time. Wildcard or missing
origins fail closed. Redirect targets must be same-origin relative paths;
protocol-relative paths, backslashes, CR/LF, and external URLs are rejected.

Next.js emits CSP plus `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, and
`Cross-Origin-Resource-Policy`. Production adds HSTS and removes
`unsafe-eval`. `frame-ancestors 'none'`, `object-src 'none'`, and constrained
script/connect/frame/image origins reduce injection and framing exposure.
`unsafe-inline` remains a documented limitation for current Next.js bootstrap
and style compatibility; production should move to nonce/hash CSP when viable.

## Payment security and webhook validation

The trusted payment path is:

```text
customer callable -> validate booking/owner/provider/server amount
  -> create PayMongo session with backend secret and idempotency key
  -> signed PayMongo webhook over raw body
  -> verify signature and timestamp before trusting event fields
  -> transaction validates event/payment/booking/provider/amount/currency/state
  -> payment + booking + event + audit + notifications committed atomically
```

Currency is server-fixed to `PHP`; client payment writes are denied. Only a
trusted webhook assigns confirmed timestamps and states. The lifecycle is
`pending -> processing|paid|failed|expired`, `processing -> paid|failed|expired`,
`failed|expired -> processing`, and `paid -> refunded`. A refund callable is
admin-only and a signed webhook confirms the canonical refunded state.

The webhook is POST-only, verifies `Paymongo-Signature` against the untouched
raw body with `PAYMONGO_WEBHOOK_SECRET`, compares signatures in constant time,
rejects timestamps outside five minutes, stores a minimal event by provider
event ID, and handles duplicates without duplicate effects. It does not use
App Check and never logs raw payment payloads, signatures, card data, or secrets.

## Secret management and rotation

Private values use Firebase Functions secrets/Secret Manager or encrypted
server-only Vercel variables. Local sandbox values belong in ignored
`.env.local` files. `NEXT_PUBLIC_*` is permitted only for browser-safe Firebase
configuration and public site keys. Service-account JSON, private keys,
PayMongo secrets, webhook secrets, Maps server keys, API tokens, and App Check
debug tokens must not be committed, logged, or returned in errors.

### Secret rotation

Rotation procedure:

1. classify the exposure and revoke immediately if compromise is suspected;
2. create a replacement/version with least privilege;
3. update Functions/Vercel and, for webhooks, coordinate the gateway endpoint;
4. deploy and validate Auth, Maps, payment, webhook, and refund paths;
5. revoke the old version after the shortest safe overlap;
6. inspect audit/security logs and dependent credentials;
7. record owner, time, affected systems, and validation in the incident record;
8. purge repository history only after revocation when a value was committed.

`pnpm security:secrets` reports only file and secret type, never matched values.

## Logging and monitoring policy

Security events use `eventType`, `action`, `outcome`, `actorUid`, `targetId`,
`reasonCode`, and a bounded/generated `correlationId`. Metadata is limited to
non-sensitive identifiers, state, policy, and retry timing. Shared logging
redacts credential-shaped keys/text; email and phone data is masked only when
operationally necessary. Passwords, ID tokens, cookies, authorization headers,
private keys, signatures, raw webhooks, and verification evidence paths are
never logged.

Monitor invalid webhook signatures, webhook failures/replays, blocked-account
attempts, role denials, session creation failures, rate-limit bursts, App Check
rejection metrics, and missing configuration. Restrict logs and immutable
`adminLogs` to operational admins, set retention/export policies, and test alert
delivery in staging. See `security/security-logging-and-monitoring.md`.

## Rate limiting and idempotency

Abuse-sensitive callables use persistent Firestore fixed-window counters and
transactional increments. Authenticated subjects are keyed by UID; suitable
anonymous Maps traffic uses App Check app identity/IP-aware subjects. Rejection
returns bounded retry timing. No production limiter depends on process memory.

Provider registration/submission/review, document registration where
applicable, complaints, reviews, notification fan-out, payment creation, and
payment processing use deterministic identifiers or the shared Firestore
idempotency mechanism. Completed calls replay normalized results, concurrent
leases fail safely with retry timing, and privileged transitions remain
transactional. Webhook provider event IDs prevent duplicate effects.

## Incident response basics

1. **Triage:** assign an incident owner, correlation/time window, affected
   actors/assets, and severity; preserve logs and immutable audit evidence.
2. **Contain:** revoke sessions or disable/block accounts, disable an affected
   integration, restrict IAM, pause a webhook, or temporarily reduce exposure.
3. **Eradicate:** fix the vulnerable path, rotate compromised credentials, and
   invalidate replay/idempotency state only under an audited recovery plan.
4. **Recover:** deploy through staging, run the security regression suite,
   restore integrations gradually, reconcile payments/data, and monitor.
5. **Notify:** follow applicable contractual, privacy, payment, and legal
   notification requirements; do not disclose sensitive evidence in tickets.
6. **Review:** document root cause, timeline, customer impact, control gaps,
   corrective owners/dates, and new regression tests.

## Security testing commands

Run from the repository root:

```powershell
pnpm security:secrets
pnpm security:coverage
pnpm flutter:security:test
pnpm --dir functions test
pnpm --dir apps/web test:security
pnpm emulator:test
pnpm emulator:auth-web:test
pnpm emulator:provider-workflow:test
pnpm emulator:payment:test
pnpm phase4:verify
```

`pnpm phase4:verify` is the acceptance command. It runs the 45-scenario
coverage manifest, Flutter security policy validation, and the Phase 3
regression suite including builds, lint/type checks, unit/security tests,
Firestore and Storage Rules tests, Auth/web/provider/payment emulator flows,
seed/export/reset/import validation, and Hosting validation. It requires local
emulator ports and process permissions but no production service or secret.
Scenario-to-test evidence is maintained in
`security/adversarial-test-matrix.md`.

## Known limitations

- The complete post-change `pnpm phase4:verify` run passed locally on
  2026-07-17 in 463.3 seconds. This does not validate environment-owned
  production controls.
- The Flutter runtime test process stalled in the current environment; Flutter
  analysis and the deterministic security source validator pass, but the added
  pure Dart runtime test still needs execution in CI or a working local runner.
- Firestore and Storage App Check enforcement, Play Integrity/App Attest,
  reCAPTCHA Enterprise, production signing, Vercel variables, Functions secret
  values, PayMongo webhook registration, IAM, retention, and alerts are
  environment-owned and not proven by repository tests.
- Storage Rules validate declared MIME metadata and extension, not file bytes;
  antivirus/content-disarm quarantine is not implemented.
- Production CSP still permits `unsafe-inline` for Next.js compatibility.
- App Check limited-use token consumption is not enabled; server idempotency
  and transitions remain the replay controls.
- MFA, formal backup/restore drills, dependency/SBOM scanning, penetration
  testing, and automated alert delivery validation are not yet in scope.

## Production enablement checklist

- [ ] Use separate least-privilege staging and production Firebase projects and
  service identities.
- [ ] Configure Functions secrets for Maps and PayMongo; configure server-only
  Vercel Admin variables; run `pnpm security:secrets` before release.
- [ ] Register Play Integrity/App Attest and reCAPTCHA Enterprise providers;
  confirm legitimate tokens in metrics.
- [ ] Enable and validate App Check enforcement for callable Functions,
  Firestore, and Storage in staging, then production.
- [ ] Configure exact production `WEB_ALLOWED_ORIGINS`, HTTPS payment return
  URLs, authorized Firebase domains, and restrictive Maps key/API quotas.
- [ ] Register the PayMongo webhook and prove valid, invalid, replayed,
  wrong-amount, and wrong-currency behavior with sandbox credentials.
- [ ] Validate a signed mobile release cannot use emulator/debug App Check and
  targets the production Firebase project.
- [ ] Run `pnpm phase4:verify` on a clean checkout with supported Node, pnpm,
  Java/Firebase Emulator, and Flutter versions.
- [ ] Inspect the Next.js production build for server-only/Admin credential
  separation and validate headers/CSP at the deployed edge.
- [ ] Configure log access, immutable audit retention/export, quota/budget
  alerts, invalid-signature/App Check/Auth/rate-limit alerts, and on-call owners.
- [ ] Complete a restore drill, incident exercise, and credential rotation drill.
- [ ] Review residual risks, privacy/retention obligations, and security sign-off
  before production traffic.

## Phase 4 completion checklist

Implementation state is distinguished from final acceptance:

- [x] Threat model, trust boundaries, role model, and authorization policy are
  documented.
- [x] Firestore and Storage deny-by-default policies and adversarial tests exist.
- [x] Flutter and browser App Check client policy plus callable enforcement and
  emulator bypass are implemented.
- [x] Next.js server session, route-role, CSRF/origin, redirect, CSP, and header
  controls are implemented with automated policy tests.
- [x] Payment creation/refund foundation and signed idempotent webhook processing
  are implemented with unit/rules/emulator tests.
- [x] Secret scanning, server-only secret boundaries, redacted structured
  security logging, persistent rate limiting, and idempotency controls exist.
- [x] The adversarial coverage manifest accounts for all 45 required scenarios.
- [x] The complete current `pnpm phase4:verify` command passes, including all
  Firestore/Storage/Auth/provider/payment/tooling/Hosting emulator suites.
- [ ] The added Flutter runtime security test passes on a functioning runner.
- [ ] All production enablement checklist items are completed and evidenced.

**Phase 4 final acceptance: not complete.** Repository implementation and the
full local suite pass, but production environment enablement and the remaining
FAIL rows in `phase-4-acceptance.md` are still required.

## Related policy documents

- [Authentication](domain/authentication.md)
- [App Check and web security](domain/app-check-and-web-security.md)
- [Cloud Functions security](domain/cloud-functions-security.md)
- [Storage foundation](domain/storage-foundation.md)
- [Payments](domain/payments.md)
- [Rate limiting and idempotency](domain/rate-limiting-and-idempotency.md)
- [Secret management](domain/secret-management.md)
- [Security logging and monitoring](security/security-logging-and-monitoring.md)
- [Flutter security](security/flutter-security.md)
- [Adversarial test matrix](security/adversarial-test-matrix.md)
- [Strict Phase 4 acceptance](phase-4-acceptance.md)
