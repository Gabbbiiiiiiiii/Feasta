---
name: feasta-design-system
description: Use for FEASTA customer, provider, or admin web/mobile page design, UI refactors, visual consistency audits, component selection, Figma MCP translation, Vaadin Lumo/Icons/Charts references, and accessibility-aware design implementation. Preserve FEASTA's current emerald tokens; do not inherit Vaadin colors or introduce Vaadin as a runtime dependency.
---

# FEASTA design system — Figma-informed, project-native

## Objective
Deliver coherent, low-noise, task-driven interfaces that reuse FEASTA components, preserve the brand, and make the user’s next action obvious. **Good design requires challenging unnecessary UI; visual similarity alone is not quality.** For interaction, validation, copy or task-flow decisions, also load `feasta-ux-quality-assurance`.

## Source precedence (highest first)
1. Explicit requirements of the current task, **without violating safety or authoritative backend policy**.
2. Actual current FEASTA source: `apps/web/src/app/globals.css`, `apps/customer_mobile/lib/core/theme/`, shared primitives, business contracts and actual UI behavior.
3. Proven, accessible Figma Vaadin/Lumo component structure, states, iconography and chart organization *as inspiration / component reference*.
4. monday.com Vibe UX writing handbook for style of writing (only after directly consulting accessible content); otherwise use the FEASTA writing rules in `references/ux-writing.md` and mark handbook as not verified.
5. Older project documentation as historical context, not as a palette override.

**Do not replace FEASTA emerald with default Lumo blue, Vaadin themes, or the old FEASTA orange. Do not add @vaadin web components to a Next.js/React/Flutter project just to visually match Figma.**

## Required workflow

1. **Define the task and evidence.** Identify role, page, device, primary user goal, success condition, existing pain points and target files. Inspect page + upstream data + downstream actions, not just a screenshot. Record current branch/HEAD; do not assume an old stored snapshot is current.
2. **Read the source.** Inspect relevant route, shared components, Web semantic tokens or Flutter theme, data loading, form validation, state management and backend business contract. Locate reusable UI before inventing new components. Read `references/feasta-implementation-map.md` and `references/brand-and-tokens.md` when relevant.
3. **Inspect Figma via MCP.** Follow `references/figma-mcp-playbook.md`. Resolve permissions, obtain exact node IDs / variants / states / assets where accessible. Never fabricate assets or claim live Figma inspection after an access error.
4. **Design critically.** Before drawing or coding, use `references/pattern-decision-guide.md`: question the necessity of every section and widget, especially cards vs tables vs charts and duplicated page information. Prefer a single clear primary action; keep high-frequency info first and defer secondary info.
5. **Produce a design decision.** For each key decision state: user task, existing evidence, alternatives, recommended pattern and rationale, effect on desktop/mobile, accessibility/validation, and impact on shared consistency. Show what is being removed, not only added.
6. **Implement only when asked.** Use FEASTA Web's existing React/Tailwind UI primitives or Flutter's shared widgets. Translate Figma layouts into responsive project-native code, map design colors to FEASTA semantic tokens, and use available icons/components already in the repo. Keep business rules in backend/domain modules.
7. **Verify.** Check visual hierarchy, functional behavior, keyboard/focus semantics, empty/loading/error/disabled states, responsivity, Web/Mobile parity where applicable, existing tests and relevant snapshots. The visual design must not hide invalid business rules.
8. **Report.** Distinguish verified facts from recommendations; list the exact files inspected/changed, visual pattern decisions, accessibility outcomes, targeted tests and skipped tests, any known live Figma limitations, and Git/deployment status.

## Mandatory visual acceptance gates

- Primary action and page purpose are clear without reading every card.
- Titles and groupings follow the user's mental model, not backend schema names.
- Information uses the most useful pattern: comparison table, task card, detail view, list, chart or form — with a reason.
- Remove duplicate counts, repeated badges, decorative panels, redundant explanations and meaningless chart embellishments.
- Apply one consistent FEASTA navigation, typography, spacing, radius, icon size, state vocabulary and formatting system.
- Informative and critical status text is not dependent on color or icon alone.
- Labels, constraints and recovery actions are present *before* a costly submit where possible.
- Visible and keyboard-accessible focus, sufficient contrast, responsive layouts, meaningful hit areas, and reduced motion.
- Every important control has deliberate loading, success, empty, error, disabled and stale-data behavior where relevant.
- No new client-side availability or authorization check is treated as the final source of truth.

## Deliverables for review-only tasks

Return a brief user goal, existing-page diagnostic, 3–7 evidence-backed findings prioritized by user impact, explicit **keep / change / remove / combine** choices, component/pattern decision table, proposed information hierarchy, next-action/error-state copy, cross-device implications, verification plan and any blockers. Avoid a generic redesign manifesto.

## Supporting references

Read only the files needed for the task:
- `references/brand-and-tokens.md`
- `references/figma-mcp-playbook.md`
- `references/feasta-implementation-map.md`
- `references/pattern-decision-guide.md`
- `references/ux-writing.md`

## Non-negotiable safeguards

No silent commits/pushes/deploys; no irreversible repository clean/reset/stash; no emulator without permission; no payment/cancellation/authorization policy change via UI work; preserve draft data, recovery and idempotency. UI validation improves guidance but cannot replace final transactional backend verification.
