# Security logging and monitoring

## Event contract

Application security logs use `eventType=security_event`, `action`, `outcome`,
`actorUid`, `targetId`, `reasonCode`, and `correlationId`. Metadata is limited to
bounded identifiers, status names, retry timing, and policy values. Request IDs
are accepted only from a conservative character/length allowlist; otherwise a
UUID is generated.

The shared logger recursively redacts authorization, cookie, password, secret,
token, API-key, private-key, and signature fields plus credential-shaped text.
Do not add raw request bodies, ID tokens, session cookies, authorization
headers, passwords, webhook signatures, payment payloads, verification paths,
emails, or phone numbers to event metadata. When contact information is truly
needed, use `maskEmail` or `maskPhone`.

## Signals

| Signal | Source |
| --- | --- |
| Failed login patterns | Firebase Authentication / Identity Platform audit and quota logs; web session-exchange denials use `session_creation` |
| Blocked/disabled access | Functions and Next.js `account_access_denied` |
| Unauthorized role | Functions and Next.js `role_access_denied` |
| Verification submission/decision | `provider_verification_submission` and `provider_verification_decision`; immutable decision audit remains in `adminLogs` |
| Account block/unblock | `onUserSecurityStateChanged` Auth-context trigger and deterministic immutable `adminLogs` record |
| Webhook failure/signature/replay | `payment_webhook` with failed, denied, or replayed outcome |
| Callable replay | `idempotency_replay` |
| Rate limiting | `rate_limit_rejected` with retry seconds but no raw IP |
| App Check rejection | Firebase Functions platform App Check metrics/logs; rejection occurs before callable code runs |
| Missing secrets/config | `configuration_failure` without the configured value |

The account trigger uses the Firestore event ID as both its correlation key and
deterministic admin-log key, making retries safe. Firestore Rules prohibit all
client writes to `adminLogs`; financial, verification, and account-security
audit history must never be deleted by application clients.

## Monitoring policy

Create log-based counters and alerts for invalid webhook signatures, repeated
blocked-account access, role denials, rate-limit rejection bursts, App Check
invalid/missing-token metrics, repeated session creation failures, and missing
configuration. Aggregate failed logins by Firebase-provided privacy-safe
dimensions; do not copy email addresses into application logs. Suggested alert
windows are five minutes for webhook/configuration failures and fifteen minutes
for authentication, authorization, and rate-limit anomalies.

Restrict log and `adminLogs` access to operational administrators. Configure
retention under the project security/compliance policy, export immutable audit
records where legally required, and test alert delivery in staging. Never use
production user credentials to generate monitoring tests.
