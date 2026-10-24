# Phase 4 security acceptance

Status date: 2026-07-17

Strict verdict: **FAIL - not production complete.**

The repository-local acceptance command passed on 2026-07-17:

```text
pnpm phase4:verify
Exit code: 0
Elapsed time: 463.3 seconds
```

That run proves the local builds, source-policy checks, secret scan, unit tests,
Firestore and Storage Rules Emulator tests, Auth/web/provider/payment emulator
flows, emulator data round trip, and Hosting validation. It does not prove
Firebase Console App Check enforcement or inspect a deployed production client
bundle. Those are explicit release blockers below; they are not skipped or
converted to documentation-only passes.

## Evidence legend

- **PASS** - exercised by the current local suite or directly verified from a
  deterministic repository artifact.
- **FAIL** - required production/staging evidence is absent or the exact
  acceptance behavior has not been exercised.

## Firestore

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Every collection has explicit protection or default deny | PASS | Explicit collection matches plus final recursive deny in `firebase/firestore.rules`; Rules suite passed. |
| Rules tests pass | PASS | `emulator:test` passed inside `phase4:verify`. |
| Unauthorized reads denied | PASS | Rules tests use explicit denial assertions for cross-owner, private, admin, booking, verification, and inactive-provider reads. |
| Unauthorized writes denied | PASS | Rules tests explicitly deny protected and unrelated writes. |
| Blocked users denied | PASS | Shared active-user Rules predicate and blocked-user assertions passed. |
| Role escalation denied | PASS | User role/account trusted-field mutation assertions passed. |
| Provider self-approval denied | PASS | Provider verification/provider lifecycle write assertions passed. |
| Client payment status changes denied | PASS | Canonical payment create/update/delete denial assertions passed. |
| Backend-controlled fields protected | PASS | Rules protect ownership, role, block/account, verification, lifecycle, payment, audit, history, rate-limit, and idempotency fields/collections. |

## Storage

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Ownership enforced | PASS | Profile/provider/booking/complaint ownership tests passed. |
| MIME types enforced | PASS | Explicit MIME allowlists and invalid-MIME denial tests passed. |
| File sizes enforced | PASS | Per-path limits and oversized denial tests passed. |
| Folder paths enforced | PASS | Exact path matches, provider document type segment, and fallback deny passed. |
| Verification documents private | PASS | Owner/admin policy with customer/other-provider denial tests passed. |
| Unauthorized reads denied | PASS | Private verification, booking, complaint, and profile denial assertions passed. |
| Unauthorized writes denied | PASS | Cross-owner and unrelated participant writes were denied. |
| Executable/unknown files denied | PASS | Explicit extension/MIME allowlists omit executable, HTML, script, archive, and generic binary formats; invalid-type tests passed. |

Storage Rules validate metadata and extension, not file bytes. Malware/content
scanning remains a documented residual risk rather than an omitted Rules test.

## App Check

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Flutter configured | PASS | Debug-only provider and release Play Integrity/App Attest policy pass the Flutter security validator. |
| Web configured where supported | PASS | Browser-only singleton reCAPTCHA Enterprise initialization and SSR boundary pass source tests. |
| Firestore enforcement validated | **FAIL** | Enforcement is Firebase project configuration. No staging/production evidence proves a valid attested request is accepted and a missing-token request is denied. |
| Storage enforcement validated | **FAIL** | Enforcement is Firebase project configuration. No staging/production valid/missing-token test evidence exists. |
| Callable Functions enforcement validated | **FAIL** | Source policy proves deployed options request enforcement and emulators bypass it, but no deployed callable test proves valid-token acceptance and missing-token denial. |
| Emulator/debug workflow documented | PASS | Documented in `domain/app-check-and-web-security.md` and `phase-4-security-architecture.md`. |
| Production rollout documented | PASS | Metrics-first rollout and rollback sequence are documented. |

## Next.js

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| ID tokens verified server-side | PASS | Session route uses Admin SDK verification with revocation/recent-auth checks. |
| Secure HTTP-only session cookies | PASS | Cookie-policy tests verify HTTP-only, SameSite, path, max age, and production Secure behavior. |
| Admin routes server-protected | PASS | Admin layout uses exact server role guard; wrong-role tests passed. |
| Provider routes server-protected | PASS | Provider layout uses exact server role guard; wrong-role tests passed. |
| Customer protected routes server-protected | PASS | Customer layout uses exact server role guard; wrong-role tests passed. |
| Revoked sessions denied | PASS | Revocation-aware verification and Auth/web emulator logout test passed. |
| Disabled/blocked users denied | PASS | Trusted Auth/profile state tests passed. |
| CSRF protection passes | PASS | Double-submit token rejection/acceptance tests passed. |
| Origin validation passes | PASS | Exact allowlist and disallowed/missing-origin tests passed. |
| CSP enabled | PASS | Header policy test verifies CSP and unexpected-origin restrictions. |
| Security headers enabled | PASS | Next.js configuration emits CSP, nosniff, referrer, permissions, frame, cross-origin, and production HSTS policies. |
| Open redirects denied | PASS | External, protocol-relative, slash/backslash, and control-character cases are rejected by policy tests. |
| Admin SDK absent from client bundle | **FAIL** | Server-only markers and source-import tests pass, but a production client-bundle artifact was not built and inspected in this acceptance run. |

