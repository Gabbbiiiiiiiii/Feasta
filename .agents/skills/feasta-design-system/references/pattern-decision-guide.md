# Component and information-architecture decision guide

**Never select a pattern because "it looks professional."** First state: what decision/action does this user need, which fields matter, which records are compared, what changes over time and what screen size is used?

| Pattern | Prefer when | Avoid when | FEASTA example |
|---|---|---|---|
| **Table** | Operators compare many records across consistent attributes, sort/filter/export, act per row, need exact values | Only 1–3 richly illustrated items; mobile reading without an adaptive view | Admin users/payments, provider requests, transaction logs |
| **Card grid** | Browsing heterogeneous service offers; image, trust details and an individual call to action drive selection | Dozens of operational records; repeated fields make comparison harder | Marketplace provider/package discovery |
| **Compact list** | Sequence, inbox, activity, notifications, limited repeated metadata | Extensive side-by-side numeric comparison | Notifications, booking timeline, chats |
| **Detail panel / drawer** | User chooses one record from a table and needs contextual inspection/actions | Primary high-stakes multi-step task that deserves its own route | Admin moderation detail |
| **Form / stepper** | The user supplies information in a controlled order; each step has explicit readiness criteria | Steps exist only because the UI has many cards | Event customization and booking review |
| **KPI summary** | A few headline measures answer operational questions and are clearly labeled | A pseudo-report containing only totals, with no drilldown or date scope | Admin overview top strip, not full Reports |
| **Chart** | A trend, composition, distribution or comparison is easier to see than in raw numbers | Exact reconciliation, 1–2 data points, unclear metric/date/units, decorative empty plots | Revenue over time with filter and tabular detail |
| **Plain inline text** | Short clarification or hint under field/action | A separate info card adds no decision value | Payment timing helper text |

## Chart chart-type challenge
- Line: ordered time series; distinguish totals vs rates.
- Bar: compare discrete categories; sort if ranking is the goal.
- Stacked bar: composition across a shared total, but do not bury exact numbers.
- Pie/donut: only a few mutually exclusive shares with discernible differences; often prefer bar.
- Table: exact amounts, audit evidence, exports and reconciliation always need an accessible exact-value view.
- Never visualize counts as rates without denominators; show data freshness, period, currency (`₱`) and relevant units.

## Keep / change / remove / combine gate for *each* section
1. What user question does it answer? Can the user act on the answer?
2. Does it repeat information already above, in the sidebar, or in a summary card?
3. Is it needed now or better after selection in a detail view?
4. Does it deserve a separate card, or just a heading/row/inline hint?
5. Does the grouping help or force more scrolling/clicks?
6. Is an action duplicated across multiple locations with inconsistent behavior?
7. What is the information density on phone vs desktop?
8. Is a filter usable (clear defaults, meaningful result count, reset, visible active state)?
9. What happens at zero, one, many, error, stale, slow, and restricted?
10. Would removing it reduce time-to-task without hiding a critical policy/consent requirement?

## Hierarchy defaults
- Page header: clear title, one-line purpose if needed, primary action anchored once.
- Status: display only when current state changes a decision; put blockers near the action.
- Primary area: main records, selection task or work queue.
- Secondary details: collapsible or dedicated detail view; never hide required conditions, final cost or irreversible effects.
- Dense operational pages: table on desktop; accessible row cards or responsive table on mobile when columns do not fit.
- Respect semantic status distinctions. Don't turn cautionary notices into repeated bright badges just to add color.

## Decision record template
`User goal → fields needed → available candidates → pattern selected → pattern rejected and why → removal/combination opportunity → effect on Web/Mobile → accessible state behaviors → verification`.
