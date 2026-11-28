import {spawnSync} from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const verificationPorts = new Set([
  34400, 35001, 38080, 39099, 39199,
  44401, 44501, 44601, 44701, 44801, 44901,
  48080, 48280, 48480, 49099, 49199, 49299, 49399, 49499, 49599,
  5000, 54401, 54501, 54601, 54701, 55000, 55001, 55201,
  58080, 58280, 59099, 59199, 59299, 59399,
  60402, 60502, 60880, 62000, 62001, 62401, 62501,
]);

const steps = [
  ["Phase 7 provider acceptance-evidence coverage", ["phase7:coverage"]],
  [
    "Phase 3-6, provider, Rules, web, Flutter, build, and emulator regressions",
    ["phase6:verify"],
  ],
];

function runExistingCleanup(stage) {
  if (process.platform !== "win32") return true;
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts/cleanup-phase6-verification.ps1",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.status === 0) return true;
  console.error(`[phase7] ${stage} cleanup failed: ${result.stderr.trim()}`);
  return false;
}

function listeners() {
  if (process.platform !== "win32") return [];
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {encoding: "utf8"});
  if (result.status !== 0) return [];
  const found = new Map();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = line.match(
      /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/u,
    );
    if (!match || !verificationPorts.has(Number(match[1]))) continue;
    found.set(`${match[1]}/${match[2]}`, {
      port: Number(match[1]),
      pid: Number(match[2]),
    });
  }
  return [...found.values()];
}

function cleanupVerificationProcesses() {
  if (process.platform !== "win32") return true;
  let clean = true;
  for (const {port, pid} of listeners()) {
    if (pid === process.pid) continue;
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) {
      console.log(`[phase7] Cleaned verification listener ${port}/${pid}.`);
    } else {
      clean = false;
      console.error(
        `[phase7] Could not clean listener ${port}/${pid}: ${result.stderr.trim()}`,
      );
    }
  }
  return clean;
}

let passed = true;
const startedAt = Date.now();

if (!runExistingCleanup("preflight")) passed = false;
if (listeners().length > 0) {
  console.error(
    "[phase7] Dedicated verification ports are not clear at preflight; " +
      "refusing to terminate an existing process.",
  );
  passed = false;
}

try {
  if (!passed) throw new Error("Preflight verification cleanup failed.");
  for (const [label, args] of steps) {
    console.log(`\n[phase7] ${label}`);
    const result = spawnSync(pnpm, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
    }
  }
} catch (error) {
  passed = false;
  console.error(`\n[phase7] ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (!runExistingCleanup("final")) passed = false;
  if (!cleanupVerificationProcesses()) passed = false;
  const remaining = listeners();
  if (remaining.length > 0) {
    passed = false;
    console.error(
      `[phase7] Verification listeners remain: ${
        remaining.map(({port, pid}) => `${port}/${pid}`).join(", ")
      }`,
    );
  }
}

const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
if (passed) {
  console.log(
    `\n[phase7] PASS in ${durationSeconds}s. All mandatory local Phase 7 ` +
      "verification steps passed and dedicated emulator ports are clear. " +
      "Deployment-dependent Phase 4 gates remain outside this local command.",
  );
} else {
  console.error(`\n[phase7] FAIL after ${durationSeconds}s.`);
  process.exitCode = 1;
}
