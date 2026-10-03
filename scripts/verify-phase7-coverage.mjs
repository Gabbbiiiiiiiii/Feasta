import {existsSync, readFileSync} from "node:fs";

const acceptancePath = "docs/phase-7-acceptance.md";
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const acceptance = readFileSync(acceptancePath, "utf8");

const requiredScripts = [
  "phase7:verify",
  "phase7:coverage",
  "phase6:verify",
  "phase5:verify",
  "phase4:local",
  "phase3:verify",
  "emulator:provider-workflow:test",
];

for (const script of requiredScripts) {
  if (!packageJson.scripts?.[script]) {
    throw new Error(`Missing required package script: ${script}`);
  }
}

const requiredFiles = [
  "packages/shared-types/src/provider.ts",
  "packages/shared-types/test/provider.test.mjs",
  "apps/customer_mobile/lib/core/domain/provider_onboarding.dart",
  "apps/customer_mobile/test/core/domain/provider_onboarding_test.dart",
  "apps/web/src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
  "apps/web/src/app/provider/status/page.tsx",
  "apps/web/src/components/admin/provider-verification/provider-verification-queue.tsx",
  "apps/web/src/components/admin/provider-verification/provider-verification-review-panel.tsx",
  "apps/web/src/lib/admin/provider-verification/secure-provider-file.ts",
  "apps/web/test/provider-onboarding-flow.test.mts",
  "apps/web/test/provider-review-security.test.mts",
  "apps/web/test/provider-verification-queue.test.mts",
  "apps/web/test/unapproved-provider-permissions.test.mts",
  "functions/src/providers/register-provider.ts",
  "functions/src/providers/save-provider-onboarding-draft.ts",
  "functions/src/verification/register-verification-document.ts",
  "functions/src/verification/remove-verification-document.ts",
  "functions/src/verification/submit-provider-verification.ts",
  "functions/src/verification/review-provider-verification.ts",
  "functions/src/shared/verification-history.ts",
  "functions/test/provider-onboarding-model.test.cjs",
  "functions/test/provider-review-security.test.cjs",
  "functions/test/provider-visibility.test.cjs",
  "functions/test/verification-document-workflow.test.cjs",
  "functions/test/rules/firestore.rules.test.cjs",
  "functions/test/rules/storage.rules.test.cjs",
  "functions/test/emulator/provider-workflow.integration.mjs",
  "docs/phase-7-provider-onboarding-verification.md",
  "docs/phase-7-acceptance.md",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing mandatory Phase 7 evidence file: ${file}`);
  }
}

for (let criterion = 1; criterion <= 31; criterion += 1) {
  const row = acceptance
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`| ${criterion} |`));
  if (!row) {
    throw new Error(`Missing Phase 7 evidence row ${criterion}.`);
  }
  if (!row.includes("| PASS")) {
    throw new Error(`Phase 7 evidence row ${criterion} is not marked PASS.`);
  }
}

const requiredStatements = [
  "pnpm phase7:verify",
  "Phase 6 composition",
  "provider becomes publicly discoverable",
  "unapproved provider",
  "no privileged path is skipped",
  "Deployment-dependent Phase 4",
  "App Check",
  "verification cleanup",
];

for (const statement of requiredStatements) {
  if (!acceptance.toLowerCase().includes(statement.toLowerCase())) {
    throw new Error(`Missing Phase 7 acceptance statement: ${statement}`);
  }
}

console.log("Phase 7 acceptance evidence coverage passed: 31/31 criteria documented.");
