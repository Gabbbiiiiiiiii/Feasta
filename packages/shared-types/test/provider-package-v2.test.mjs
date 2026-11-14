import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import ts from "typescript";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("V2 subpath resolves from ESM and CommonJS without importing Firebase", async () => {
  const require = createRequire(import.meta.url);
  assert.match(require.resolve("@feasta/shared-types/provider-package-v2"), /provider-package-v2\.cjs$/);
  const cjs = require("@feasta/shared-types/provider-package-v2");
  const esm = await import("@feasta/shared-types/provider-package-v2");
  assert.equal(esm.default, cjs);
  assert.equal(Object.keys(cjs).length, 0, "Contracts have no runtime side effects or activation exports");
});

for (const [name, options, fixtures] of [
  ["Web bundler", {module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler}, ["mts"]],
  ["Firebase CommonJS", {module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10}, ["cts"]],
  ["NodeNext", {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext}, ["mts", "cts"]],
]) {
  test(`${name} resolves V2 declarations and preserves strict contract shapes`, () => {
    // Node10 resolution has no package self-reference support. Exercise an installed
    // consumer layout, as Functions does, instead of adding a paths alias.
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "feasta-v2-types-"));
    try {
      const installed = path.join(temp, "node_modules/@feasta/shared-types");
      fs.mkdirSync(installed, {recursive: true});
      fs.copyFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), path.join(installed, "package.json"));
      fs.cpSync(fileURLToPath(new URL("../dist", import.meta.url)), path.join(installed, "dist"), {recursive: true});
      fs.writeFileSync(path.join(temp, "package.json"), '{"type":"module"}');
      const roots = fixtures.map((ext) => {
        const target = path.join(temp, `consumer.${ext}`);
        fs.copyFileSync(fileURLToPath(new URL(`./fixtures/provider-package-v2.${ext}`, import.meta.url)), target);
        return target;
      });
      const program = ts.createProgram(roots, {
        ...options, target: ts.ScriptTarget.ES2022, noEmit: true, strict: true,
        exactOptionalPropertyTypes: true, skipLibCheck: true, types: [],
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (f) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n",
      }));
    } finally {
      fs.rmSync(temp, {recursive: true, force: true});
    }
  });
}
