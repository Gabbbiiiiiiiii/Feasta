# P13-B audit corrections

Scope: the four required audit findings plus the optional dispatch-block root-cause ordering. Existing unrelated dirty changes were preserved. Branch: `chore/monorepo-setup`.

## Corrections

1. **Terminal aggregate invariant:** trusted success sets `paid`, `paidAt`, clears `activePayoutAttemptId`, retains `gatewayResourceId`, and records the external identity in `lastPayoutAttemptId`. Matching terminal duplicates still return without writes; concurrent duplicate success is tested against Firestore.
2. **Persisted constituent states:** completion receives original records, with no manufactured processing statuses. Aggregate/attempt pairs are reserved/reserved, processing/processing, or reconciliation_required/ambiguous; every constituent must match that persisted pair. Shared settlement validation checks identity, review flags/reason, positive reservation, unpaid settlement, and earning availability. Existing completion/failure helpers retain financial invariants. Ambiguous legacy failures preserve locks even when earning buckets need review; aggregate outcomes still require strict financial validation. Trusted pending resolution clears ambiguity flags while retaining reservations. Corrupted/stale states, duplicate members/sources, external linkage changes and dispatchable constituent records fail closed.
3. **Admin retry:** a distinct Retry failed payout button appears only for valid canonical failed aggregates with validated structure and linked payment. Legacy, malformed, held, ready, processing, reconciliation and ambiguous records are excluded. The confirmation says a new attempt is created only after financial revalidation. The browser initializes App Check and calls only existing `retryFailedProviderDisbursement`, forwarding only the canonical ID. Success refreshes issues; concurrent-change errors receive safe feedback. Repair payout setup remains separate. No status-check feature, manual amounts, client gateway evidence, or terminal-state overrides were added.
4. **Readiness:** valid existing `readyAt` is preserved as the first financial-ready instant. Only errors from `reconcileOne` invoke the failure marker, using the snapshot actually read in the failed transaction. The marker requires matching Firestore updateTime and an unchanged scheduled/held/ready state. Execution errors cannot invoke it. Newer versions and execution/terminal states are protected. Real Firestore tests cover readiness timestamps and stale versions.

Optional cleanup: when dispatch is enabled, Provider account/capability failures take precedence over missing transport in `dispatchBlockReason`.

## Exact files changed in this correction pass

- `apps/web/test/components/admin-payment-usability.test.tsx`
- `apps/web/test/components/provider-disbursement-admin-projection.test.tsx`
- `apps/web/test/components/provider-disbursement-admin-retry.test.tsx`
- `apps/web/test/components/provider-disbursement-retry-client.test.tsx`
- `apps/web/src/components/admin/payments/payment-finance-attention.tsx`
- `apps/web/src/components/admin/payments/payment-monitoring-client.tsx`
- `apps/web/src/lib/admin/payments/admin-payment-client.ts`
- `apps/web/src/lib/admin/payments/admin-payment-service.ts`
- `apps/web/src/lib/admin/payments/admin-payment-types.ts`
- `docs/domain/provider-disbursement-p13-b-audit-corrections.md`
- `functions/test/emulator/provider-disbursement.integration.cjs`
- `functions/src/provider-finance/provider-disbursement-domain.ts`
- `functions/src/provider-finance/provider-disbursement-reconciliation.ts`
- `functions/src/provider-finance/provider-settlement-domain.ts`
- `functions/test/provider-disbursement-domain.test.cjs`
- `functions/test/provider-disbursement-transactions.test.cjs`

The dependency repair changed only an ignored local node_modules link: the broken `node_modules/.pnpm/node_modules/@firebase/rules-unit-testing` symlink now points to the already-installed Functions package. A frozen offline install alone did not repair it. No package manifest, lockfile, rules, or production code was changed for this repair.

## Validation

| Check | Result |
|---|---|
| Functions build (`pnpm --dir functions build`) | Pass |
| Focused P13 Functions tests | 142 passed, 0 failed |
| All Functions root tests (settlement, attempts, refund/payout races, webhook, compensation and lifecycle included) | 1,362 passed, 0 failed |
| P13 emulator script and final local emulator rerun | 31 passed: 10 transaction/readiness + 21 REST security |
| Normal Firestore rules-unit-testing | Repaired; 56 passed, including 18 payout-specific tests |
| Affected Admin/Provider UI tests | 99 passed across 8 files |
| Web typecheck | Pass |
| Affected Functions ESLint | 0 errors; 62 warnings |
| Affected web ESLint | Pass; no warnings/errors |
| `git diff --check` | Pass |

