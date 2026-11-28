import {readFileSync} from "node:fs";

const acceptancePath = "docs/phase-6-acceptance.md";
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const acceptance = readFileSync(acceptancePath, "utf8");

const requiredScripts = [
  "phase6:verify",
  "phase6:coverage",
  "phase5:verify",
  "phase4:local",
  "phase3:verify",
  "emulator:tooling:test",
  "emulator:auth-web:test",
];

for (const script of requiredScripts) {
  if (!packageJson.scripts?.[script]) {
    throw new Error(`Missing required package script: ${script}`);
  }
}

for (let criterion = 1; criterion <= 52; criterion += 1) {
  const row = acceptance
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`| ${criterion} |`));
  if (!row) {
    throw new Error(`Missing Phase 6 evidence row ${criterion} in ${acceptancePath}.`);
  }
  if (!row.includes("| PASS")) {
    throw new Error(`Phase 6 evidence row ${criterion} is not marked PASS.`);
  }
}

const requiredStatements = [
  "Deployment-dependent",
  "App Check",
  "pnpm phase6:verify",
  "53",
  "verification cleanup",
  "not required for local PASS",
];

for (const statement of requiredStatements) {
  if (!acceptance.includes(statement)) {
    throw new Error(`Missing acceptance statement: ${statement}`);
  }
}

console.log("Phase 6 acceptance evidence coverage passed: 52/52 criteria documented.");
