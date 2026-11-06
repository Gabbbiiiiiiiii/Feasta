const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../node_modules/typescript");

const sourcePath = path.resolve(
  __dirname,
  "../src/packages/provider-package-editor-progress.ts",
);

const source = fs.readFileSync(sourcePath, "utf8");

// Read the real collection names instead of guessing them.
function readCollection(name) {
  const pattern = new RegExp(
    `const\\s+${name}\\s*=\\s*["']([^"']+)["']`,
  );

  const matches = [...source.matchAll(
    new RegExp(pattern.source, "g"),
  )];

  assert.equal(
    matches.length,
    1,
    `Expected one collection constant: ${name}`,
  );

  return matches[0][1];
}

const collections = {
  DRAFTS: readCollection("DRAFTS"),
  QUOTAS: readCollection("QUOTAS"),
  OPERATIONS: readCollection("OPERATIONS"),
};

assert.equal(
  collections.DRAFTS,
  "providerPackageEditorDrafts",
);

// Do not assume the other collection names.
// They must be sourced from the actual implementation.
for (const name of ["QUOTAS", "OPERATIONS"]) {
  assert.ok(collections[name].length > 0);
}

function loadActualDiscard(dependencies) {
  const parsed = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  const matches = parsed.statements.filter((statement) =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(
      (declaration) =>
        ts.isIdentifier(declaration.name) &&
        declaration.name.text ===
          "discardProviderPackageEditorDraft",
    ),
  );

  assert.equal(matches.length, 1);

  const declaration = matches[0]
    .getText(parsed)
    .replace(/^export\s+/, "");

  const compiled = ts.transpileModule(
    declaration +
      "\nmodule.exports = {discardProviderPackageEditorDraft};\n",
    {
      fileName: "discard-isolated.ts",
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    },
  );

  const errors = (compiled.diagnostics || []).filter(
    (diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error,
  );

  assert.equal(errors.length, 0);

  const module = {exports: {}};

  vm.runInNewContext(
    compiled.outputText,
    {
      ...dependencies,
      module,
      exports: module.exports,
      console,
    },
    {filename: "discard-isolated.js"},
  );

  const handler =
    module.exports.discardProviderPackageEditorDraft;

  assert.equal(typeof handler, "function");

  return handler;
}

class MockHttpsError extends Error {
  constructor(reason, code = "failed-precondition") {
    super(reason);
    this.code = code;
  }
}

function fail(reason, code) {
  throw new MockHttpsError(reason, code);
}

function ref(name) {
  return {
    name,
    doc(id) {
      return ref(`${name}/${id}`);
    },
    collection(id) {
      return ref(`${name}/${id}`);
    },
    limit(count) {
      return {name, query: true, count};
    },
  };
}

const input = {
  editorDraftId: "draft_1",
  expectedRevision: 3,
  idempotencyKey: "discard_key_1",
};

function digest(value) {
  return JSON.stringify(value);
}

function fixture(options = {}) {
  const calls = {
    reads: [],
    writes: [],
    transactions: 0,
    mediaQueries: 0,
  };

  const request = {
    auth: options.noAuth ? null : {uid: "user_1"},
    app: {},
    data: {...input},
  };

  const draftPath =
    `${collections.DRAFTS}/${input.editorDraftId}`;

  const quotaPath =
    `${collections.QUOTAS}/provider_1`;

  const operationId = digest([
    "user_1",
    "discardProviderPackageEditorDraft",
    input.idempotencyKey,
  ]);

  const operationPath =
    `${collections.OPERATIONS}/${operationId}`;

  const mediaPath =
    `${draftPath}/mediaAssets`;

  const db = {
    collection(name) {
      return ref(name);
    },
    doc(name) {
      return ref(name);
    },
    async runTransaction(callback) {
      calls.transactions += 1;

      const tx = {
        async get(reference) {
          calls.reads.push(reference.name);

          if (reference.query) {
            assert.ok([mediaPath, `${draftPath}/mediaUploadReservations`]
              .includes(reference.name));
            assert.equal(reference.count, 1);

            calls.mediaQueries += 1;

            if (options.mediaReadFails) {
              throw new Error("MEDIA_QUERY_UNAVAILABLE");
            }

            const present = reference.name === mediaPath ?
              options.hasMedia : options.hasReservation;
            return {empty: !present, size: present ? 1 : 0};
          }

          let data;

          if (reference.name === operationPath) {
            data = options.priorOperation ? {
              actorUid: "user_1",
              providerId: "provider_1",
              requestHash: digest(input),
            } : undefined;
          } else if (reference.name === draftPath) {
            data = {
              ownerUid: options.otherOwner ?
                "other_user" : "user_1",
              providerId: "provider_1",
              editorSchemaVersion: 2,
              state: "incomplete",
              packageId: null,
              basePackageRevision: null,
              revision: options.staleRevision ? 4 : 3,
            };
          } else if (reference.name === quotaPath) {
            data = {
              count: options.invalidQuota ? 0 : 2,
            };
          } else {
            throw new Error(
              `Unexpected Firestore read: ${reference.name}`,
            );
          }

          return {
            exists: data !== undefined,
            data() {
              return data;
            },
          };
        },

        delete(reference) {
          calls.writes.push({
            action: "delete",
            path: reference.name,
          });
        },

        update(reference, data) {
          calls.writes.push({
            action: "update",
            path: reference.name,
            data,
          });
        },

        create(reference, data) {
          calls.writes.push({
            action: "create",
            path: reference.name,
            data,
          });
        },
      };

      return callback(tx);
    },
  };

  const dependencies = {
    onCall(_settings, handler) {
      return handler;
    },

    appCheckCallableOptions: {},

    requireAuth(currentRequest) {
      if (!currentRequest.auth) {
        fail("UNAUTHENTICATED", "unauthenticated");
      }

      return currentRequest.auth;
    },

    enforceAppCheck() {},

    async requireRole() {
      if (options.wrongRole) {
        fail("PERMISSION_DENIED", "permission-denied");
      }
    },

    USER_ROLES: {provider: "provider"},

    async enforceCallableRateLimit() {},

    parseDiscardEditorProgress(value) {
      if (
        value.editorDraftId !== input.editorDraftId ||
        value.expectedRevision !== input.expectedRevision ||
        value.idempotencyKey !== input.idempotencyKey
      ) {
        fail("INVALID_EDITOR_PROGRESS", "invalid-argument");
      }

      return value;
    },

    async beginEditorDraftMediaDiscardV1() { fail("EDITOR_DRAFT_MEDIA_CLEANUP_REQUIRED"); },
    mapInputFailure(error) {
      throw error;
    },

    digest,
    db,

    DRAFTS: collections.DRAFTS,
    QUOTAS: collections.QUOTAS,
    OPERATIONS: collections.OPERATIONS,

    MAX_PRIVATE_DRAFTS: 20,

    async authorizedProvider() {
      return "provider_1";
    },

    requireOwnPrivateDraft(draft, uid, providerId) {
      if (
        !draft ||
        draft.ownerUid !== uid ||
        draft.providerId !== providerId ||
        draft.state !== "incomplete"
      ) {
        fail("RESOURCE_NOT_FOUND", "not-found");
      }
    },

    Timestamp: {
      now() {
        return "test_timestamp";
      },
    },

    fail,
  };

  const handler = loadActualDiscard(dependencies);

  return {
    calls,
    paths: {draftPath, quotaPath, operationPath, mediaPath},
    run: () => handler(request),
  };
}

test("empty media registry permits normal discard", async () => {
  const {calls, paths, run} = fixture();

  const result = await run();

  assert.equal(result.discarded, true);
  assert.equal(result.editorDraftId, input.editorDraftId);
  assert.equal(calls.mediaQueries, 2);

  assert.deepEqual(
    calls.writes.map((entry) => entry.action),
    ["delete", "update", "create"],
  );

  assert.equal(calls.writes[0].path, paths.draftPath);
  assert.equal(calls.writes[1].path, paths.quotaPath);
  assert.equal(calls.writes[1].data.count, 1);
  assert.equal(calls.writes[2].path, paths.operationPath);

  assert.ok(calls.reads.includes(paths.mediaPath));
});

test("registered media blocks draft and quota deletion", async () => {
  const {calls, run} = fixture({hasMedia: true});

  await assert.rejects(
    run(),
    (error) =>
      error.message === "EDITOR_DRAFT_MEDIA_CLEANUP_REQUIRED",
  );

  assert.equal(calls.mediaQueries, 2);
  assert.equal(calls.writes.length, 0);
});

test("interrupted upload reservation blocks orphaning the draft", async () => {
  const {calls, run} = fixture({hasReservation: true});
  await assert.rejects(run(), /EDITOR_DRAFT_MEDIA_CLEANUP_REQUIRED/);
  assert.equal(calls.mediaQueries, 2);
  assert.equal(calls.writes.length, 0);
});

test("failed registry query blocks deletion", async () => {
  const {calls, run} = fixture({mediaReadFails: true});

  await assert.rejects(
    run(),
    (error) => error.message === "MEDIA_QUERY_UNAVAILABLE",
  );

  assert.equal(calls.writes.length, 0);
});

test("another owner cannot discard a draft", async () => {
  const {calls, run} = fixture({otherOwner: true});

  await assert.rejects(
    run(),
    (error) => error.message === "RESOURCE_NOT_FOUND",
  );

  assert.equal(calls.mediaQueries, 0);
  assert.equal(calls.writes.length, 0);
});

test("stale revision prevents discard", async () => {
  const {calls, run} = fixture({staleRevision: true});

  await assert.rejects(
    run(),
    (error) => error.message === "REVISION_CONFLICT",
  );

  assert.equal(calls.mediaQueries, 0);
  assert.equal(calls.writes.length, 0);
});

test("invalid quota prevents discard", async () => {
  const {calls, run} = fixture({invalidQuota: true});

  await assert.rejects(
    run(),
    (error) =>
      error.message === "DRAFT_QUOTA_RECONCILIATION_REQUIRED",
  );

  assert.equal(calls.mediaQueries, 0);
  assert.equal(calls.writes.length, 0);
});

test("idempotent retry does not repeat writes", async () => {
  const {calls, run} = fixture({priorOperation: true});

  const result = await run();

  assert.equal(result.discarded, true);
  assert.equal(calls.mediaQueries, 0);
  assert.equal(calls.writes.length, 0);
});

test("unauthenticated request is rejected", async () => {
  const {calls, run} = fixture({noAuth: true});

  await assert.rejects(run());

  assert.equal(calls.transactions, 0);
  assert.equal(calls.writes.length, 0);
});

test("incorrect provider role is rejected", async () => {
  const {calls, run} = fixture({wrongRole: true});

  await assert.rejects(run());

  assert.equal(calls.transactions, 0);
  assert.equal(calls.writes.length, 0);
});
