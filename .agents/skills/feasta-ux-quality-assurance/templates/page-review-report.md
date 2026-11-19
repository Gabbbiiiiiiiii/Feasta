# FEASTA page / flow QA report template

**Page(s)/role:**
**Device(s)/breakpoints:**
**Branch/HEAD/date:**
**Task mode:** read-only audit / implementation (explicitly requested)
**Primary user job:**
**Successful next action:**
**Evidence:** exact paths, test names/results, screenshots/URLs, Figma file key/node (if accessible)
**Unknowns:**

## Overall assessment
- Status: `BLOCKED` / `NEEDS FIXES` / `PASS (scope verified)` / `INSUFFICIENT EVIDENCE`.
- Blockers: `P0: ...`, `P1: ...` or none proven.
- Rubric: `<score>%` across `<N>/10` assessed categories, with NV categories listed. Critical blockers override score.
- Current flow: `Entry → selection → validation → action → outcome → recovery`.

## Findings by severity

| Priority | Evidence / file / step | What user experiences | Root cause or hypothesis | Smallest safe remedy | Tests / dependencies |
|---|---|---|---|---|---|
| P1 | ... | ... | ... | ... | ... |

## Section and pattern inventory

| Existing element | Keep/change/merge/remove | Proposed pattern (table/card/list/chart/form/text) | User-centered reason | Mobile/accessibility implication |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## Validation shift-left

| Late failure / code | Earliest stage known | Recommended earlier blocker/hint | Recovery CTA | Server recheck | Regression test |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

## State matrix

Cover: `initial`, `loading`, `populated`, `empty`, `filtered empty`, `invalid`, `disabled`, `stale`, `offline`, `permission denied`, `expired`, `success`, `retry`, `concurrent change`, `double click`, `unknown outcome`.

## Prioritized recommendation

1. **Fix the broken task** (security/payment/late failure) before aesthetic polish.
2. **Remove misleading/redundant information** and choose useful patterns.
3. **Unify FEASTA theme + language** across relevant screens.

**Change boundaries:**
**Tests run and results:**
**Tests not run / reasons:**
**Git commit/push/deploy status:**
**Residual risk / next owner action:**
