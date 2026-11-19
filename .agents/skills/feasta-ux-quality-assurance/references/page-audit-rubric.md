# FEASTA page review rubric — critical, evidence-based

## Evaluation protocol

1. Write one sentence: **"The primary job of this page is ..."** and identify the action that completes it.
2. Inventory the actual visible sections and actions from source and screenshots, labeling `KEEP`, `CHANGE`, `MERGE`, or `REMOVE`; give evidence and a one-sentence user-centered reason.
3. Ask of every card/table/chart: what question does this answer, what interaction does it enable, why is it the best representation, does it duplicate something, and what happens on mobile?
4. Assess categories below 0–5: `0 = unusable/harmful`, `1 = severe`, `2 = major friction`, `3 = acceptable but inconsistent`, `4 = effective with small issues`, `5 = verified and effective`. If not inspected/tested, mark `NV` (not verified), **not 5**.
5. For a numeric score, show only the average of scored categories (sum / (5 × scored categories) × 100) and number of categories assessed. **Do not compare scores with different coverage without flagging it**. P0/P1 defects override high scores.

| Category | What the reviewer must prove |
|---|---|
| 1. Purpose and task | Page role and top task obvious; no fake actions or dead ends |
| 2. Information architecture | Section sequence matches decision flow; duplication removed; progressive disclosure used appropriately |
| 3. Pattern selection | Table/card/list/chart/form chosen for comparison, action and device constraints, not decoration |
| 4. Visual hierarchy and noise | Restrained headers, badges, shadows, colors; consistent spacing, typography and one primary CTA |
| 5. Wayfinding and UX writing | Next step, labels, statuses, terminology and constraints intelligible in context |
| 6. Early validation / readiness | Known blockers and requirements surfaced before costly work; live eligibility is not overpromised |
| 7. Feedback and recovery | Loading, error, empty, stale, disabled, retry, preserved inputs, duplicates handled |
| 8. Accessibility and responsive | Keyboard, focus, label/error associations, contrast, touch target, screen-reader announcements, layout |
| 9. Domain correctness / safety | Trusted authorization, price, capacity, payment, deadline, transaction and idempotency invariant intact |
| 10. Cross-platform/system consistency | Shared components, tokens, terminology and Web/Mobile lifecycle align where required |

**Criticality cannot be averaged away.** A page with a P1 repeatable booking failure is `BLOCKED` regardless of visual score. Status: `BLOCKED`, `NEEDS FIXES`, `PASS (verified scope only)`, or `INSUFFICIENT EVIDENCE`.

## The challenge questions

- **Is this section necessary?** If removed, what essential task becomes harder or unsafe?
- **Why a card instead of a table?** Show whether user is discovering individual offerings or comparing records across columns.
- **Why a chart instead of exact numbers?** State the analytical question, metric, time range, breakdown, units, data source and drilldown.
- **Why a modal?** Is the action brief and reversible? Long/confusing high-stakes tasks deserve a separate flow.
- **Why does the button exist here?** Is its effect predictable? Would placing it nearer the relevant object reduce mistakes?
- **Why this warning?** Can the user do something about it now? Does repeating it in 3 cards add anything?
- **Why this form field?** Is it needed to fulfill, contact, pay, comply or decide? Why is it asked *now*?
- **Why a disabled control?** Can the user read its reason and the unlock step without trying random options?
- **Why can the user progress?** If the next step is inevitably blocked, stop earlier with a clear route to correction.
- **Can a first-time user finish?** Test without developer intuition about hidden buttons and policy semantics.

## Evidence requirements

- **Observed:** screenshot/session/actual user route test, with context.
- **Code-proven:** file path and function/control logic; may still fail at runtime.
- **Test-proven:** named targeted test and result in current environment.
- **Hypothesis:** expected friction based on heuristics; ask for telemetry/usability test when consequence is uncertain.
- **Unknown:** missing access, data, backend policy or deployment info — say so.

Do not use this rubric as justification to remove legal/payment disclosure, security evidence, required consent or important transactional details. Improve hierarchy, not concealment.
