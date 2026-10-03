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
  ["Phase 6 acceptance-evidence coverage", ["phase6:coverage"]],
  ["shared authentication types build and tests", ["--dir", "packages/shared-types", "test"]],
  [
    "Phase 3, Phase 4 local, Phase 5, web, Flutter, and emulator regressions",
    ["phase5:verify"],
  ],
];

function runFirestoreListenerCleanup(stage) {
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
  console.error(
    `[phase6] ${stage} Firestore listener cleanup failed: ${result.stderr.trim()}`,
  );
  return false;
}

function listeningPids() {
  if (process.platform !== "win32") return new Set();
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {encoding: "utf8"});
  if (result.status !== 0) return new Set();

  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = line.match(
      /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/u,
    );
    if (match && verificationPorts.has(Number(match[1]))) {
      pids.add(Number(match[2]));
    }
  }
  return pids;
}

function cleanupNewVerificationProcesses(before) {
  if (process.platform !== "win32") return true;
  let clean = true;
  for (const pid of listeningPids()) {
    if (before.has(pid) || pid === process.pid) continue;
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) {
      console.log(`[phase6] Cleaned verification process ${pid}.`);
    } else {
      clean = false;
      console.error(
        `[phase6] Could not clean verification process ${pid}: ${result.stderr.trim()}`,
      );
    }
  }
  return clean;
}

if (!runFirestoreListenerCleanup("preflight")) process.exit(1);

const before = listeningPids();
let passed = true;

try {
  for (const [label, args] of steps) {
    console.log(`\n[phase6] ${label}`);
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
  console.error(`\n[phase6] ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (!runFirestoreListenerCleanup("final")) passed = false;
  if (!cleanupNewVerificationProcesses(before)) passed = false;
}

if (passed) {
  console.log(
    "\n[phase6] All mandatory local Phase 6 verification steps passed. " +
      "Deployment-dependent Phase 4 gates remain outside this local command.",
  );
} else {
  process.exitCode = 1;
}
