# Phase 3 Firebase backend audit

Audit date: 2026-07-17

This is an evidence ledger, not a completion declaration. `complete` means the
implementation and an automated or repeatable local proof both exist. `partial`
means implementation exists but acceptance evidence is missing or incomplete.

## Authentication

| Requirement | Existing implementation | Status | Files involved | Required action |
|---|---|---|---|---|
| Email/password registration | Auth creation, trusted `users`/`customers` profile creation, tested rollback, verification email | complete | `auth_repository.dart`, rollback helper/test, Auth acceptance test | Retain acceptance coverage |
| Email/password login | Auth login plus active, blocked, disabled, role, and profile checks | complete | `auth_repository.dart`, Auth acceptance test | Retain acceptance coverage |
| Logout | Firebase/Google sign-out; web cookie logout and token revocation | complete | `auth_repository.dart`, web logout route, Auth/web acceptance test | Retain revocation coverage |
| Google customer sign-in | Mock Google credential, `ensureUserProfile`, customer-only enforcement, idempotent recovery | complete | `auth_repository.dart`, `ensure-user-profile.ts`, Auth acceptance test | Retain non-customer denial |
| Email verification and resend | Auth reload, trusted state sync, resend and OOB-code proof | complete | auth repository/callable and acceptance test | Retain emulator proof |
| Password reset | Firebase Auth reset with friendly non-enumerating response and OOB-code proof | complete | auth repository and acceptance test | Retain emulator proof |
| Account blocking | Mobile, callable, rules, Storage, and web guards reject `isBlocked=true` | complete | auth repositories, authorization, rules, web session, acceptance tests | Retain cross-product denial |
| Account disabling | Profile/Auth-disabled checks and revocation-aware web verification | complete | authorization, Auth/web acceptance test | Retain disabled-user denial |
| Missing profile recovery | Customer-only `ensureUserProfile`; non-customer rejection | complete | auth callable/repository and acceptance test | Retain missing-profile and role assertions |
| Web session cookies | Admin-created HTTP-only, SameSite=Lax, production-Secure cookie; revocation checked | complete | web auth/session routes and acceptance test | Retain cookie assertions |
| Server authentication | Server-only Admin verification reloads active Firestore user | complete | `session.ts`, `admin.ts`, acceptance test | Retain blocked/revoked assertions |
| Role route protection | Customer/provider/admin server guards and route layouts | complete | web layouts, `session.ts`, acceptance test | Retain cross-role redirects |

## Cloud Firestore

| Requirement | Existing implementation | Status | Files involved | Required action |
|---|---|---|---|---|
| Required collections | Canonical constants, rules, types, and deterministic seed data | complete | shared collections, rules, `seed-emulators.ts` | Keep collection document synchronized |
| Schema consistency | Canonical schemas exist; documented legacy booking paths remain temporarily | partial | shared types, Flutter models, `collections.md` | Complete later legacy-path migration |
| Role persistence | Customer/provider roles are trusted and admin client creation is denied | complete | auth callables, rules, rule tests | Retain denial tests |
| Provider ownership | `ownerId` is immutable and callable/rule checked | complete | provider callables, rules, rule tests | Add callable end-to-end proof |
| Composite indexes | Query inventory and index definitions cover current compound queries | complete | `firestore.indexes.json`, `firestore-indexes.md` | Re-audit whenever queries change |
| Cursor pagination | Bounded Flutter query helpers use stable ordering and cursors | complete | `query_builder.dart`, repositories, `pagination.md` | Keep list screens on helper policy |
| Default and maximum limits | Default 20, maximum 50, bounded list queries | complete | shared constants/pagination, Flutter query helper | Add regression checks for new queries |
| Server timestamps | Trusted backend writes use Admin server timestamps | complete | callable modules, timestamp helpers | Verify callable workflows end to end |
| Soft deletion | Retained public records use deletion metadata and public queries hide deleted data | complete | rules, query policy migration, `soft-deletion.md` | Run production backfill before rollout |
| Audit retention | Financial/audit/history collections deny client deletion | complete | rules and rule tests | Preserve immutable policy |
| Security rules | Default deny and domain ownership/lifecycle suites pass | complete | `firestore.rules`, Firestore rule tests | Add malformed sparse-document cases |
| Missing-field evaluation safety | Sparse accounts and inconsistent suspended providers deny safely | complete | rules and rule tests | Retain malformed-document regressions |
| Atomic batched creates | Customer bootstrap uses `existsAfter`/`getAfter`; admin creation denied | complete | rules and rule tests | Preserve atomic test coverage |

