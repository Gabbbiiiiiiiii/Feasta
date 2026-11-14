# P13-B Provider Disbursement implementation report

Date: October 9, 2026 (Asia/Manila). Branch: `chore/monorepo-setup`.

## 1. Audit confirmation

Inspected the actual branch, `git status --short`, `git diff --check`, and the complete tracked diff before editing. Existing uncommitted P13-A work was extended. Unrelated Admin/User Management/Provider Verification changes and `firebase/firestore.indexes.json` were preserved.

All seven frozen findings were confirmed/addressed:

1. Financial readiness was coupled to `providerDisbursementsEnabled` and transport readiness. It now becomes ready independently; the flag gates reservation/dispatch only.
2. Completion used a server timestamp while scheduling captured a separate transaction-local clock. One trusted server instant is now captured before the transaction and reused for request completion and payout eligibility on every retry.
3. Error handling directly overwrote the scanned document. It now uses a transaction and exact scanned document update-time guard; a newer state/version cannot be overwritten.
4. Readiness could process locked execution states. Only scheduled/held/ready enter readiness recalculation; execution states use evidence reconciliation, and paid/cancelled/failed do not regress.
5. P13-A had no atomic aggregated execution layer. One external attempt now orchestrates existing settlement reservation/accounting primitives.
6. Initial transport was workflow. It is now disabled/unresolved until verified transport and destination are frozen at reservation.
7. Payout checks did not re-read full canonical payment authority. Readiness and ordinary reservation now reuse `readTrustedProviderRequestPaymentSetInTransaction` and validate canonical earnings/settlements/refund locks in the same transaction.

## 2. Architecture

`providerDisbursements` remains one deterministic obligation per enrolled Provider Request, referencing every canonical source settlement. No historical migration or earning scan was added.

`providerDisbursementAttempts` holds the single external logical attempt, its deterministic sequence/ID/reference/idempotency key, amount, PHP currency, frozen transport/destination/test-mode evidence, gateway evidence and timestamps.

Existing `providerPayoutAttempts` remain constituent settlement linkage/reservation records. They point to the aggregate external attempt and contain `externalDispatchAllowed: false`. Existing settlement domain functions reserve, complete and fail each constituent; all writes commit together or none do. Earning availability remains unchanged until trusted success. Fully reversed zero-value settlements remain canonical evidence and are excluded from monetary reservations.

Pending stays locked. Unknown/timeouts stay locked under financial reconciliation. Terminal gateway failure releases every monetary reservation without moving earning money to paid. A controlled Admin retry first revalidates financial readiness, then uses a new attempt sequence/reference/idempotency key. No ambiguous redispatch or automatic retry was added.

Admin issue cards and failure/reconciliation counts treat the aggregate as one payout while retaining legacy monitoring. Clients cannot alter canonical finance documents. The Admin retry callable accepts only the disbursement ID, requires Admin authorization/App Check/rate limiting, and writes an audit record.

## 3. Files changed or extended for P13

| Group | Files |
|---|---|
| Policy/domain | `functions/src/provider-finance/provider-disbursement-policy.ts` (existing P13-A retained); `provider-disbursement-domain.ts`; `functions/src/provider-requests/update-provider-booking-lifecycle.ts` |
| Orchestration/reservation | `provider-disbursement-management.ts`; `provider-disbursement-execution.ts`; `provider-disbursement-admin.ts` |
| PayMongo transport | `provider-disbursement-transport.ts` (fail-closed interface; no HTTP adapter or credentials invented) |
| Webhook/reconciliation | `provider-disbursement-webhook.ts`; `provider-disbursement-reconciliation.ts`; `functions/src/payments/paymongo-webhook.ts`; `functions/src/index.ts` |
| Payment-default compensation | `provider-disbursement-compensation.ts`; reuse of existing finalized payment-default accounting without changing its 70/20/10 calculation |
| Provider UI | `apps/web/src/app/provider/payments/provider-finance-panel.tsx`; `apps/web/src/lib/provider/payments/provider-finance-service.ts`; `provider-finance-types.ts` |
| Admin UI/projection | `apps/web/src/lib/admin/payments/admin-payment-service.ts`; existing Provider payout issues component reused; safe retry callable added in Functions |
| Firestore/security | `firebase/firestore.rules`; server-only aggregate-attempt collection; existing payout protections retained |
| Tests/docs | P13 policy/domain/transaction/wiring fixtures and tests; emulator transaction/security tests; rules test; Provider/Admin projection/component tests; reviewed export/snapshot expectations; `firebase.p13-b.test.json`; `functions/package.json` emulator script; policy document and this report |

The existing P13-A financial-snapshot enrollment and settlement-management export were preserved. Unrelated dirty files were not rewritten.

## 4. State machine

