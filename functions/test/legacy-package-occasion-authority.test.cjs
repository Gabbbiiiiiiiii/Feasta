const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const sourcePath = path.resolve(
  __dirname,
  "../src/packages/legacy-package-occasion-authority.ts",
);

const source = fs.readFileSync(sourcePath, "utf8");

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function fixture({
  catalog = {activationState: "stable", revision: 3},
  occasion = {
    id: "birthday",
    moderationState: "approved",
    active: true,
    applicableServiceCategoryCodes: ["catering_service"],
  },
} = {}) {
  const reads = [];
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {path: `${name}/${id}`};
        },
      };
    },
  };

  const tx = {
    async get(ref) {
      reads.push(ref.path);
      return {
        data() {
          if (ref.path === "occasionCatalog/current") return catalog;
          if (ref.path === "occasions/birthday") return occasion;
          return undefined;
        },
      };
    },
  };

  class HttpsError extends Error {
    constructor(code, message, details) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "firebase-functions/v2/https") {
        return {HttpsError};
      }
      if (name === "../shared/firestore.js") {
        return {db};
      }
      if (name === "./occasion-publication-generation.js") {
        return {
          stableOccasionPublicationGeneration(value) {
            return value?.activationState === "stable" &&
              Number.isSafeInteger(value?.revision) ?
              value.revision : null;
          },
          activeOccasionAuthority(value, eventType, category) {
            return value?.id === eventType &&
              value?.moderationState === "approved" &&
              value?.active === true &&
              value?.applicableServiceCategoryCodes?.includes(category);
          },
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  return {
    check: exports.requireLegacyPackageOccasionAuthority,
    tx,
    reads,
  };
}

test("valid occasion passes after both authority reads", async () => {
  const f = fixture();
  await f.check(f.tx, "birthday", "catering_service");
  assert.deepEqual(f.reads, [
    "occasionCatalog/current",
    "occasions/birthday",
  ]);
});

test("inactive occasion blocks legacy package writes", async () => {
  const f = fixture({occasion: {
    id: "birthday",
    moderationState: "approved",
    active: false,
    applicableServiceCategoryCodes: ["catering_service"],
  }});
  await assert.rejects(
    f.check(f.tx, "birthday", "catering_service"),
    error => error.details?.reason === "OCCASION_UNAVAILABLE",
  );
});

test("category mismatch blocks legacy package writes", async () => {
  const f = fixture();
  await assert.rejects(
    f.check(f.tx, "birthday", "photography"),
    error => error.details?.reason === "OCCASION_UNAVAILABLE",
  );
});

test("unstable catalog blocks before occasion read", async () => {
  const f = fixture({catalog: {activationState: "transitioning", revision: 3}});
  await assert.rejects(
    f.check(f.tx, "birthday", "catering_service"),
    error => error.details?.reason === "OCCASION_CATALOG_UNAVAILABLE",
  );
  assert.deepEqual(f.reads, ["occasionCatalog/current"]);
});

test("missing occasion blocks legacy package writes", async () => {
  const f = fixture({occasion: null});
  await assert.rejects(
    f.check(f.tx, "birthday", "catering_service"),
    error => error.details?.reason === "OCCASION_UNAVAILABLE",
  );
});