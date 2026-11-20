import test, {after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";

const stage = mkdtempSync(join(tmpdir(), "feasta-real-routine-"));
after(() => rmSync(stage, {recursive: true, force: true}));

const sourceRoot = resolve("functions/src");
const files = [
  ["occasion-routine-deactivation", "admin/occasion-routine-deactivation.ts"],
  ["occasion-lifecycle-atomic", "admin/occasion-lifecycle-atomic.ts"],
  ["occasion-package-dependencies", "admin/occasion-package-dependencies.ts"],
  ["occasion-booking-dependencies", "admin/occasion-booking-dependencies.ts"],
  ["occasion-routine-activation", "admin/occasion-routine-activation.ts"],
  ["occasion-transition-inventory-scan", "packages/occasion-transition-inventory-scan.ts"],
  ["occasion-withdrawal-batch", "packages/occasion-withdrawal-batch.ts"],
];

const runtime = String.raw`
let current;

export function setFixture(value) {
  current = value;
}

export const FieldPath = {
  documentId: () => "__name__",
};

function ref(path) {
  return {
    path,
    id: path.split("/").at(-1),
    firestore: db,
  };
}

export const db = {
  doc: ref,

  collection(name) {
    return {
      doc(id) {
        return ref(name + "/" + id);
      },
      orderBy(field) {
        if (field !== "__name__") {
          throw Error("UNEXPECTED_QUERY_ORDER");
        }
        return {
          limit(n) {
            return {kind: "collection", name, limit: n, after: null};
          },
          startAfter(after) {
            return {
              limit(n) {
                return {kind: "collection", name, limit: n, after};
              },
            };
          },
        };
      },
    };
  },

  collectionGroup(name) {
    return {
      limit(n) {
        return {kind: "group", name, limit: n};
      },
    };
  },

  async runTransaction(callback) {
    const writes = [];
    let writing = false;

    const tx = {
      async get(target) {
        if (writing) {
          throw Error("FIRESTORE_READ_AFTER_WRITE");
        }

        if (target.kind) {
          const rows = [...current.docs.entries()]
            .filter(([path]) => {
              const segments = path.split("/");
              if (target.kind === "collection") {
                return segments.length === 2 &&
                  segments[0] === target.name;
              }
              return segments.at(-2) === target.name;
            })
            .sort(([a], [b]) => a.localeCompare(b))
            .filter(([path]) => target.after == null ||
              path.split("/").at(-1) > target.after)
            .slice(0, target.limit);

          const docs = rows.map(([path, data]) => ({
            id: path.split("/").at(-1),
            ref: ref(path),
            exists: true,
            data: () => structuredClone(data),
          }));

          return {
            docs,
            size: docs.length,
            empty: docs.length === 0,
          };
        }

        const data = current.docs.get(target.path);
        return {
          exists: data !== undefined,
          data: () => data === undefined ?
            undefined : structuredClone(data),
        };
      },

      update(target, data) {
        writing = true;
        writes.push({
          kind: "update",
          path: target.path,
          data,
        });
      },

      create(target, data) {
        writing = true;
        if (current.failBatchAudit &&
            target.path.startsWith("occasionWithdrawalBatchAudits/")) {
          throw Error("INJECTED_BATCH_AUDIT_FAILURE");
        }
        writes.push({
          kind: "create",
          path: target.path,
          data,
        });
      },
    };

    const result = await callback(tx);

    // Commit only if the entire transaction callback succeeds.
    const next = new Map(current.docs);

    for (const write of writes) {
      if (write.kind === "create" && next.has(write.path)) {
        throw Error("DUPLICATE_CREATE");
      }
      if (write.kind === "update" && !next.has(write.path)) {
        throw Error("MISSING_UPDATE_TARGET");
      }

      const previous = next.get(write.path);
      next.set(
        write.path,
        write.kind === "create" ?
          write.data : {...previous, ...write.data}
      );
    }

    current.docs = next;
    current.writes.push(...writes);
    return result;
  },
};

export function isServiceCategoryCode(value) {
  return typeof value === "string" &&
    /^[a-z][a-z0-9_]{1,63}$/.test(value);
}

export async function requireOccasionLifecycleAdmin(tx, uid) {
  const snap = await tx.get(db.collection("users").doc(uid));
  const admin = snap.data();
  if (admin?.role !== "admin" ||
      admin.accountStatus !== "active" ||
      admin.isActive !== true ||
      admin.isBlocked !== false) {
    throw Error("ADMIN_REQUIRED");
  }
}
`;

writeFileSync(join(stage, "runtime.mjs"), runtime);

const replacements = new Map([
  [
    'import {FieldPath} from "firebase-admin/firestore";',
    'import {FieldPath} from "./runtime.mjs";',
  ],
  [
    'import {db} from "../shared/firestore.ts";',
    'import {db} from "./runtime.mjs";',
  ],
  [
    'import {isServiceCategoryCode} from "../shared/service-category-code.ts";',
    'import {isServiceCategoryCode} from "./runtime.mjs";',
  ],
  [
    'import {requireOccasionLifecycleAdmin} from "./occasion-activation-readiness.ts";',
    'import {requireOccasionLifecycleAdmin} from "./runtime.mjs";',
  ],
]);

for (const [name, relativePath] of files) {
  let code = readFileSync(join(sourceRoot, relativePath), "utf8");

  code = code.replaceAll('.js"', '.ts"');
  code = code.replaceAll("../packages/", "./");

  for (const [before, after] of replacements) {
    if (code.includes(before)) {
      code = code.replace(before, after);
    }
  }

  if (name === "occasion-booking-dependencies") {
    const statusImport =
      /import\s*\{\s*parseMainEventStatus,\s*parseProviderRequestStatus,?\s*\}\s*from\s*"\.\.\/shared\/constants\.ts";/u;

    assert.match(code, statusImport);

    const url = pathToFileURL(
      resolve("functions/lib/shared/constants.js")
    ).href;

    code = code.replace(
      statusImport,
      'import statuses from ' + JSON.stringify(url) + ';\n' +
      'const {parseMainEventStatus, parseProviderRequestStatus} = statuses;'
    );
  }

  if (name === "occasion-routine-deactivation") {
    assert.match(code, /from "\.\/runtime\.mjs"/);

    assert.match(code, /from "\.\/occasion-booking-dependencies\.ts"/);
  }

  writeFileSync(join(stage, name + ".ts"), code);
}

const {setFixture} = await import(
  pathToFileURL(join(stage, "runtime.mjs")).href
);

const {
  deactivateRoutineOccasion,
  inspectRoutineOccasionDeactivation,
} = await import(
  pathToFileURL(join(stage, "occasion-routine-deactivation.ts")).href
);

function published(eventType, patch = {}) {
  return {
    providerId: "provider_one",
    serviceCategoryCode: "catering_service",
    occasionSchemaVersion: 1,
    eventType,
    status: "published",
    isActive: true,
    isPublished: true,
    providerPubliclyVisible: true,
    publishedAt: "prior_publication",
    isDeleted: false,
    ...patch,
  };
}

function setup(id, eventType, isPublished = true) {
  return {
    id,
    eventType,
    isPublished,
    title: "Example setup",
  };
}

function fixture(options = {}) {
  const docs = new Map([
    [
      "users/admin_one",
      {
        role: "admin",
        accountStatus: "active",
        isActive: true,
        isBlocked: false,
      },
    ],
    [
      "occasionCatalog/current",
      {revision: 6, activationState: "stable"},
    ],
    [
      "occasions/birthday",
      {
        id: "birthday",
        revision: 4,
        active: true,
        moderationState: "approved",
        applicableServiceCategoryCodes: ["catering_service"],
      },
    ],
    [
      "serviceCategories/catering_service",
      {
        code: "catering_service",
        status: "active",
        serviceType: "catering",
      },
    ],
    ["packages/birthday_offer", published("birthday")],
    ["packages/wedding_offer", published("wedding")],
    [
      "providers/provider_one/catalog/setups",
      {
        revision: 1,
        setups: [
          setup("birthday_setup", "birthday"),
          setup("wedding_setup", "wedding"),
        ],
      },
    ],
  ]);

  if (options.invalidGallery) {
    docs.set("providers/provider_one/catalog/setups", {
      revision: 1,
      setups: [{id: "broken_setup", eventType: "birthday",
        isPublished: "yes"}],
    });
  }

  if (options.liveBooking) {
    docs.set("mainEvents/event_one", {
      eventType: "birthday",
      status: "pending",
      providerRequestIds: ["request_one"],
      providerRequestCount: 1,
    });
    docs.set("providerRequests/request_one", {
      eventType: "birthday",
      mainEventId: "event_one",
      status: "pending",
    });
  }

  const state = {
    docs,
    writes: [],
    failBatchAudit: options.failBatchAudit === true,
  };

  setFixture(state);

  const input = {
    occasionId: "birthday",
    expectedOccasionRevision: 4,
    expectedCatalogRevision: 6,
    idempotencyKey: "real_integration_test_12345",
    reason: "Admin-approved occasion deactivation",
  };

  return {state, input};
}

test("logical deactivation updates authority without rewriting provider content", async () => {
  const {state, input} = fixture();

  const preview = await inspectRoutineOccasionDeactivation("admin_one", input);
  assert.equal(preview.lifecycleAvailable, true);
  assert.equal(state.writes.length, 0);

  const result = await deactivateRoutineOccasion("admin_one", input);
  assert.equal(result.active, false);
  assert.deepEqual(result.withdrawnPackageIds, []);
  assert.deepEqual(result.withdrawnGallerySetupIds, []);

  assert.equal(state.docs.get("packages/birthday_offer").isPublished, true);
  assert.equal(state.docs.get("packages/wedding_offer").isPublished, true);

  const gallery = state.docs.get("providers/provider_one/catalog/setups");
  assert.equal(gallery.revision, 1);
  assert.equal(gallery.setups[0].isPublished, true);
  assert.equal(gallery.setups[1].isPublished, true);

  assert.equal(state.docs.get("occasions/birthday").active, false);
  assert.equal(state.docs.get("occasions/birthday").revision, 5);
  assert.equal(state.docs.get("occasionCatalog/current").revision, 7);

  assert(state.writes.some((write) =>
    write.path.startsWith("occasionRoutineDeactivationAudits/")));
  assert(state.writes.every((write) =>
    !write.path.startsWith("packages/") &&
    !write.path.includes("/catalog/setups") &&
    !write.path.startsWith("occasionWithdrawalBatch")));
});

test("legacy malformed gallery is not rewritten by logical deactivation", async () => {
  const {state, input} = fixture({invalidGallery: true});

  const before = structuredClone(
    state.docs.get("providers/provider_one/catalog/setups")
  );

  const result = await deactivateRoutineOccasion("admin_one", input);
  assert.equal(result.active, false);
  assert.deepEqual(
    state.docs.get("providers/provider_one/catalog/setups"),
    before
  );
  assert(state.writes.every((write) =>
    !write.path.includes("/catalog/setups")));
});

test("real booking classifier prevents live-event deactivation", async () => {
  const {state, input} = fixture({liveBooking: true});

  await assert.rejects(
    deactivateRoutineOccasion("admin_one", input),
    /OCCASION_LIVE_BOOKING_DEPENDENCY/
  );

  assert.equal(state.writes.length, 0);
  assert.equal(state.docs.get("occasions/birthday").active, true);
});

test("logical deactivation never invokes the withdrawal audit", async () => {
  const {state, input} = fixture({failBatchAudit: true});

  const result = await deactivateRoutineOccasion("admin_one", input);
  assert.equal(result.active, false);
  assert.equal(state.docs.get("packages/birthday_offer").isPublished, true);
  assert.equal(state.docs.get("occasions/birthday").active, false);
  assert(state.writes.every((write) =>
    !write.path.startsWith("occasionWithdrawalBatch")));
});

test("replaying completed operation produces no additional writes", async () => {
  const {state, input} = fixture();

  const first = await deactivateRoutineOccasion(
    "admin_one", input
  );
  assert.equal(first.idempotentReplay, false);

  const count = state.writes.length;

  const replay = await deactivateRoutineOccasion(
    "admin_one", input
  );

  assert.equal(replay.idempotentReplay, true);
  assert.equal(state.writes.length, count);
});