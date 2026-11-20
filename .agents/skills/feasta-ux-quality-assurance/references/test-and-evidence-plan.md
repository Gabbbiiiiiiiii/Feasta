# QA evidence and release verification plan

## Modes

**Audit (default):** read-only. No source writes, deployments or emulator starts. Repository references + screenshots + existing tests are evidence, not proof of current production runtime.

**Implement (only when requested):** change one small scoped UI/validation area with explicit precondition, regression tests and rollback consideration. Existing security/payment domain invariants must remain intact. Ask for authorization before sensitive execution such as production push/deploy or emulator runs.

## Required test categories

| Area | Tests/examples |
|---|---|
| Component unit | controls, aria labels, keyboard/focus, loading/error/disabled/empty states, password/date inputs |
| Feature integration | the backend/server error code maps to correct step, message, field, CTA and preservation of input |
| Booking contract | authorized role, active offer, max capacity, accepted/race conflicts, cutoff, payment terms, agreement |
| Payment safety | no duplicate click/charge, webhook vs redirect, delayed settlement, expiration no renewal, idempotent replay |
| Provider scheduling | online + walk-in shared capacity, blocked dates, multi-event settings, concurrent acceptance |
| Web/Mobile parity | same business status and customer options, equivalent feedback and same authoritative amounts |
| Accessibility | tab/focus order, label/error association, announcements, contrast, pointer targets, zoom/text scaling |
| Responsive | 320/375/600/1024/1280+ as applicable; truncation/overflow/long labels; no horizontal scroll without intent |
| Reliability | offline, slow network, stale server read, already-submitted operation, retries and partial failures |
| Reports/exports | filter fidelity, amounts, exported columns, preview and print-only layout |

## Safe executable command examples (when execution is authorized)

Repository-root examples; inspect local package scripts first:

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\flutterProject\feasta'
pnpm.cmd --dir apps/web typecheck
pnpm.cmd --dir apps/web test:components -- <targeted-test-file>
pnpm.cmd --dir functions exec tsc --noEmit
# Run targeted Functions tests only after checking their harness/build requirements.
# Flutter tests require Flutter installed; run the focused test path if authorized.
```

Do not blindly use `pnpm --dir functions test` as a cheap isolated test — it builds and runs a broad suite. Never start Firebase emulators or production deployment as an implicit page-review action.

## Measurement recommendations

Track **preventable late failure rate** (rejections caused by constraints knowable before final step), **booking completion rate**, **time to correct first invalid field**, **retries/duplicate requests**, **support contacts per failed booking**, **successful first-time provider setup**, and **report export correctness**. Define denominators and avoid collecting sensitive user data beyond approved telemetry. Do not claim improvement without real measurement.

## Evidence closure checklist

- Sources inspected and latest commit/branch stated.
- For each issue, observed evidence and reproducible path or a precise hypothesis label.
- UI behavior and server contract both covered for availability, pricing and booking.
- Tests and their actual output listed; any skipped checks explained.
- Existing risk-sensitive paths unaffected or explicitly listed as requiring additional verification.
- Git/Firebase/deployment status explicit; no implied production correctness.
