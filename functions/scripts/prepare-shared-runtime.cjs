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
    "pack", "--json", "--pack-destination", vendorRoot,
  ], {cwd: stagingRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"]}));
  const archiveFilename = path.basename(packed.filename);
  assert.equal(archiveFilename, "feasta-shared-types-0.1.0.tgz");
  const archive = path.join(vendorRoot, archiveFilename);
  const manifest = {
    canonicalSource: "packages/shared-types",
    archive: archiveFilename,
    sha256: createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
    files: packed.files.map((file) => file.path).sort(),
  };
  fs.writeFileSync(path.join(vendorRoot, "shared-types-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Prepared vendor/${archiveFilename} (${manifest.sha256})`);

  // A file archive is installed by content, not a workspace link. Refresh it
  // before tsc so local builds/tests also use the generated runtime artifact.
  if (process.argv.includes("--install")) {
    execFileSync(process.execPath, [pnpmCli, "install", "--offline",
      "--ignore-scripts", "--config.verifyDepsBeforeRun=false", "--config.confirmModulesPurge=false",
    ], {cwd: functionsRoot, stdio: "inherit"});
  }
} finally {
  const resolved = path.resolve(temporaryRoot);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("feasta-shared-runtime-"));
  fs.rmSync(resolved, {recursive: true, force: true});
}
