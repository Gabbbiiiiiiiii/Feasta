import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  {encoding: "utf8"},
).split(/\r?\n/u).filter(Boolean);

const rules = [
  ["private key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"private_key"\s*:/u],
  ["PayMongo secret key", /sk_(?:live|test)_[A-Za-z0-9_-]{8,}/u],
  ["webhook secret", /whsec_[A-Za-z0-9_-]{8,}/u],
  ["service-account credential", /"type"\s*:\s*"service_account"|iam\.gserviceaccount\.com/u],
  ["bearer/JWT token", /Bearer\s+[A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u],
  ["Google API key", /AIza[0-9A-Za-z_-]{20,}/u],
  ["App Check debug token", /(?:FIREBASE_APPCHECK_DEBUG_TOKEN|appCheckDebugToken)\s*[:=]\s*["'][^"']{8,}["']/iu],
  ["API/access token", /(?:api[_-]?token|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9._-]{12,}["']/iu],
  ["hardcoded password", /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/iu],
];

const allowedPublicGoogleConfig = new Set([
  "apps/customer_mobile/android/app/google-services.json",
  "apps/customer_mobile/lib/firebase_options.dart",
]);
const allowedDevelopmentPasswords = /^(?:scripts\/seed-emulators\.ts|functions\/test\/)/u;
const findings = [];

for (const file of files) {
  if (file === "scripts/scan-secrets.mjs") continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;
  for (const [type, pattern] of rules) {
    if (!pattern.test(content)) continue;
    const allowed =
      (type === "Google API key" && allowedPublicGoogleConfig.has(file)) ||
      (type === "hardcoded password" && allowedDevelopmentPasswords.test(file));
    findings.push({file, type, allowed});
  }
}

if (findings.length === 0) {
  console.log("Secret scan passed: no credential patterns found.");
} else {
  console.log("Secret scan findings (values intentionally omitted):");
  for (const finding of findings) {
    console.log(`- ${finding.file}: ${finding.type} (${finding.allowed ? "approved public/test fixture" : "BLOCKED"})`);
  }
}

const blocked = findings.filter((finding) => !finding.allowed);
if (blocked.length > 0) {
  console.error(`Secret scan failed: ${blocked.length} blocked finding(s).`);
  process.exitCode = 1;
} else {
  console.log("Secret scan passed.");
}