Standard rules tests ran with `RULES_FIRESTORE_ONLY=true`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:43080`, and `GCLOUD_PROJECT=demo-feasta-phase3`. The Storage rules suite was outside this Firestore correction pass. All emulator operations used the task-owned local demo emulator; no real project was used.

## Safety

Nothing was staged, committed, pushed or deployed. No live credentials or real PayMongo HTTP calls were used. No disbursement enablement flag was changed. Real PayMongo transport remains unavailable (`paymongo_verified_transfer_source_and_destination_missing`); Provider money movement remains disabled by default and blocked by the unavailable transport. The task-owned leftover emulator process was stopped after testing; other emulator ports were left alone.

## Worktree snapshot

The following output includes pre-existing dirty work. Git diff --stat covers tracked changes only; untracked P13 files are listed in status and the exact correction-pass list above.

### git status --short

```text
 M apps/web/src/app/provider/payments/provider-finance-panel.tsx
 M apps/web/src/components/admin/payments/payment-finance-attention.tsx
 M apps/web/src/components/admin/payments/payment-monitoring-client.tsx
 M apps/web/src/components/admin/provider-verification/provider-verification-queue.tsx
 M apps/web/src/components/admin/users/user-management-client.tsx
 M apps/web/src/components/data/detail-drawer.tsx
 M apps/web/src/lib/admin/payments/admin-payment-client.ts
 M apps/web/src/lib/admin/payments/admin-payment-service.ts
 M apps/web/src/lib/admin/payments/admin-payment-types.ts
 M apps/web/src/lib/provider/payments/provider-finance-service.ts
 M apps/web/src/lib/provider/payments/provider-finance-types.ts
 M apps/web/test/components/admin-payment-usability.test.tsx
 M apps/web/test/components/provider-verification-queue.test.tsx
 M apps/web/test/components/user-management.test.tsx
 M firebase/firestore.indexes.json
 M firebase/firestore.rules
 M functions/package.json
 M functions/src/index.ts
 M functions/src/payments/paymongo-webhook.ts
 M functions/src/provider-finance/provider-settlement-domain.ts
 M functions/src/provider-finance/provider-settlement-management.ts
 M functions/src/provider-requests/provider-request-financial-snapshot.ts
 M functions/src/provider-requests/update-provider-booking-lifecycle.ts
 M functions/test/function-security-contract.test.cjs
 M functions/test/provider-request-financial-snapshot.test.cjs
?? apps/web/test/components/provider-disbursement-admin-projection.test.tsx
?? apps/web/test/components/provider-disbursement-admin-retry.test.tsx
?? apps/web/test/components/provider-disbursement-retry-client.test.tsx
?? apps/web/test/components/provider-disbursement-ui.test.tsx
?? docs/domain/provider-disbursement-p13-b-audit-corrections.md
?? docs/domain/provider-disbursement-p13-b-report.md
?? docs/domain/provider-disbursement-policy-v1.md
?? firebase.p13-b.test.json
?? functions/src/provider-finance/provider-disbursement-admin.ts
?? functions/src/provider-finance/provider-disbursement-compensation.ts
?? functions/src/provider-finance/provider-disbursement-domain.ts
?? functions/src/provider-finance/provider-disbursement-execution.ts
?? functions/src/provider-finance/provider-disbursement-management.ts
?? functions/src/provider-finance/provider-disbursement-policy.ts
?? functions/src/provider-finance/provider-disbursement-reconciliation.ts
?? functions/src/provider-finance/provider-disbursement-transport.ts
?? functions/src/provider-finance/provider-disbursement-webhook.ts
?? functions/test/emulator/provider-disbursement-security.integration.cjs
?? functions/test/emulator/provider-disbursement.integration.cjs
?? functions/test/provider-disbursement-domain.test.cjs
?? functions/test/provider-disbursement-fixtures.cjs
?? functions/test/provider-disbursement-policy.test.cjs
?? functions/test/provider-disbursement-transactions.test.cjs
?? functions/test/provider-disbursement-wiring.test.cjs
?? functions/test/rules/provider-disbursement.rules.test.cjs
```

### git diff --stat

```text
 .../provider/payments/provider-finance-panel.tsx   |  24 ++
 .../admin/payments/payment-finance-attention.tsx   |  24 +-
 .../admin/payments/payment-monitoring-client.tsx   |  37 +++
 .../provider-verification-queue.tsx                | 184 ++++++++++++++-
 .../admin/users/user-management-client.tsx         | 253 +++++++++++++++------
 apps/web/src/components/data/detail-drawer.tsx     |   2 +-
 .../src/lib/admin/payments/admin-payment-client.ts |  23 +-
 .../lib/admin/payments/admin-payment-service.ts    |  52 ++++-
 .../src/lib/admin/payments/admin-payment-types.ts  |   3 +
 .../provider/payments/provider-finance-service.ts  |  11 +
 .../provider/payments/provider-finance-types.ts    |   6 +
 .../components/admin-payment-usability.test.tsx    |   2 +-
 .../provider-verification-queue.test.tsx           |  74 ++++++
 apps/web/test/components/user-management.test.tsx  |  32 ++-
 firebase/firestore.indexes.json                    |  19 +-
 firebase/firestore.rules                           |   9 +
 functions/package.json                             |   3 +-
 functions/src/index.ts                             |   8 +
 functions/src/payments/paymongo-webhook.ts         |   3 +-
 .../provider-finance/provider-settlement-domain.ts |  44 ++--
 .../provider-settlement-management.ts              |   2 +-
 .../provider-request-financial-snapshot.ts         |  10 +
 .../update-provider-booking-lifecycle.ts           |  47 +++-
 functions/test/function-security-contract.test.cjs |   4 +
 .../provider-request-financial-snapshot.test.cjs   |   3 +
 25 files changed, 763 insertions(+), 116 deletions(-)
```

### git diff --cached --stat

```text
(empty)
```
