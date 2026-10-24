// Canonical source: packages/shared-types. Only the generated archive is uploaded.
const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const {createHash} = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const functionsRoot = path.resolve(__dirname, "..");
const sharedRoot = path.resolve(functionsRoot, "../packages/shared-types");
const vendorRoot = path.join(functionsRoot, "vendor");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feasta-shared-runtime-"));
const stagingRoot = path.join(temporaryRoot, "package");
const pnpmCli = process.env.npm_execpath;

try {
  assert.ok(pnpmCli, "Run package preparation through pnpm.");
  fs.mkdirSync(stagingRoot);
  const canonical = JSON.parse(fs.readFileSync(path.join(sharedRoot, "package.json"), "utf8"));
  const {name, version, private: privatePackage, type, main, types, exports, typesVersions} = canonical;
  const metadata = {name, version, private: privatePackage, type, main, types, exports, typesVersions};
  assert.equal(metadata.name, "@feasta/shared-types");
  assert.equal(metadata.private, true);
  fs.writeFileSync(path.join(stagingRoot, "package.json"), JSON.stringify(metadata, null, 2) + "\n");
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"),
    "-p", path.join(sharedRoot, "tsconfig.json"),
    "--outDir", path.join(stagingRoot, "dist"), "--sourceMap", "false", "--declarationMap", "false",
  ], {stdio: "inherit"});
  fs.mkdirSync(vendorRoot, {recursive: true});
  const packed = JSON.parse(execFileSync(process.execPath, [pnpmCli,
    "pack", "--json", "--pack-destination", temporaryRoot,
  ], {cwd: stagingRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"]}));
  const archiveFilename = path.basename(packed.filename);
  assert.equal(archiveFilename, "feasta-shared-types-0.1.0.tgz");
  const archive = path.join(vendorRoot, archiveFilename);
  // Pack to a fresh temporary file before replacing the local dependency archive.
  // In particular, pnpm must not open its currently installed file: source for output.
  fs.copyFileSync(path.join(temporaryRoot, archiveFilename), archive);
  const manifest = {
    canonicalSource: "packages/shared-types",
    archive: archiveFilename,
    sha256: createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
    files: packed.files.map((file) => file.path).sort(),
  };
  fs.writeFileSync(path.join(vendorRoot, "shared-types-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Prepared vendor/${archiveFilename} (${manifest.sha256})`);

  // This locally generated archive deliberately retains its package version.
  // Refresh only its exact file: entries; registry dependency integrity stays pinned.
  const integrity = "sha512-" + createHash("sha512").update(fs.readFileSync(archive)).digest("base64");
  for (const [lockPath, relativeArchive] of [
    [path.join(functionsRoot, "pnpm-lock.yaml"), `vendor/${archiveFilename}`],
    [path.join(functionsRoot, "../pnpm-lock.yaml"), `functions/vendor/${archiveFilename}`],
  ]) {
    const lock = fs.readFileSync(lockPath, "utf8");
    const escaped = relativeArchive.replace(/\./g, "\\.");
    const pattern = new RegExp(
      `(^  '@feasta/shared-types@file:${escaped}':\\r?\\n    resolution: \\{integrity: )` +
      `sha512-[A-Za-z0-9+/=]+(, tarball: file:${escaped}\\})`, "gm",
    );
    assert.equal([...lock.matchAll(pattern)].length, 1, `Expected one local archive entry in ${lockPath}`);
    const updated = lock.replace(pattern, (_, prefix, suffix) => prefix + integrity + suffix);
    if (updated !== lock) fs.writeFileSync(lockPath, updated);
  }

  // A file archive is installed by content, not a workspace link. Refresh it
  // before tsc so local builds/tests also use the generated runtime artifact.
  if (process.argv.includes("--install")) {
    // Functions ships its own file archive. Do not join the parent workspace:
    // that can replace the standalone install layout and bypass this archive.
    execFileSync(process.execPath, [pnpmCli, "install", "--offline", "--ignore-workspace", "--frozen-lockfile",
      "--ignore-scripts", "--config.verifyDepsBeforeRun=false", "--config.confirmModulesPurge=false",
    ], {cwd: functionsRoot, stdio: "inherit"});
  }
} finally {
  const resolved = path.resolve(temporaryRoot);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("feasta-shared-runtime-"));
  fs.rmSync(resolved, {recursive: true, force: true});
}
