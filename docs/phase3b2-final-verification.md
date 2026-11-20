# Phase 3B.2 final verification

Date: 2026-11-09 (Asia/Manila). Branch: `chore/monorepo-setup`.
HEAD: `5c4a97a19cb399613872039e9809fd65d63e4401`.

## Changes

- `apps/web/test/components/provider-setup-gallery-v2-transaction.test.cjs`: fixed the offline VM's missing maintenance dependency by executing the production maintenance helper against the simulated database. Added the maintenance document, transactional update support, and correct commit routing for admission and gallery writes. Preserved existing authorization, policy, media, revision, race, disabled-gate, and fail-closed assertions. Added atomic admission, malformed/paused/missing maintenance, and concurrent maintenance pause coverage.
- `scripts/verify-flutter-security.mjs`: replaced the obsolete `_StartupFailureApp` name check with checks for `StartupShell` bootstrap wiring, initialization timeout, success/failure state transitions, and failure-first rendering before the app builder is available. Existing authentication and App Check source assertions remain.
- `apps/web/test/components/provider-eligibility-rules-contract.test.cjs`: replaced an obsolete ban on the entire capability module with an AST check permitting exactly the initialization export and rejecting wildcard, additional, or aliased mutation exports. Direct client category mutation denial remains asserted.
- This report.

All accumulated local changes were retained. No production implementation, mobile redesign/navigation, maintenance contract, feature gate, or Firebase data was changed by this task. No commit, push, deployment, or emulator run was performed. The completed publication/customer compatibility audit was not repeated.

## Diagnosis and baseline evidence

The original gallery harness reproduced **1 pass / 35 fail** across 36 tests. Each fixture-loading failure was `Unexpected module import: @/lib/firebase/maintenance`. Both the original harness and the production writer/maintenance files matched HEAD before the fixture fix. All 36 existing tests subsequently passed; the expanded harness passes 39 tests.

The obsolete Flutter source assertion expected `_StartupFailureApp`, while HEAD already uses `StartupShell`. The shell awaits initialization with a 45-second timeout, constructs the application only after success, and renders restart guidance after failure. Existing runtime tests verify pending Firebase/App Check, initialization errors, timeout including late completion, authentication restoration failures, and blocked-account session termination. Production startup files match HEAD.

The additional Web contract harness initially reported **50 pass / 1 fail**. The eligibility contract reproduced individually as **7 pass / 1 fail**. Its test, `functions/src/index.ts`, and capability implementation all match HEAD, establishing a pre-existing source-test defect: HEAD exports the protected absence-only initialization callable while ordinary capability updates remain unexported. The corrected assertion checks that exact export boundary. The complete Web CommonJS contract harness now passes 51 tests.

## Verification

| Check | Pass | Fail | Notes |
| --- | ---: | ---: | --- |
| Functions offline tests | 2,935 | 0 | Concurrency 2; no skipped/cancelled/todo tests |
| Shared-contract tests | 50 | 0 | Concurrency 2; no skipped/cancelled/todo tests |
| Web security tests | 152 | 0 | Concurrency 2; no skipped/cancelled/todo tests |
| Web CommonJS contract tests | 51 | 0 | Concurrency 1; includes the 39-test gallery harness |
| Flutter security/startup/authentication runtime tests | 67 | 0 | Concurrency 1; selected relevant files below |
| Flutter security source checker | 1 run | 0 | Updated actual startup contract |
| Functions TypeScript compilation | 1 run | 0 | Installed `tsc` |
| Shared-types build | 1 run | 0 | Installed `tsc -p tsconfig.json` |
| Web typecheck | 1 run | 0 | `tsc --noEmit` |
| Web production build | 1 run | 0 | Next.js build; 74/74 static pages generated |
| Flutter analysis | 1 run | 0 | No issues found |
| Functions lint | 1 run | 0 | 751 warnings, zero errors |
| Web lint | 1 run | 0 | 2 existing unused-disable warnings, zero errors; changed CJS files also checked |
| Isolated Functions deployment runtime packaging | 1 run | 0 | Confirmed exit 0; installs in temporary directory and loads packaged runtime; no deployment |
| Secret scan | 1 run | 0 | Passed |
| Phase 4 security coverage manifest | 45 scenarios | 0 | Source coverage manifest validation |
| Full Web Vitest component suite | Pending | Pending | One thread worker; full run in progress |

Principal commands (run from the corresponding package unless paths are explicit):

```text
node --test --test-concurrency=2 functions/test/*.test.cjs
node --test --test-concurrency=2 test/*.test.mjs
node --experimental-strip-types --test --test-concurrency=2 test/*.test.mts
node --test --test-concurrency=1 apps/web/test/components/*.test.cjs
vitest run --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=verbose
flutter test --no-pub --concurrency=1 test/security test/core/security test/features/splash/startup_shell_test.dart test/features/splash/startup_auth_handoff_test.dart test/features/authentication/authentication_restoration_test.dart test/features/authentication/authentication_gate_widget_test.dart test/features/authentication/auth_guard_bootstrap_test.dart test/features/authentication/customer_auth_controller_test.dart
flutter analyze --no-pub
node scripts/verify-flutter-security.mjs
pnpm.cmd --config.verifyDepsBeforeRun=false run test:deployment-runtime
```

## Interrupted attempts and environment limitations

- The initial pnpm commands attempted dependency reinstallation and aborted before tests because there was no TTY. Installed tool binaries were used instead, preserving the dependency layout.
- Two sandboxed full Web Vitest attempts (fork and thread pools, file parallelism disabled) stalled after the runner banner without reporting test results; both were interrupted. A single-file thread probe passed 4/4. The replacement full suite runs with normal process permissions and one thread worker.
- The initial sandboxed Flutter invocation produced no test results and was interrupted. Flutter requires SDK-cache lock access; the replacement run with that access passed 67/67.
- Preliminary isolated packaging attempts failed because the direct invocation lacked pnpm context or sandbox networking blocked temporary dependency downloads. The completed confirmation has `VERIFICATION_EXIT_CODE=0` in `functions-runtime-confirm-verification.log`.
- Raw verification logs are local ignored `*-verification.log` files at the repository root. Baseline gallery and individual eligibility failure logs are also retained locally.

## Release review

Pending completion of the full Web component run. Emulator/rules integration and live Firebase/App Check behavior were not rerun under the explicit no-emulator/no-production-write constraint. Full Flutter test inventory and device smoke tests were not run; the startup/security/authentication selection and analysis were run. Existing lint warnings remain.

Stop for release review; this report does not authorize release or feature-gate changes.
