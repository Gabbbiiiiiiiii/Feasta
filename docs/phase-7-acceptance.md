# Phase 7 provider onboarding and verification acceptance

## Verification command

Run from the repository root:

```text
pnpm phase7:verify
```

The command is fail-fast. It runs the Phase 7 evidence guard and then invokes
`phase6:verify` once. Phase 6 composition already includes Phase 3-5,
shared-types, Functions, web, Flutter, Firestore Rules, Storage Rules, secret
scanning, production build, and all emulator workflows. This avoids duplicating
large suites while preserving every earlier regression gate.

The provider workflow specifically proves that an owner can save and recover a
draft, register, verify email, complete onboarding, upload and register private
documents, submit, receive an authorized admin decision, and become publicly
discoverable only after approval. It proves that an unapproved provider cannot
publish, receive bookings, or create payments, and that rejected or suspended
providers remain hidden.

No privileged path is skipped. Static authorization contracts, Rules tests,
server-route tests, callable tests, and emulator operations cover independent
layers of each privileged workflow.

## Criterion evidence

| # | Mandatory criterion | Executed evidence | Result |
| ---: | --- | --- | --- |
| 1 | Shared provider types | Shared-types build/test and provider parser matrix | PASS |
| 2 | Onboarding schema | Shared provider schema tests, backend model tests, Flutter parser tests | PASS |
| 3 | Provider forms | Web provider onboarding component and flow tests | PASS |
| 4 | Draft saving and recovery | Draft callable contracts, server routing tests, emulator workflow | PASS |
| 5 | Image uploads | Storage Rules and onboarding media validation tests | PASS |
| 6 | Verification-document security | Storage Rules, document callable, secure-viewer, and emulator privacy tests | PASS |
| 7 | Required-document rules | Dynamic policy unit tests and submission/review emulator checks | PASS |
| 8 | Submission transitions | Lifecycle matrix, submission replay tests, emulator submission | PASS |
| 9 | Provider status gates | Web server account policy, status routes, stale-session tests | PASS |
| 10 | Unapproved-provider restrictions | Functions/web adversarial contracts and Rules enforcement | PASS |
| 11 | Draft-package permissions | Firestore allow/deny tests and server package guard | PASS |
| 12 | Public visibility rules | Visibility helper matrix, Rules queries, provider emulator discovery | PASS |
| 13 | Booking restrictions | Booking callable contract, phone/booking security, unapproved-provider tests | PASS |
| 14 | Payment restrictions | Payment callable owner/approval checks, Rules, payment regressions | PASS |
| 15 | Admin queue | Admin-only loader/route and queue component tests | PASS |
| 16 | Search, filters, and pagination | Queue query/index tests, bounded search, cursor tests | PASS |
| 17 | Document viewer authorization | Secure provider-file route and admin-role tests | PASS |
| 18 | Approve/reject/resubmission/suspend | Review transition, race, replay, role, and emulator branch tests | PASS |
| 19 | History, audit logs, and notifications | Immutable history contracts and emulator record assertions | PASS |
| 20 | Role and ownership enforcement | Functions authorization, server guards, Firestore/Storage Rules | PASS |
| 21 | Accessibility and responsive tests | Phase 6 composition -> Phase 5 web and Flutter accessibility/responsive suites | PASS |
| 22 | Flutter regression | Phase 6 composition -> complete Phase 5 Flutter verification | PASS |
| 23 | Web lint/typecheck/build | Phase 6 composition -> Phase 5 web lint, typecheck, and production build | PASS |
| 24 | Functions build/lint/tests | Phase 6 composition -> Phase 3 Functions verification | PASS |
| 25 | Firestore Rules | Phase 6 composition -> Phase 3 Rules suite plus provider workflow allow/deny assertions | PASS |
| 26 | Storage Rules | Phase 6 composition -> Phase 3 Storage suite plus private-document emulator assertions | PASS |
| 27 | Emulator end-to-end workflow | `emulator:provider-workflow:test` through Phase 3 composition | PASS |
| 28 | Secret scan | Phase 6 composition -> Phase 3 `security:secrets` | PASS |
| 29 | Phase 3-5 regressions | Phase 6 composition -> Phase 5 -> Phase 3 and Phase 4 local | PASS |
| 30 | Phase 6 regression | Direct `phase6:verify` composition | PASS |
| 31 | Verification cleanup | Existing suite finalizers plus Phase 6 and Phase 7 listener audits | PASS |

## Strict acceptance outcomes

| Outcome | Evidence | Result |
| --- | --- | --- |
| Provider completes and submits onboarding | Provider emulator workflow and callable tests | PASS |
| Admin makes authorized decisions | Active-admin callable and server-route tests | PASS |
| Approved provider becomes publicly discoverable | Public provider/package emulator queries | PASS |
| Unapproved, rejected, and suspended providers remain hidden | Rules, visibility matrix, and emulator branches | PASS |
| Unapproved provider cannot receive bookings or payments | Callable authorization, Rules, and adversarial tests | PASS |
| No critical or high blockers remain | Security regressions and acceptance review | PASS |
| No mandatory criterion is skipped | 31-row evidence inventory and executable coverage guard | PASS |
| No privileged path is untested | Functions, server, Rules, and emulator layers | PASS |

## Local and deployment-dependent status

Deployment-dependent Phase 4 App Check proof is not required for local Phase 7
PASS. The following remain production release gates:

- deployed Flutter and web App Check token evidence;
- deployed Firestore, Storage, and callable enforcement validation;
- staged legitimate-traffic metrics and rollback validation;
- production Next.js bundle evidence from the target deployment environment;
- deployment of required Firestore composite indexes.

These gates must remain open until validated in the target environments.

## Final run

The strict final run completed on 2026-07-28:

| Command | Exit code | Duration | Result |
| --- | ---: | ---: | --- |
| `pnpm phase7:verify` | 0 | 677.5 seconds (11m 17.5s) | PASS |

The run recorded 31/31 Phase 7 evidence criteria, 52/52 Phase 6 evidence
criteria, 17/17 shared authentication/provider tests, 104/104 web component
tests, 39/39 web accessibility tests, 49/49 web responsive tests, and 138/138
Flutter tests. Functions, Firestore Rules, Storage Rules, security, payment,
provider, authentication/web, seed/reset/export/import, hosting, and production
web-build workflows also passed. Final cleanup left no dedicated emulator
listener behind.
