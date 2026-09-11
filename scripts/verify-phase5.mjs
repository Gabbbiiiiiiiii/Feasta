import {spawnSync} from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const emulatorPorts = new Set([
  34400, 35001, 38080, 39099, 39199,
  44401, 44501, 44601, 44701, 44801, 44901,
  48080, 48280, 48480, 49099, 49199, 49299, 49399, 49499, 49599,
  54401, 54501, 54601, 54701, 55000, 55001, 55201,
  58080, 58280, 59099, 59199, 59299, 59399,
  60402, 60502, 60880, 62000, 62001, 62401, 62501,
]);

const steps = [
  ["shared-types build", ["--dir", "packages/shared-types", "build"]],
  ["Functions regression build", ["--dir", "functions", "build"]],
  ["web lint", ["--dir", "apps/web", "lint"]],
  ["web typecheck", ["--dir", "apps/web", "typecheck"]],
  ["web component tests", ["--dir", "apps/web", "test:components"]],
  ["web accessibility tests", ["--dir", "apps/web", "test:accessibility"]],
  ["web responsive tests", ["--dir", "apps/web", "test:responsive"]],
  ["Flutter format, analysis, widget, and semantics tests", ["phase5:flutter"]],
  ["Phase 3 regression suite", ["phase3:verify"]],
  ["Phase 4 local security regressions", ["phase4:local"]],
  ["production web build", ["--dir", "apps/web", "build"]],
  ["Phase 5 artifact coverage", ["design-system:coverage"]],
];

function listeningPids() {
  if (process.platform !== "win32") return new Set();
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {encoding: "utf8"});
  if (result.status !== 0) return new Set();
  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/u);
    if (match && emulatorPorts.has(Number(match[1]))) pids.add(Number(match[2]));
  }
  return pids;
}

function cleanupNewEmulators(before) {
  if (process.platform !== "win32") return;
  for (const pid of listeningPids()) {
    if (before.has(pid) || pid === process.pid) continue;
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) {
      console.log(`[phase5] Cleaned emulator process ${pid}.`);
    } else {
      console.warn(`[phase5] Could not clean emulator process ${pid}: ${result.stderr.trim()}`);
    }
  }
}

const before = listeningPids();
try {
  for (const [label, args] of steps) {
    console.log(`\n[phase5] ${label}`);
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
  console.log("\n[phase5] All local Phase 5 verification steps passed.");
} catch (error) {
  console.error(`\n[phase5] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  cleanupNewEmulators(before);
}
