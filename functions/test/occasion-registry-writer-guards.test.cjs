const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");

const source = readFileSync(
  resolve(__dirname, "../src/packages/provider-package-drafts-v2.ts"),
  "utf8",
);

test("registry work follows the admission-only return", () => {
  const admission = source.indexOf("if (admissionOnly) return");
  const scopeGuard = source.indexOf("OCCASION_REGISTRY_TRANSITION_UNSUPPORTED");
  const specific = source.indexOf("const registryChanges:");
  const universal = source.indexOf("const categoryRegistryChanges:");

  assert.ok(admission >= 0);
  assert.ok(scopeGuard > admission);
  assert.ok(specific > scopeGuard);
  assert.ok(universal > specific);
});

test("specific registry reads precede writes", () => {
  const read = source.indexOf("await tx.get(ref)");
  const write = source.indexOf("for (const change of registryChanges)");

  assert.ok(read >= 0);
  assert.ok(write > read);
  assert.ok(source.includes("validOccasionDependencyEntry(data)"));
});

test("category registry reads precede writes", () => {
  const category = source.indexOf("const categoryRegistryChanges:");
  const read = source.indexOf("await tx.get(ref)", category);
  const write = source.indexOf(
    "for (const change of categoryRegistryChanges)",
  );

  assert.ok(category >= 0);
  assert.ok(read > category);
  assert.ok(write > read);
  assert.ok(source.includes("validOccasionCategoryDependencyEntry(data)"));
});

test("registry writes precede package draft write", () => {
  const specific = source.indexOf("for (const change of registryChanges)");
  const universal = source.indexOf(
    "for (const change of categoryRegistryChanges)",
  );
  const packageWrite = source.indexOf(
    "if (old) tx.update(packageRef,",
  );

  assert.ok(specific >= 0);
  assert.ok(universal > specific);
  assert.ok(packageWrite > universal);
});

test("unsupported scope and category transitions fail closed", () => {
  assert.match(
    source,
    /old\.packageData\.occasionScope !== occasion\.occasionScope/u,
  );
  assert.match(
    source,
    /old\.packageData\.serviceCategoryCode !== category/u,
  );
  assert.match(
    source,
    /OCCASION_REGISTRY_TRANSITION_UNSUPPORTED/u,
  );
});

test("universal registry is limited to all-scope drafts", () => {
  assert.match(
    source,
    /!publication &&\s*occasion\.occasionScope === "all"/u,
  );
  assert.match(
    source,
    /occasionCategoryDependencyEntryPath\(entry\)/u,
  );
  assert.match(
    source,
    /tx\.create\(change\.ref, change\.entry!\)/u,
  );
});

test("publication remains separate from registry writes", () => {
  const publication = source.indexOf("if (publication) {",
    source.indexOf("if (admissionOnly) return"));
  const registryWrites = source.indexOf(
    "for (const change of registryChanges)",
  );

  assert.ok(publication >= 0);
  assert.ok(registryWrites > publication);
  assert.match(source, /fail\("FEATURE_DISABLED"\)/u);
});