## Payments

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Payment updates backend-only | PASS | Rules deny all canonical client writes; backend integration tests passed. |
| Webhook signature verified | PASS | Raw-body timestamped HMAC and invalid-signature unit tests passed. |
| Replay protection passes | PASS | Duplicate provider event produces no duplicate effect in emulator integration. |
| Idempotency passes | PASS | Deterministic checkout/payment IDs and webhook event IDs are tested. |
| Amount/currency validated | PASS | Wrong amount and wrong currency denial tests passed. |
| Refund authorization backend/admin only | PASS | Active-admin callable contract and client write denial are tested. |
| Audit history preserved | PASS | Client writes/deletes are denied and payment transitions transactionally create audit/event history. |

## Secrets

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| No committed private secrets | PASS | Current repository pattern scan passed; approved findings are public Firebase client config or fixed emulator credentials. |
| Functions secrets documented | PASS | Maps, PayMongo, and webhook secret setup is documented with placeholders. |
| Vercel variables documented | PASS | Browser-safe versus server-only variables are documented in web example/domain docs. |
| Local env files ignored | PASS | Root, Functions, and web ignore policies are covered by secret scanning. |
| Rotation procedure documented | PASS | Rotation and compromise response are in the security architecture and secret-management policy. |
| Secret scan passes | PASS | `security:secrets` passed inside the exact acceptance command. |

Pattern scanning cannot mathematically prove that no unknown-format credential
exists, but it is the defined deterministic repository acceptance control.

## Testing

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Firestore security tests pass | PASS | Emulator Rules suite passed. |
| Storage security tests pass | PASS | Emulator Rules suite passed. |
| Route-role tests pass | PASS | Web policy and Auth/web emulator suites passed. |
| CSRF/origin tests pass | PASS | Web security tests and Auth/web emulator mutation tests passed. |
| App Check validation passes | **FAIL** | Local configuration/emulator-bypass policy passes; deployed Firestore, Storage, and callable enforcement behavior is untested. |
| Payment/webhook security tests pass | PASS | Unit, Rules, and payment emulator integration suites passed. |
| Rate-limit tests pass | PASS | Transactional limiter unit/integration behavior passed. |
| Replay tests pass | PASS | Callable/provider/payment/notification idempotency evidence passed. |
| Secret scan passes | PASS | Included in and passed by `phase4:verify`. |
| Phase 3 regression tests still pass | PASS | Full `phase3:verify` completed within `phase4:verify`. |
| `pnpm phase4:verify` passes | PASS | Exit 0 on 2026-07-17 in 463.3 seconds. |

## Final release gates

| Gate | Verdict | Reason |
| --- | --- | --- |
| All critical and high-risk findings fixed | **FAIL** | Deployed App Check enforcement is an unresolved high-risk production-enablement control. |
| No skipped security acceptance criteria | **FAIL** | App Check product enforcement and production bundle inspection remain unproven. |
| No untested privileged path | **FAIL** | Deployed callable App Check rejection and a production PayMongo refund/gateway path have not been exercised with staging services. |
| No unresolved critical/high blockers | **FAIL** | Firestore, Storage, and callable App Check enforcement validation remains a high release blocker. |

## Required evidence to change the verdict to PASS

1. In a staging Firebase project, enable App Check enforcement for Firestore,
   Storage, and callable Functions. Record valid-token acceptance and
   missing/invalid-token denial for each product, while proving the emulator
   workflow remains usable.
2. Produce a Next.js production build and inspect its client artifacts/source
   maps or build analyzer output to prove Firebase Admin and server credentials
   are absent.
3. Exercise the privileged refund and webhook flow against PayMongo sandbox
   using environment-owned test secrets, including invalid signature, replay,
   amount/currency mismatch, successful confirmation, and audit evidence.
4. Rerun `pnpm phase4:verify` on the release commit and attach the command output
   to the release record.
5. Re-evaluate every FAIL row here; Phase 4 is complete only when none remain.

