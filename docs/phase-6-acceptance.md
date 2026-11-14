# Phase 6 authentication acceptance

## Verification command

Run from the repository root:

```text
pnpm phase6:verify
```

The command is fail-fast and preserves each child command's output for
diagnosis. It composes existing suites instead of copying their test lists:

1. `pnpm phase6:coverage` validates this 52-row evidence contract.
2. `pnpm --dir packages/shared-types test` builds shared types and runs the
   shared authentication model tests.
3. `pnpm phase5:verify` runs the complete Phase 5 suite, which already composes
   the Phase 3 regression suite and Phase 4 local security suite. Those suites
   include Functions, web, Flutter, Rules, emulator tooling, authentication,
   provider, payment, export/import, and hosting verification.
4. The Phase 6 wrapper snapshots listeners on dedicated verification ports and
   performs verification cleanup for any new process that survives a child
   command. Existing emulator wrappers also close Firebase clients, stop the
   temporary Next.js process, and remove orphaned Firestore listeners.

This composition intentionally avoids rerunning Phase 3, Phase 4, Phase 5,
Flutter, and emulator suites as separate duplicate steps.

## Flutter diagnostic policy

Flutter analyzer errors are always fatal. The repository's known legacy
warning/info ceiling is 53 diagnostics. The verification script prints the
current count and fails if the total rises above 53. A reduction is accepted;
this detects a net regression where practical without treating the established
warning baseline as errors.

The scoped format check covers Phase 5/6 shared UI, representative migrated
screens, and their tests. The complete Flutter test suite supplies
authentication unit, router, widget, semantics, responsive, and runtime
security coverage.

## Criterion evidence

"Phase 5 composition" means the evidence is reached once through
`phase5:verify`; it is not executed again by Phase 6.

