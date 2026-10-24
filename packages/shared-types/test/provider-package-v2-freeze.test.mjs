import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import ts from "typescript";

test("Phase 1 definitions preserve the frozen contract's exact fields and unions", () => {
  const spec = readFileSync(new URL("../../../docs/provider-package-shared-contract-v2-draft.md", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(spec).digest("hex"),
    "cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06");
  const blocks = [...spec.matchAll(/```typescript\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  const source = readFileSync(new URL("../src/provider-package-v2.cts", import.meta.url), "utf8");
  const parse = (text) => ts.createSourceFile("contract.ts", text, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({removeComments: true});
  const normalize = (node, file) => printer.printNode(ts.EmitHint.Unspecified, node, file)
    .replace(/^export\s+/, "").replace(/\s/g, "");
  const actual = parse(source);
  const definitions = new Map(actual.statements.filter((s) => s.name).map((s) => [s.name.text, normalize(s, actual)]));
  for (const index of [0, 2, 3, 6, 7]) {
    const expected = parse(blocks[index]);
    for (const statement of expected.statements) {
      if (statement.name) assert.equal(definitions.get(statement.name.text), normalize(statement, expected), statement.name.text);
    }
  }
  const packageExtensions = parse(blocks[4]);
  for (const statement of packageExtensions.statements) {
    // The pre-existing app input is mirrored locally to avoid a shared -> app dependency.
    if (statement.name && statement.name.text !== "ExistingPackageWriteInput") {
      assert.equal(definitions.get(statement.name.text), normalize(statement, packageExtensions), statement.name.text);
    }
  }
});
