# Figma MCP playbook for FEASTA

## Exact original reference URLs

1. Lumo + Vaadin Design System: file `jqpuzpdBDc37TKHnkVHn1S`, user-linked node `6336:32`. https://www.figma.com/design/jqpuzpdBDc37TKHnkVHn1S/Lumo---Vaadin-Design-System--Community-?node-id=6336-32
2. Vaadin Icons: file `JqlCuduCvKBHUjF3ibZOEx`, linked node `0:1`. https://www.figma.com/design/JqlCuduCvKBHUjF3ibZOEx/Vaadin-Icons--Community-?node-id=0-1
3. Vaadin Charts: file `RgsO0wOYq1dki4FJjL0X4R`, linked node `203:28441`. https://www.figma.com/design/RgsO0wOYq1dki4FJjL0X4R/Vaadin-DS--Vaadin-Charts--Community-?node-id=203-28441
4. Official library overview: https://vaadin.com/docs/latest/components/figma

## Access precondition

At skill creation on 2026-11-19, Figma MCP returned **"don't have edit access to this file"** for all 3 public Community originals. This is a *permission restriction*, not proof that nodes are missing. **Do not invent component names, variant names, sizes, screenshots, variable values, layer IDs, or icons from inaccessible nodes.**

Recommended setup: Open each Figma Community file, duplicate it into an editable file in the user's drafts/team/project (subject to Figma's sharing and library conditions), confirm the agent's connected Figma identity can access it, and replace the `fileKey`/`nodeId` for the copies with real values. Store the mapping in a local, non-secret project note if helpful. Never mutate the public Community source or assume its imported variants are enabled automatically.

## Read-only lookup sequence

1. Confirm an authenticated Figma MCP connection. Discover the actual available tool names/schemas; do not make up a server ID. If the connector requires prerequisites, load its own skills/docs first.
2. Check `get_metadata` on the actual URL node or enumerate pages; if supported, create a read-only session first using `create_session` and reuse its `sessionId` on eligible calls.
3. For an identified button, input, table, tabs, icon, feedback state or chart component, request `get_design_context` **with screenshot included**, and `get_variable_defs` or `search_design_system` only where needed. Use `get_screenshot` when context is sparse or visual inspection is needed. Follow the MCP provider's mandatory design-to-code guidance and tool permission rules.
4. Record exact source: copied file key, node id, component/variant, screenshot date, tokens, responsive behavior, and accessibility assumptions/limitations. Use these as *pattern guidance*; translate to FEASTA semantics.
5. Inspect FEASTA's existing equivalent source and dependencies. Prefer `apps/web/src/components/*`, Tailwind semantic tokens, or Flutter core widgets. If a matching primitive exists, reuse/configure it. Only create a new primitive if the existing one cannot meet user needs.
6. Verify behavior and visual fit in FEASTA. A Figma prototype is not proof of a working form, table, gateway, availability check or chart.

## Mapping rules

- **Lumo:** layout, hierarchy, form semantics, field state patterns, management-table patterns, feedback; **not** its default palette, fonts, runtime framework or backend behavior.
- **Vaadin Icons:** choose semantically consistent icons; prefer FEASTA's existing Lucide icon usage on Web and established Flutter icon/icon asset system. Use actual SVG assets only with allowed license/asset access. Avoid mixing multiple icon families on the same page.
- **Vaadin Charts:** assess whether a chart serves a question. FEASTA Web already uses Recharts and `components/data/chart-container.tsx`; implement there, not through an unnecessary Vaadin Charts dependency. Display units, date range, filters, zero baseline when appropriate, visible legends, a text summary and a data-table alternative for exact values.

## Failure protocol

If inaccessible: report **"Figma MCP reference unavailable: permission"**, use the official Vaadin overview and project-native source as provisional guidance, ask for a copy key only when needed for high-fidelity asset work, and continue with evidence-based page audit. Do **not** claim a pixel-accurate Figma match or source-derived variant. No write/modify tools are authorized merely to inspect a design system.
