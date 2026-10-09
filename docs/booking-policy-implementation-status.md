# Booking policy implementation status

Status: INCOMPLETE. The complete requested product contract is not implemented or ready for release.

## Files changed by this task

- `functions/src/bookings/booking-package-offer.ts`
- `functions/src/bookings/submit-booking-request.ts`
- `functions/src/payments/initial-payment-eligibility.ts`
- `functions/src/provider-requests/accept-provider-request.ts`
- `functions/src/refunds/system-balance-deadline-refund.ts`
- `functions/src/refunds/refund-execution.ts`
- `apps/web/src/lib/customer/bookings/customer-booking-initial-payment-eligibility.ts`
- `apps/web/test/components/customer-initial-payment-eligibility.test.tsx`

## New files

- `functions/src/bookings/booking-policy-v3.ts`
- `functions/src/payments/payment-default-accounting-domain.ts`
- `functions/test/booking-policy-v3.test.cjs`
- `functions/test/payment-default-accounting.test.cjs`
- This status report.

## Implemented

New catering/package and custom-menu submission evidence uses initial-payment eligibility schema v2, with `authorityTimeSource = booking_submission`. One server-owned Date captured during the submission is used for `submittedAt` and `evaluatedAt`. The cutoff is exactly 72 hours, inclusive. Package full-only and disabled-deposit decisions remain full-only. Acceptance validates and preserves v2 evidence instead of overwriting it with an acceptance-time evaluation. New submission-backed unpaid requests cannot be accepted at or after T-24. Existing v1 acceptance-based evidence remains readable and its evaluator remains unchanged.

Customer eligibility projection accepts the new version and displays submission-based short-notice wording. Legacy v1 wording remains compatible. Additional financial/timestamp fields are rejected as browser booking authority.

A strict v3 timing domain defines event start, T-72 eligibility cutoff, T-48 remaining-balance due, T-24 hard deadline and preparation start. Its status and stage functions cover due/grace/overdue/processing hold and fully-settled unlocked preparation/service eligibility. **The submission/acceptance path does not write timing v3 yet. These functions do not implement a scheduled worker.**

A centavo-safe allocation domain freezes 7000/2000/1000 basis points. Customer and Provider allocations are floored using integer arithmetic; FEASTA receives the residual centavos. Allocations reconcile exactly to the paid deposit.

The system deposit refund reservation has a version-gated v3 branch requesting only the customer allocation. Legacy timing records retain the old full-deposit system refund. The v3 reservation freezes allocation evidence and zero collectible obligation while preserving original financial evidence.

Trusted refund finalization has a version-gated dedicated accounting plan and audit ledger. It sets ordinary commission earned to zero, fully reverses ordinary commission, records only the incremental adjustment beyond the existing proportional reversal, sets Provider retained entitlement to the frozen 20% compensation, and records FEASTA's frozen 10% fee separately. Existing VAT processing remains intact; nonzero withholding and paid-out Provider earnings fail closed to review. This branch is **not an end-to-end implemented new-booking policy**, because v3 creation/enforcement is not connected.

## Outstanding work

- Server-produced booking-specific agreement, exact selection/price/policy fingerprint, stale-agreement verification, acknowledgement gating/reset, and immutable agreement evidence.
- Write new timing v3 from the trusted submission agreement; preserve frozen v2 and legacy records.
- Connect T-48 due/grace and T-24 deadline enforcement to v3 across checkout, durable attempt dispatch, remaining-balance lifecycle, reconciliation, and all projections.
- Safely recognize trusted terminal failed/expired/cancelled predeadline attempts for default cancellation; keep gateway uncertainty on hold.
- Preflight dedicated default accounting/payout constraints before cancellation/refund dispatch, with end-to-end transaction and webhook tests.
- Server-authoritative effective preparation/refund stage everywhere cancellation policy consumes it; future defaults 24 hours/manual=false.
- Bounded, indexed automatic event-start sweep and exact backend T-0 semantic guards; manual Provider completion remains.
- Hide manual preparation/start controls for new automatic bookings and update Customer/Provider/Admin projections.
- Default-allocation notifications and refund status presentation.
- FEASTA revenue and Provider payout/earning reporting integration for dedicated fee/compensation.
- Required integration/security/rules/boundary coverage for the completed flow.

Ordinary cancellation policies, manual legacy lifecycle callables and historical v2 contracts have not been replaced. No existing booking or production payment was mutated.

## Validation

- Standard Functions `pnpm build`: passed, including dependency preparation and TypeScript compilation.
- Retained cached TypeScript compiler: passed.
- Focused Functions eligibility/timing/allocation/accounting: 27 passed, 0 failed.
- Full Functions Node suite: 1,190 passed, 6 failed, 1,196 total. Five failures are source-wiring assertions against existing dirty Admin/Customer UI files; one is the existing predeadline checkout-resume test reporting payment-attempt reconciliation. These failures are unresolved; the tested checkout source was not edited by this task.
- Selected web component suites: 9 files passed, 193 tests passed, 0 failed (eligibility, booking customization/detail/list, Provider bookings, refund disclosure, Admin booking/payment, customer packages).
- Web TypeScript: passed.
- Full web ESLint: passed. Changed web files lint: passed.
- Functions changed-source ESLint: blocked by missing `node_modules/.pnpm/node_modules/@typescript-eslint/eslint-plugin` resolution.
- Firestore/Storage rule test runner: 4 test files failed at import before assertions because `@firebase/rules-unit-testing` resolves to a missing shared pnpm path. No rule assertions executed. Emulators shut down afterward.
- `git diff --check`: passed.

Logs are under `.tmp/booking-policy-functions-tests.log`, `.tmp/booking-policy-web-tests.log`, `.tmp/booking-policy-web-lint.log` and `.tmp/booking-policy-rules-tests.log`. The emulator log includes environment diagnostics and should not be shared publicly without review.

## Worktree and deployment

Branch remains `chore/monorepo-setup`, based on `6afcb837`. Prior dirty changes and untracked work were preserved. Nothing was staged, committed, pushed or deployed. No real checkout, retry or refund was created. Booking `BK-682DB4134C` and its successful deposit were not accessed or mutated.

Firestore rules/indexes were not changed. The current Provider-request write allowlist already prevents browser writes to financial/timing/eligibility authority. Index requirements for the future bounded v3 sweeps are still to be determined. Do not migrate existing bookings or deploy this as the complete policy.