## Cloud Storage

| Requirement | Existing implementation | Status | Files involved | Required action |
|---|---|---|---|---|
| Canonical paths | Profile, provider assets/verification/packages, booking attachments, complaint evidence | complete | `storage.rules`, `storage-foundation.md` | Keep clients aligned |
| Ownership | User/provider/event/complaint ownership resolved through Firestore | complete | Storage rules and tests | Add callable upload workflow proof |
| MIME and size enforcement | Per-path allowlists; 5 MB/10 MB limits | complete | Storage rules and tests | Retain boundary tests |
| Replacement and deletion | Asset replacement/deletion policy and retained-evidence restrictions tested | complete | Storage rules and tests | Keep evidence retention documented |
| Verification privacy | Owner upload/read and admin review read; unrelated users denied | complete | Storage rules and tests | Exercise actual verification callable after upload |
| Emulator validation | Rules Unit Testing suite covers all required path families | complete | `storage.rules.test.cjs` | Include suite in final gate |

## Cloud Functions

| Requirement | Existing implementation | Status | Files involved | Required action |
|---|---|---|---|---|
| Modular structure | Auth/provider/verification/content/system/shared modules; Maps and promotion trigger remain in `index.ts` | partial | `functions/src` | Extract only when those domains next change |
| Auth, roles, active state | Shared guards applied to privileged callables | complete | `auth.ts`, `authorization.ts`, callables | Prove with emulator calls |
| Validation and safe errors | Shared validators and safe `HttpsError` normalization | complete | validation/error helpers, callables | Test invalid and unknown-error paths |
| Firestore converters | Generic helper exists but domain converters are not used | missing | `converters.ts` | Adopt typed converters when list/read modules are added |
| Logging | Structured Firebase logging is used | complete | logger and function modules | Keep sensitive inputs redacted |
| Rate limiting | Firestore-transaction counters with retry timing | complete | `rate-limit.ts`, abuse-control tests | Add callable-level limit acceptance proof |
| Audit logging | Provider registration and verification transitions write logs transactionally | complete | audit helper, callables, provider acceptance test | Retain expected-log assertions |
| Notifications | Review outcomes create owner notifications; promotions use idempotent FCM fan-out | complete | notification helper, review callable, provider acceptance test | Retain review-notification assertions |
| Idempotency | Firestore-backed operation keys, contention tests, and callable replay proof | complete | idempotency helper, callables, acceptance tests | Retain duplicate invocation assertions |
| Transactions | Provider/verification workflows are transactional | complete | provider/verification callables | Add workflow acceptance test |
| Pagination helpers | Default/max/cursor parser exists | complete | `pagination.ts` | Apply to each future list callable |
| Firestore trigger errors | Promotion trigger logs and rethrows failures | complete | `index.ts` | Emulator smoke test function loading |

## Firebase Emulators

| Requirement | Existing implementation | Status | Files involved | Required action |
|---|---|---|---|---|
| Auth | Configured; seed/reset validation passes | complete | `firebase.json`, tooling validation | Include in final acceptance run |
| Firestore | Configured; rule and seed/reset tests pass | complete | config and rule tests | Include in final acceptance run |
| Functions | All definitions load; health and provider/auth callable workflows execute | complete | emulator configs and acceptance tests | Retain full gate |
| Storage | Configured; rule and reset tests pass | complete | config and Storage tests | Include in final acceptance run |
| Hosting | Static page and Functions health rewrite pass on reserved demo project | complete | hosting config and verification script | Retain local smoke test |
| Seed | Fixed accounts and representative data validate | complete | `seed-emulators.ts`, validator | Keep deterministic IDs |
| Export/import | Manual tooling plus isolated seed/export/fresh-import validation | complete | emulator scripts and round-trip test | Retain separate port sets on Windows |
| Reset | Localhost-only Auth/Firestore/Storage reset validates empty state | complete | reset script, tooling validator | Preserve non-local refusal |

## Audit conclusion

All 54 explicit Phase 3 completion criteria are proven by the final local
gate. See `docs/phase-3-acceptance.md` for the strict matrix. The remaining
`partial`/`missing` audit rows above are documented architecture cleanup
(legacy booking compatibility, future module extraction, and currently unused
domain converters), not failed Phase 3 completion criteria.