```text
scheduled -> held | ready | cancelled
held      -> scheduled | ready | cancelled
ready     -> held | reserved
reserved  -> processing | paid | failed | reconciliation_required
processing -> paid | failed | reconciliation_required
reconciliation_required -> processing | paid | failed  [trusted matching gateway evidence only]
failed -> held -> ready -> reserved                   [controlled Admin retry; new identity]
paid / cancelled                                     [terminal]
```

A readiness reconciliation failure may move an unchanged scheduled/held version to reconciliation_required. No ready -> paid transition is available. Readiness never resets an execution/terminal state. Reserved -> paid is allowed only for an immediate trusted terminal gateway success after reservation.

## 5. Ordinary payout example

Completed Friday October 9, 2026, at noon Manila -> Monday October 12 (day 1) -> Tuesday October 13 (day 2) -> Wednesday October 14 (day 3), eligible from 10:00 AM Manila, assuming no configured holiday.

```text
completed -> third banking day -> ready
          -> reserved -> processing -> paid
```

Ready is possible while dispatch is OFF. Reservation/external submission remains blocked until verified operational capability exists. The 15-minute scheduler is unchanged; 10:00 AM is eligibility, not guaranteed execution.

## 6. Deposit + balance example

Settlement A PHP 4,500 + Settlement B PHP 4,500 -> one ProviderDisbursement for PHP 9,000 -> one external logical payout attempt -> one external transfer when a verified adapter is available. Both monetary settlements reserve atomically and complete exactly once. Transfer fees do not reduce Provider entitlement.

## 7. Payment-default example

For a PHP 10,000 paid deposit, existing frozen accounting allocates PHP 7,000 Customer refund, PHP 2,000 Provider reservation compensation, and PHP 1,000 FEASTA fee. No second ordinary commission is calculated here.

```text
70% refund / 20% compensation / 10% FEASTA
-> trusted refund/accounting finalization
-> first Manila banking day, eligible from 10:00 AM
-> same Provider disbursement engine
```

The trigger observes committed `paymentDefaultAccountingSchemaVersion = 1`, validates the canonical deposit/earning, anchors on the persisted finalization timestamp, and creates the deterministic disbursement in a transaction. Duplicate events create no duplicate obligation. Service completion is not required.

## 8. PayMongo integration status

**Domain/mock only; blocked by missing FEASTA PayMongo capability/configuration.**

The official v2 contract requires a verified source account and recipient account number/name/BIC. Existing FEASTA linked-account org IDs do not supply that verified transfer contract. The production transport returns `paymongo_verified_transfer_source_and_destination_missing` and makes no external requests. Test-mode adapter/E2E has not been executed or claimed.

The existing signature-verified webhook path handles `transfer.outward.successful` and `transfer.outward.failed` using matching resource/reference/amount/PHP/destination/test-mode evidence. Signed success, signed failure, duplicates, unsigned events, malformed amounts and live-mode mismatches were exercised with fixtures. Real account-specific webhook payload verification is still required before an HTTP adapter is enabled.

