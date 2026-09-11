import {readFileSync} from "node:fs";

const matrix = readFileSync("docs/security/adversarial-test-matrix.md", "utf8");
const required = [
  "Unauthenticated access to protected data",
  "Customer acts as provider",
  "Customer acts as admin",
  "Provider acts as admin",
  "User changes own role",
  "User changes own blocked status",
  "Missing Firestore profile",
  "Disabled Firebase Auth user",
  "Revoked session",
  "Expired session",
  "Customer reads another customer profile",
  "Customer reads another customer booking",
  "Provider reads unassigned booking/request",
  "Provider edits another provider",
  "Non-admin reads admin logs",
  "Public reads inactive provider",
  "Deleted provider appears publicly",
  "Provider approves itself",
  "Provider modifies submitted verification",
  "Provider replaces document while under review",
  "Other provider reads private verification document",
  "Customer reads verification document",
  "Invalid verification file upload",
  "Oversized verification upload",
  "Client sets paid",
  "Client changes amount",
  "Invalid webhook signature",
  "Replayed webhook",
  "Wrong currency",
  "Wrong booking ID",
  "Duplicate payment creation",
  "CSRF mutation",
  "Disallowed origin",
  "Open redirect",
  "Missing session cookie",
  "Tampered cookie",
  "Customer opens admin route",
  "Provider opens admin route",
  "Admin SDK imported client-side",
  "CSP blocks unexpected script origin",
  "Rapid Maps calls",
  "Rapid verification submission",
  "Duplicate provider registration",
  "Duplicate admin approval",
  "Replayed callable request",
];

const missing = required.filter((scenario) => !matrix.includes(`| ${scenario} |`));
if (missing.length > 0) {
  console.error(`Phase 4 coverage is missing ${missing.length} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Phase 4 adversarial coverage manifest passed: ${required.length} scenarios.`);
}
