// Package with Firebase's own upload routine, then install and start in isolation.
// No deployment, credentials, network requests to Firebase, or handlers invoked.
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const {createHash} = require("node:crypto");
const {createRequire} = require("node:module");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const root = path.resolve(__dirname, "../..");
  const config = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8")).functions[0];
  const source = path.resolve(root, config.source);
  assert.equal(source, path.join(root, "functions"));
  const firebaseRequire = createRequire(require.resolve("firebase-tools/package.json"));
  const {prepareFunctionsUpload} = firebaseRequire("./lib/deploy/functions/prepareFunctionsUpload.js");
  const tar = firebaseRequire("tar");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feasta-deployment-runtime-"));
  let upload;
  try {
    upload = await prepareFunctionsUpload(root, source, {...config, ignore: [...config.ignore]}, [],
      undefined, {exportType: "tar.gz"});
    await tar.x({file: upload.pathToSource, cwd: temporaryRoot});
    assert.ok(!temporaryRoot.startsWith(root + path.sep));
    assert.ok(!fs.existsSync(path.resolve(temporaryRoot, "../packages/shared-types")));
    assert.ok(!fs.existsSync(path.join(temporaryRoot, "node_modules")));
    const metadata = JSON.parse(fs.readFileSync(path.join(temporaryRoot, "package.json"), "utf8"));
    assert.equal(metadata.dependencies["@feasta/shared-types"], "file:vendor/feasta-shared-types-0.1.0.tgz");
    const archive = path.join(temporaryRoot, metadata.dependencies["@feasta/shared-types"].slice(5));
    assert.ok(fs.lstatSync(archive).isFile());
    const manifest = JSON.parse(fs.readFileSync(path.join(temporaryRoot, "vendor/shared-types-manifest.json"), "utf8"));
    assert.equal(createHash("sha256").update(fs.readFileSync(archive)).digest("hex"), manifest.sha256);
    console.log(`Firebase upload includes vendor/${manifest.archive} (${manifest.files.length} package files, SHA-256 ${manifest.sha256}).`);
    assert.ok(process.env.npm_execpath, "Run this check through pnpm.");
    const env = {...process.env, NODE_PATH: "", GCLOUD_PROJECT: "demo-feasta-packaging",
      FIREBASE_CONFIG: JSON.stringify({projectId: "demo-feasta-packaging"})};
    delete env.GOOGLE_APPLICATION_CREDENTIALS;
    const run = (args) => {
      const result = spawnSync(process.execPath, args, {cwd: temporaryRoot, env, stdio: "inherit"});
      if (result.error) throw result.error;
      assert.equal(result.status, 0, "Isolated runtime command failed");
    };
    run([process.env.npm_execpath, "install", "--prod", "--frozen-lockfile", "--ignore-scripts",
      "--config.verifyDepsBeforeRun=false"]);
    run(["--input-type=commonjs", "-e", `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const path = require('node:path');
      const resolved = fs.realpathSync(require.resolve('@feasta/shared-types/documents'));
      assert.ok(resolved.startsWith(process.cwd() + path.sep), resolved);
      const policy = require('@feasta/shared-types/documents');
      assert.equal(typeof policy.resolveVerificationDocumentPolicy, 'function');
      const constants = require('./lib/shared/constants.js');
      assert.equal(constants.verificationDocumentRequirement, policy.verificationDocumentRequirement);
      const entry = require('./lib/index.js');
      assert.equal(typeof entry.reviewProviderVerification, 'function');
      import('@feasta/shared-types').then(shared => {
        assert.equal(shared.verificationDocumentRequirement, policy.verificationDocumentRequirement);
        console.log('PASS: shared documents resolve inside isolated upload; constants and lib/index.js load; root ESM export loads.');
      }).catch(error => {console.error(error); process.exitCode = 1;});
    `]);
  } finally {
    const resolved = path.resolve(temporaryRoot);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("feasta-deployment-runtime-"));
    fs.rmSync(resolved, {recursive: true, force: true});
    if (upload) fs.unlinkSync(upload.pathToSource);
  }
}

main().catch((error) => {console.error(error); process.exitCode = 1;});
