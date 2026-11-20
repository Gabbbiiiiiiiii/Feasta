---
name: feasta-ux-quality-assurance
description: Use to critically audit FEASTA customer, provider, admin and Flutter pages, booking readiness and eligibility, forms, visual noise, cards vs tables/charts, UX writing, accessibility, errors, states, workflow recoverability, Web/Mobile consistency, and frontend/backend validation. Prioritize preventing wasted user effort and unsafe late-stage failures. Always inspect real code and evidence before proposing fixes.
---

# FEASTA UX + functional quality assurance

## Mission
Judge **whether each page earns its existence and lets users finish a real task**, not just whether it looks polished. Surface design noise, contradictory states, missing next-step guidance, hidden constraints, preventable late submission failures and system-policy gaps. **Do not pass a page with a beautiful UI and a broken workflow.** For visual redesigns also load `feasta-design-system`.

## Required approach

1. **Inspect first, not by assumption.** Identify user role, exact route/screen, device, dominant user task, entry and exit points, current UI structure, data sources, live states, and server authority. Gather screenshots only if available and authorized; code/screenshots/tests are different evidence types.
2. **Trace full user journey.** Follow upstream discovery/search, detail, selection, stepper, review, submission, payment, status/recovery. On provider/admin pages trace list → filter/search → record → action → result → audit. For each transition ask what users can know *before* spending effort.
3. **Critical page review.** Apply `references/page-audit-rubric.md` and `references/page-type-questions.md`. For each section ask why it exists and whether card, table, chart, list, inline explanation or removal is better. Give a reason tied to user tasks and exact fields.
4. **Validation prevention.** Trace each failure from the backend or trusted domain rule **back to the first screen where inputs/eligibility were known**. Use `references/booking-readiness-and-validation.md`. Show blockers early, actionable, and near the relevant choice. Treat transient/revocable availability as provisional; recheck transactionally at submission.
5. **States and resilience.** Exercise initial, loading, populated, empty, filtered-empty, stale, offline, error, disabled, forbidden, expired, retry, success, duplicate click and concurrent modification. Preserve form data, draft state, money state and idempotency.
6. **UX writing.** Read the companion design-system `../feasta-design-system/references/ux-writing.md` where present or the external handbook if directly accessible; copy is precise, supportive, consistent and action-oriented.
7. **Risk classification.** P0/P1 financial, security, duplicate requests, misleading payment/reservation or unfinishable booking outrank visuals. Don't relabel missing runtime tests as a pass. Use the scoring only where evidence exists; a critical blocker overrides scores.
8. **Produce actionable output.** Cite paths, functions, control names and observable states. For each finding give the user impact, root cause or known uncertainty, *specific fix*, cross-platform dependencies, test case and an explicit **keep / change / remove / combine** decision where UI applies. Separate proven bug from UX hypothesis.
9. **Implementation gate.** Review-only by default. If user explicitly asks for changes and evidence supports them: patch the smallest safe layer, write targeted tests, run permitted checks, verify role/permission and backend invariants, and report what remains unverified. Never silently alter server policy just to make a UI happy.

## Exit gates — page may not be called ready unless all apply

- The user can find the task, understand required information and see the next sensible action.
- User-facing blockers known before submission are communicated as early as possible; late failures are limited to legitimately changing server state, race conditions, or backend-only checks.
- Backend remains final authority for eligibility, pricing, available capacity, policy acceptance, authorization, payment settlement and idempotency.
- Errors say what can be done now; failed operations retain data and do not create a duplicate booking or payment.
- Busy, empty, error, success, expired, not-authorized and stale states are coherent and navigable.
- No page uses card overload, redundant sections, charts without a question, table without meaningful comparison, or multiple rival primary CTAs.
- Typography, spacing, status language, units, dates, pricing and navigation are consistent with the FEASTA semantic system on relevant devices.
- Keyboard, focus, screen reader labels, contrast, hit targets, mobile layout and reduced motion have been reviewed.
- Relevant tests are cited with results, or gaps are explicitly marked **NOT VERIFIED**; no fabricated test claims.

## Severity and readiness

- **P0:** double charge/duplicate financial action, unauthorized access/data exposure, irreversible corruption or unsafe cross-user operation: stop release, escalate.
- **P1:** blocked critical user journey, misleading availability/price/settlement, repeatable last-step booking failure that could be prevented, lost draft or unrecoverable action: release blocker unless explicitly accepted with mitigation.
- **P2:** significant usability/friction/a11y or inconsistent workflow that users can work around; prioritize.
- **P3:** minor visual/polish without measurable task harm; queue after functional issues.
- **Unverified:** label separately. Never describe as working based on source presence alone.

Use `references/page-audit-rubric.md` to score verified evidence only; apply a P0/P1 blocker regardless of nominal score.

## Output contract

Use `templates/page-review-report.md` for detailed audits. At minimum: scope, evidence table, page purpose and next action, severity-ranked findings with exact code/test references, card/table/chart/section decisions, early-blocker matrix, flow-state matrix, proposed minimal fix with ownership layer, tests/measurements, residual risks, and Git/Firebase/emulator status. For multi-page audits add a matrix sorted by worst user impact. Avoid purely aesthetic or content-free feedback.

## Supporting references

- `references/page-audit-rubric.md`
- `references/booking-readiness-and-validation.md`
- `references/page-type-questions.md`
- `references/test-and-evidence-plan.md`
- `templates/page-review-report.md`

## FEASTA safeguards

Protect the dynamic initial-payment expiration engine, payment settlement/reconciliation and authorization; do not undo customer multi-provider booking or provider shared daily capacity/walk-in reservation checks; respect booking restrictions; preserve local drafts and Event Lists and submission recovery. No commits, pushes, deployments, emulator or production writes without task-specific permission. No blocking identity-verification feature work unless specifically requested.
