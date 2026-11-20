"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname,"../src/providers/service-price.ts");
const output = ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
const compiled = new Module(filename,module);
compiled.filename=filename;
compiled.paths=Module._nodeModulePaths(path.dirname(filename));
compiled._compile(output.outputText,filename);
const {parseServicePrice}=compiled.exports;
for (const value of [null,undefined,"", "1e3", "12.34", NaN,Infinity,-1,0,499.99,500.234,10000000]) {
  test(`rejects invalid backend price ${String(value)}`, () => {
    assert.throws(() => parseServicePrice(value,"fixed"),error => error.code==="invalid-argument");
  });
}
for (const value of [500,500.29,501.01,25000.5,9999999]) {
  test(`accepts exact backend price ${value}`, () => assert.equal(parseServicePrice(value,"fixed"),value));
}
test("custom quotes do not require a numeric price", () => assert.equal(parseServicePrice(undefined,"custom_quote"),null));

test("enforces the per-guest price range", () => {
  assert.equal(parseServicePrice(150,"per_guest"),150);
  assert.equal(parseServicePrice(50000,"per_guest"),50000);
  assert.throws(() => parseServicePrice(149.99,"per_guest"));
  assert.throws(() => parseServicePrice(50000.01,"per_guest"));
});
