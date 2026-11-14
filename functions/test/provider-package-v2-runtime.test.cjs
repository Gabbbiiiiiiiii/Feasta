const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createHash} = require("node:crypto");
const {createRequire} = require("node:module");

const functionsRoot = path.resolve(__dirname, "..");
const installedRoot = path.join(functionsRoot, "node_modules/@feasta/shared-types");

test("Functions installed V2 contract subpath loads through require and import", async () => {
  const resolved = require.resolve("@feasta/shared-types/provider-package-v2");
  // pnpm may symlink the direct dependency into the workspace's shared store.
  // Require the declared Functions dependency, never an ancestor/workspace fallback.
  assert.equal(fs.realpathSync(resolved),
    fs.realpathSync(path.join(installedRoot, "dist/provider-package-v2.cjs")));
  const metadata = JSON.parse(fs.readFileSync(path.join(installedRoot, "package.json"), "utf8"));
  assert.equal(metadata.name, "@feasta/shared-types");
  assert.deepEqual(metadata.exports["./provider-package-v2"], {
    types: "./dist/provider-package-v2.d.cts",
    import: "./dist/provider-package-v2.cjs",
    require: "./dist/provider-package-v2.cjs",
  });
  const contract = require("@feasta/shared-types/provider-package-v2");
  assert.equal((await import("@feasta/shared-types/provider-package-v2")).default, contract);
  assert.deepEqual(Object.keys(contract), []);
  const declaration = fs.readFileSync(resolved.replace(/\.cjs$/, ".d.cts"), "utf8");
  assert.match(declaration, /export type CreateProviderPackageV2Request/);
  assert.match(declaration, /export interface CompletePackageEditorDraftResponse/);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../vendor/shared-types-manifest.json"), "utf8"));
  assert.ok(manifest.files.includes("dist/provider-package-v2.cjs"));
  assert.ok(manifest.files.includes("dist/provider-package-v2.d.cts"));
  const archive = fs.readFileSync(path.join(__dirname, "../vendor", manifest.archive));
  const functionsPackage = JSON.parse(fs.readFileSync(path.join(functionsRoot, "package.json"), "utf8"));
  assert.equal(functionsPackage.dependencies["@feasta/shared-types"], `file:vendor/${manifest.archive}`);
  assert.equal(createHash("sha256").update(archive).digest("hex"), manifest.sha256);
  // Retain provenance verification: a valid path alone must not accept stale or
  // workspace-linked build output. Read the existing archive without extracting/installing.
  const tar = createRequire(require.resolve("firebase-tools/package.json"))("tar");
  const expected = new Set(["package.json", "dist/provider-package-v2.cjs", "dist/provider-package-v2.d.cts"]);
  const seen = new Set();
  const contents = new Map();
  await tar.t({file: path.join(__dirname, "../vendor", manifest.archive), onReadEntry(entry) {
    const relative = entry.path.replace(/^package\//u, "");
    if (!expected.has(relative)) return;
    assert.ok(!seen.has(relative), `Duplicate archive entry: ${relative}`);
    seen.add(relative);
    const chunks = [];
    entry.on("data", (chunk) => chunks.push(chunk));
    entry.on("end", () => contents.set(relative, Buffer.concat(chunks)));
  }});
  assert.deepEqual(seen, expected);
  for (const relative of expected) {
    assert.deepEqual(contents.get(relative), fs.readFileSync(path.join(installedRoot, relative)),
      `Installed file differs from archive: ${relative}`);
  }
  const integrity = "sha512-" + createHash("sha512").update(archive).digest("base64");
  for (const [lock, relative] of [["../pnpm-lock.yaml", "vendor"], ["../../pnpm-lock.yaml", "functions/vendor"]]) {
    const line = fs.readFileSync(path.join(__dirname, lock), "utf8").split(/\r?\n/)
      .find((line) => line.includes(`tarball: file:${relative}/${manifest.archive}`));
    assert.ok(line?.includes(`integrity: ${integrity},`), `${lock} pins the generated local archive`);
  }
});