References checked: [PayMongo transfer resource](https://docs.paymongo.com/reference/transfer-resource), [money movement API](https://docs.paymongo.com/docs/money-movement-moving-money-with-api), [idempotency/reference practices](https://docs.paymongo.com/docs/money-movement-best-practices).

## 9. Feature flags and safe state

`providerDisbursementsEnabled` means external dispatch permission. Missing/false defaults OFF. No platform setting was changed or automatically enabled. Deployed settings were not read, so this report does not claim a verified remote stored flag value. The repository adapter is unavailable regardless of that flag, rejects live evidence, and cannot move live Provider money in this implementation.

## 10. Validation

| Exact command | Result |
|---|---|
| `pnpm --dir functions build` | PASS (TypeScript and shared runtime preparation) |
| `node --test functions/test/provider-disbursement-domain.test.cjs functions/test/provider-disbursement-policy.test.cjs functions/test/provider-disbursement-transactions.test.cjs functions/test/provider-disbursement-wiring.test.cjs` | 74 passed, 0 failed |
| `node --test functions/test/*.test.cjs` | 1,294 passed, 0 failed; includes existing settlement/account/refund/payment-default/remaining-balance/webhook/lifecycle regressions |
| `pnpm --dir functions test:p13-b:emulator` | 25 passed, 0 failed (4 real transaction/race tests + 21 authenticated REST security tests); fake transport only |
| `pnpm --dir apps/web test:components test/components/provider-disbursement-admin-projection.test.tsx test/components/provider-disbursement-ui.test.tsx test/components/provider-payments.test.tsx test/components/provider-payment-service-contract.test.tsx test/components/admin-payment-usability.test.tsx test/components/admin-payment-service-usability.test.tsx` | 47 passed, 0 failed (6 files) |
| `pnpm --dir apps/web typecheck` | PASS |
| `pnpm --dir functions lint` | PASS; 0 errors, 455 warnings (existing and new style warnings; these are not all claimed to be pre-existing) |
| `pnpm --dir apps/web exec eslint src/app/provider/payments/provider-finance-panel.tsx src/lib/provider/payments/provider-finance-service.ts src/lib/provider/payments/provider-finance-types.ts src/lib/admin/payments/admin-payment-service.ts test/components/provider-disbursement-ui.test.tsx test/components/provider-disbursement-admin-projection.test.tsx` | PASS; no reported errors/warnings |
| `git diff --check` | PASS; Git reports existing LF/CRLF conversion notices |

Initial broad validation found two outdated P13-A expectations: export inventory and frozen financial-snapshot policy field. Both were corrected; the compensation/retry exports were also added to the reviewed inventory. There are no unresolved failures in the final broad Functions run.

The standard `@firebase/rules-unit-testing` run failed at startup (0 passed, 1 failed test-file load) because its local dependency link is broken/missing. The authenticated REST emulator security suite independently verifies 18 denied create/update operations plus 3 positive authenticated-profile controls, all passed. The maintained isolated emulator command uses this working suite and real Firestore transaction tests, with fake transport only. No external PayMongo call was made.

## 11. Remaining sandbox blockers

- Verified FEASTA v2 transfer source and Provider destination provisioning/configuration is absent; no IDs or credentials were invented.
- Account-specific transport/retrieval and actual webhook payload contract must be verified with test-mode fixtures before adding/enabling the HTTP adapter.
- The existing standard rules-test package link remains broken; the new REST security checks work without it.

## 12. Remaining production blockers

- External HTTP transport is deliberately unavailable; verified sandbox capability and test-mode E2E remain prerequisites.
- Live dispatch has not been enabled, live credentials have not been used, and no production deployment has been performed.
- Financial-review/ambiguous cases require evidence reconciliation; no force-paid/clear-ambiguous or automatic Provider clawback action exists.

## 13. git status --short

```text
 M apps/web/src/app/provider/payments/provider-finance-panel.tsx
 M apps/web/src/components/admin/provider-verification/provider-verification-queue.tsx
 M apps/web/src/components/admin/users/user-management-client.tsx
 M apps/web/src/components/data/detail-drawer.tsx
 M apps/web/src/lib/admin/payments/admin-payment-service.ts
 M apps/web/src/lib/provider/payments/provider-finance-service.ts
 M apps/web/src/lib/provider/payments/provider-finance-types.ts
 M apps/web/test/components/provider-verification-queue.test.tsx
 M apps/web/test/components/user-management.test.tsx
 M firebase/firestore.indexes.json
 M firebase/firestore.rules
 M functions/package.json
 M functions/src/index.ts
 M functions/src/payments/paymongo-webhook.ts
 M functions/src/provider-finance/provider-settlement-management.ts
 M functions/src/provider-requests/provider-request-financial-snapshot.ts
 M functions/src/provider-requests/update-provider-booking-lifecycle.ts
 M functions/test/function-security-contract.test.cjs
 M functions/test/provider-request-financial-snapshot.test.cjs
?? apps/web/test/components/provider-disbursement-admin-projection.test.tsx
?? apps/web/test/components/provider-disbursement-ui.test.tsx
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

## 14. git diff --stat

```text
 .../provider/payments/provider-finance-panel.tsx   |  24 ++
 .../provider-verification-queue.tsx                | 184 ++++++++++++++-
 .../admin/users/user-management-client.tsx         | 253 +++++++++++++++------
 apps/web/src/components/data/detail-drawer.tsx     |   2 +-
 .../lib/admin/payments/admin-payment-service.ts    |  37 ++-
 .../provider/payments/provider-finance-service.ts  |  11 +
 .../provider/payments/provider-finance-types.ts    |   6 +
 .../provider-verification-queue.test.tsx           |  74 ++++++
 apps/web/test/components/user-management.test.tsx  |  32 ++-
 firebase/firestore.indexes.json                    |  19 +-
 firebase/firestore.rules                           |   9 +
 functions/package.json                             |   3 +-
 functions/src/index.ts                             |   8 +
 functions/src/payments/paymongo-webhook.ts         |   3 +-
 .../provider-settlement-management.ts              |   2 +-
 .../provider-request-financial-snapshot.ts         |  10 +
 .../update-provider-booking-lifecycle.ts           |  47 +++-
 functions/test/function-security-contract.test.cjs |   4 +
 .../provider-request-financial-snapshot.test.cjs   |   3 +
 19 files changed, 637 insertions(+), 94 deletions(-)
```

`git diff --stat` includes inherited tracked changes and omits untracked new files. It is the complete requested working-tree output, not a claim that all listed changes belong to this task.

## 15. Explicit confirmations

Nothing staged by this task. Nothing committed. Nothing pushed. Nothing deployed. No live PayMongo credentials used. No actual Provider transfer executed. Live Provider money movement remains disabled at the repository transport boundary. Unrelated current worktree changes were preserved.
