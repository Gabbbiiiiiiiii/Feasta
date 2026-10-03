import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";

const requiredFiles = [
  "apps/customer_mobile/lib/core/theme/app_theme.dart",
  "apps/customer_mobile/lib/core/widgets/widgets.dart",
  "apps/customer_mobile/test/core/widgets/feasta_primitives_test.dart",
  "apps/customer_mobile/test/core/widgets/responsive_layout_test.dart",
  "apps/web/src/app/globals.css",
  "apps/web/src/components/ui/button.tsx",
  "apps/web/src/components/layout/application-shell.tsx",
  "apps/web/test/components/accessibility-hardening.test.tsx",
  "apps/web/test/components/responsive-layout.test.tsx",
  "docs/design-system-component-inventory.md",
  "docs/phase-5-design-system.md",
];

for (const file of requiredFiles) {
  assert.ok(existsSync(file), `Missing Phase 5 artifact: ${file}`);
}

const documentation = readFileSync("docs/phase-5-design-system.md", "utf8");
const requiredSections = [
  "## Color tokens",
  "## Typography hierarchy",
  "## Spacing rules",
  "## Shape, borders, and elevation",
  "## Responsive breakpoints",
  "## Flutter shared primitives",
  "## Next.js shared primitives",
  "## Component usage examples",
  "## Application-state policies",
  "## Component do and don't examples",
  "## Migration guidelines",
  "## Phase 5 verification",
  "## Known limitations",
  "## Phase 5 checklist",
];

for (const heading of requiredSections) {
  assert.match(documentation, new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "mu"));
}

assert.match(documentation, /pnpm phase5:verify/u);
assert.match(documentation, /[Dd]eployment-dependent App Check/u);
console.log(`Phase 5 artifact and documentation coverage passed: ${requiredFiles.length} files, ${requiredSections.length} sections.`);
