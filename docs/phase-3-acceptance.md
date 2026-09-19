# Phase 3 acceptance evidence

Acceptance date: 2026-07-17

Final gate:

```powershell
pnpm phase3:verify
```

Result: **PASS** (exit code 0, 246.6 seconds). All Firebase integration
tests use `demo-feasta-phase3` and isolated local emulator ports.

## Authentication

| Criterion | Verdict | Evidence |
|---|---|---|
| Email/password customer registration | PASS | Auth Emulator account plus `ensureUserProfile`; role/profile assertions |
| Google customer sign-in | PASS | Mock Google credential through Auth Emulator; customer-only callable assertions |
| Email verification flow | PASS | Emulator OOB verification code, Auth reload, trusted profile sync |
| Password reset flow | PASS | Emulator OOB reset code and sign-in with replacement password |
| Blocked account rejected | PASS | Callable and web-session rejection assertions |
| Disabled account rejected | PASS | Disabled Auth Emulator user cannot sign in |
| Web session cookie flow | PASS | Session creation, HTTP-only/SameSite cookie, logout and revocation assertions |
| Route-role protection | PASS | Customer/admin success and cross-role redirect assertions |

Customer profile failure rollback has three Flutter unit tests, including the
case where Auth deletion itself fails. Friendly mobile error mapping remains
covered by Flutter analysis and direct implementation inspection.

## Firestore

| Criterion | Verdict | Evidence |
|---|---|---|
| Required collections exist | PASS | Deterministic seed and collection/schema ledger |
| Roles stored correctly | PASS | Customer/provider workflow assertions plus rules tests |
| Security rules tests pass | PASS | Firestore Rules Unit Testing suite |
| Composite indexes match current queries | PASS | Query inventory and `query-policy.test.cjs` |
| Cursor pagination policy used | PASS | Stable document-ID ordering/cursor regression test |
| Query limits enforced | PASS | Default 20, maximum 50 regression test and bounded Flutter reads |
| Server timestamps used | PASS | Callable workflow resolves Admin server timestamps on created records |
| Soft deletion implemented | PASS | Provider visibility/delete rules and emulator tests |

## Storage

| Criterion | Verdict | Evidence |
|---|---|---|
| Customer profile upload | PASS | Authenticated client workflow and Storage rules suite |
| Provider logo upload | PASS | Authenticated provider workflow |
| Provider cover upload | PASS | Authenticated provider workflow |
| Provider verification upload | PASS | Required PDF objects uploaded by provider owner |
| Invalid type rejected | PASS | Client workflow and Storage rules suite |
| Oversized upload rejected | PASS | Client workflow and Storage rules suite |
| Unauthorized user rejected | PASS | Cross-owner/customer rules assertions |
| Sensitive documents private | PASS | Owner/admin reads allowed; unrelated customer/provider denied |

## Cloud Functions

| Criterion | Verdict | Evidence |
|---|---|---|
| TypeScript build | PASS | `pnpm --dir functions build` |
| Functions load in emulator | PASS | Functions discovery/load in acceptance and Hosting runs |
| `healthCheck` executes | PASS | Direct Functions request and Hosting rewrite request |
| `registerProvider` | PASS | Real callable creation, existing-link, and replay assertions |
| `registerVerificationDocument` | PASS | Real Storage metadata validation for both required documents |
| `submitProviderVerification` | PASS | Real callable transition plus replay assertions |
| `reviewProviderVerification` | PASS | Start-review and approval transition assertions |
| Audit logs written | PASS | Workflow queries and counts transactional logs |
| Notifications created | PASS | Workflow queries provider-owner notifications |
| Idempotency behavior | PASS | Utility contention tests and duplicate callable replay assertions |
| Rate limiting behavior | PASS | Atomic utility test and callable-level exhaustion/retry assertion |

## Emulators

| Criterion | Verdict | Evidence |
|---|---|---|
| Auth runs | PASS | Auth/web, provider, seed/reset, and round-trip suites |
| Firestore runs | PASS | Rules and all integration suites |
| Functions run | PASS | Auth/web, provider, and Hosting suites |
| Storage runs | PASS | Rules, provider, reset, and round-trip suites |
| Hosting locally validated | PASS | Static page plus Functions rewrite smoke test |
| Seed succeeds | PASS | Deterministic seed validation |
| Export succeeds | PASS | Export-on-exit metadata and data creation |
| Reset succeeds | PASS | Empty Auth/Firestore/Storage assertions |
| Import succeeds | PASS | Fresh-port import and seeded-state validation |

## Final acceptance

| Criterion | Verdict | Evidence |
|---|---|---|
| Test customer can register | PASS | Auth/web acceptance suite |
| Test provider can register | PASS | Provider workflow suite |
| Provider role stored | PASS | `users/{uid}` assertion |
| Provider starts inactive and draft | PASS | Provider/verification assertions |
| Verification documents upload | PASS | Required Storage objects and metadata assertions |
| Provider submits verification | PASS | Status transition assertions |
| Admin approves provider | PASS | Admin callable assertions |
| Provider becomes approved and active | PASS | Provider and verification post-transaction assertions |
| Repeated calls create no duplicates | PASS | Registration/submission/review replay and existing-link assertions |
| All verification commands pass | PASS | `pnpm phase3:verify` exit code 0 |

## Verdict

**54 of 54 completion criteria pass: 100%. Phase 3 completion verdict: PASS.**

Flutter analysis still reports legacy nonfatal style/deprecation warnings. It
reports no analyzer errors, and warnings remain documented cleanup rather than
a Phase 3 backend blocker.