| # | Mandatory criterion | Evidence executed by `phase6:verify` | Result |
| ---: | --- | --- | --- |
| 1 | Shared-types build | `packages/shared-types test` builds before testing; Phase 5 composition also builds it | PASS — exact local run |
| 2 | Shared authentication type tests | `packages/shared-types/test/authentication.test.mjs` | PASS — exact local run |
| 3 | Functions build | Phase 5 composition -> Phase 3 -> `functions build` and `functions test` | PASS — exact local run |
| 4 | Functions lint | Phase 5 composition -> Phase 3 -> `functions lint` | PASS — exact local run |
| 5 | Authentication callable tests | `functions test`, security contracts, and Auth emulator workflow | PASS — exact local run |
| 6 | Account-state helper tests | `functions/test/account-state.test.cjs` and shared/web account policy tests | PASS — exact local run |
| 7 | Firestore Rules tests | Phase 3 `emulator:test` | PASS — exact local run |
| 8 | Storage Rules regressions | Phase 3 `emulator:test` | PASS — exact local run |
| 9 | Customer registration rollback tests | Flutter `registration_rollback_test.dart` and Auth emulator workflow | PASS — exact local run |
| 10 | Customer profile recovery tests | Auth emulator deterministic missing-profile and repair workflows | PASS — exact local run |
| 11 | Email/password authentication tests | Flutter authentication tests, web components/contracts, Auth emulator | PASS — exact local run |
| 12 | Mocked Google authentication tests | Auth emulator mocked Google customer workflow | PASS — exact local run |
| 13 | Email verification tests | Flutter recovery tests, web verification components, Auth emulator | PASS — exact local run |
| 14 | Password reset tests | Flutter recovery tests, web authentication tests, Auth emulator | PASS — exact local run |
| 15 | Phone verification and booking-gate tests | Flutter phone tests, `phone-booking-security.test.cjs`, Auth emulator | PASS — exact local run |
| 16 | Provider registration tests | Functions tests and `emulator:provider-workflow:test` | PASS — exact local run |
| 17 | Provider lifecycle gate tests | Shared/web provider policy tests and Auth/provider emulators | PASS — exact local run |
| 18 | Admin login/role tests | Web admin contracts/components/security tests and Auth emulator | PASS — exact local run |
| 19 | Secure session-cookie tests | Web security/account-policy tests and Auth/Web integration | PASS — exact local run |
| 20 | Route-role tests | Web customer/provider/admin contracts, layouts, and integration workflow | PASS — exact local run |
| 21 | Session expiration tests | Web security tests, Flutter gate/controller tests, Auth emulator | PASS — exact local run |
| 22 | Session revocation tests | Web session tests and Auth emulator revocation workflow | PASS — exact local run |
| 23 | Blocked/disabled/deactivated tests | Shared gate matrix, web/Flutter policy tests, deterministic fixtures | PASS — exact local run |
| 24 | Account-management tests | Functions customer/role account tests plus web/Flutter component tests | PASS — exact local run |
| 25 | Update-email tests | Auth synchronization Functions tests, web/Flutter account tests, emulator | PASS — exact local run |
| 26 | Change-password tests | Web/Flutter account tests and Auth emulator password-change workflow | PASS — exact local run |
| 27 | Logout current/all session tests | Web/Flutter account tests and Auth emulator logout/revocation workflows | PASS — exact local run |
| 28 | CSRF/origin tests | `apps/web/test/security-policy.test.mts`, abuse regression, Auth integration | PASS — exact local run |
| 29 | Rate-limit tests | Functions abuse controls, web abuse regression, emulator workflows | PASS — exact local run |
| 30 | Safe redirect/deep-link tests | Web security/customer contracts and Flutter router/recovery tests | PASS — exact local run |
| 31 | Web lint | Phase 5 composition | PASS — exact local run |
| 32 | Web typecheck | Phase 5 composition | PASS — exact local run |
| 33 | Web component tests | Phase 5 composition -> `test:components` | PASS — exact local run |
| 34 | Web authentication integration tests | Phase 3 `emulator:auth-web:test` | PASS — exact local run |
| 35 | Web accessibility tests | Phase 5 composition -> `test:accessibility` | PASS — exact local run |
| 36 | Web responsive tests | Phase 5 composition -> `test:responsive` | PASS — exact local run |
| 37 | Production Next.js build | Phase 5 composition -> `apps/web build` | PASS — exact local run |
| 38 | Admin SDK client-bundle regression check | Web security contract plus successful production client/server build boundary | PASS — exact local run |
| 39 | Flutter scoped format check | `scripts/verify-flutter-phase5.ps1` | PASS — exact local run |
| 40 | Flutter analysis | Error-fatal analysis with 53-diagnostic ceiling | PASS — exact local run |
| 41 | Flutter authentication unit tests | Complete Flutter suite under Phase 5 composition | PASS — exact local run |
| 42 | Flutter router tests | `customer_route_guard_test.dart` in complete Flutter suite | PASS — exact local run |
| 43 | Flutter widget tests | Complete Flutter suite | PASS — exact local run |
| 44 | Flutter semantics tests | Shared primitives and authentication accessibility widget tests | PASS — exact local run |
| 45 | Flutter responsive tests | Responsive and authentication large-text matrices | PASS — exact local run |
| 46 | Emulator seed/reset validation | Phase 3 `emulator:tooling:test` seeds twice, targeted-cleans, and full-resets | PASS — exact local run |
| 47 | Emulator end-to-end authentication workflows | Phase 3 `emulator:auth-web:test` and provider workflow | PASS — exact local run |
| 48 | Secret scan | Phase 3 `security:secrets` | PASS — exact local run |
| 49 | Phase 3 regression suite | Invoked once by Phase 5 composition | PASS — exact local run |
| 50 | Phase 4 local security suite | Invoked once by Phase 5 composition | PASS — exact local run |
| 51 | Phase 5 design-system suite | `phase5:verify` | PASS — exact local run |
| 52 | Verification cleanup | Child finalizers plus Phase 6 new-listener cleanup guard | PASS — exact local run |

## Local versus deployed acceptance

Deployment-dependent Phase 4 App Check proof is not required for local PASS.
The local suite validates client configuration, callable policy, Rules,
emulator behavior, and security contracts without contacting production.

The following remain production release gates even after a successful local
Phase 6 command:

- deployed Flutter and web App Check token/enforcement evidence;
- deployed Firestore, Storage, and callable enforcement evidence;
- staged legitimate-traffic metrics and rollback validation;
- production Next.js bundle evidence from the target deployment environment.

These gates remain documented in
`docs/phase-6-authentication-account-lifecycle.md` and must not be reported as
complete from local emulator results.

## Acceptance status

The final strict `pnpm phase6:verify` run exited with code `0` on 2026-07-25
in 426.6 seconds.
All 52 mandatory local evidence rows passed in one uninterrupted run. The
Flutter analyzer reported 50 diagnostics against the allowed legacy ceiling of
53, with no analyzer error. Final listener inspection found every dedicated
Firestore and Functions test port clear.

The Phase 6.20 strict local acceptance verdict is **PASS**. It does not close the
deployment-dependent Phase 4 App Check and production bundle gates listed
above.
