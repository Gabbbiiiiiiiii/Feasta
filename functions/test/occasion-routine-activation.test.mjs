import test, {after} from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, readFileSync, writeFileSync, rmSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";

const stage = mkdtempSync(
  join(tmpdir(), "feasta-routine-activation-")
);

after(() => {
  rmSync(stage, {recursive: true, force: true});
});

const sourceDir = resolve("functions/src/admin");

const routineFile = readFileSync(
  join(sourceDir, "occasion-routine-transaction.ts"),
  "utf8"
);

const helperFile = readFileSync(
  join(sourceDir, "occasion-routine-activation.ts"),
  "utf8"
);

const imports = [
  [
    'import {FieldPath} from "firebase-admin/firestore";',
    'import {FieldPath} from "./harness.mjs";',
  ],
  [
    'import type {Transaction} from "firebase-admin/firestore";',
    'type Transaction = any;',
  ],
  [
    'import type {GlobalOccasion} from "@feasta/shared-types/provider-package-v2";',
    'type GlobalOccasion = any;',
  ],
  [
    'import {db} from "../shared/firestore.js";',
    'import {db} from "./harness.mjs";',
  ],
  [
    'import {isServiceCategoryCode} from "../shared/service-category-code.js";',
    'import {isServiceCategoryCode} from "./harness.mjs";',
  ],
  [
    'import {planPublishedPackageDiscoveryRefresh} from "../packages/occasion-package-discovery-refresh.js";',
    'import {planPublishedPackageDiscoveryRefresh} from "./harness.mjs";',
  ],
  [
    'import {planOccasionGalleryWithdrawal} from "./occasion-lifecycle-atomic.js";',
    'import {planOccasionGalleryWithdrawal} from "./harness.mjs";',
  ],
  [
    'import {isRoutineOccasionTransitionValid} from "./occasion-routine-activation.js";',
    'import {isRoutineOccasionTransitionValid} from "./occasion-routine-activation.ts";',
  ],
  [
    'import {requireOccasionLifecycleAdmin} from "./occasion-activation-readiness.js";',
    'import {requireOccasionLifecycleAdmin} from "./harness.mjs";',
  ],
];

let rewritten = routineFile;

for (const [from, to] of imports) {
  assert.equal(
    rewritten.split(from).length - 1,
    1,
    `Expected exactly one import: ${from}`
  );

  rewritten = rewritten.replace(from, to);
}

writeFileSync(
  join(stage, "occasion-routine-transaction.ts"),
  rewritten
);

writeFileSync(
  join(stage, "occasion-routine-activation.ts"),
  helperFile
);

writeFileSync(join(stage, "harness.mjs"), `
let current;

export function setFixture(value) {
  current = value;
}

const ref = (path) => ({path});

export const FieldPath = {
  documentId: () => "__name__",
};

export const db = {
  doc: ref,

  collection: (name) => ({
    doc: (id) => ref(name + "/" + id),
    orderBy: () => ({
      limit: (n) => ({kind: "packages", limit: n}),
    }),
    where: (field, op, value) => ({
      limit: (n) => ({kind: "where", collection: name, field, op, value, limit: n}),
    }),
  }),

  collectionGroup: () => ({
    limit: (n) => ({kind: "galleries", limit: n}),
  }),

  async runTransaction(work) {
    const writes = [];

    const tx = {
      async get(target) {
        if (target.kind === "packages") {
          const docs = current.packages
            .slice(0, target.limit)
            .map((item) => ({
              id: item.id,
              ref: ref("packages/" + item.id),
              data: () => item.data,
            }));

          return {docs, size: docs.length};
        }

        if (target.kind === "galleries") {
          const docs = current.galleries
            .slice(0, target.limit)
            .map((item) => ({
              id: item.id,
              ref: ref(item.path),
              data: () => item.data,
            }));

          return {docs, size: docs.length};
        }

        if (target.kind === "where") {
          const prefix = target.collection + "/";
          const docs = [...current.docs.entries()]
            .filter(([path, data]) => {
              if (!path.startsWith(prefix) || path.split("/").length !== 2) {
                return false;
              }
              return data?.[target.field] === target.value;
            })
            .slice(0, target.limit)
            .map(([path, data]) => ({
              id: path.slice(prefix.length),
              ref: ref(path),
              data: () => data,
            }));
          return {docs, size: docs.length};
        }

        return {
          data: () => current.docs.get(target.path),
        };
      },

      update(target, data) {
        writes.push({
          type: "update",
          path: target.path,
          data,
        });
      },

      create(target, data) {
        writes.push({
          type: "create",
          path: target.path,
          data,
        });
      },
    };

    const result = await work(tx);

    for (const write of writes) {
      if (
        write.type === "create" &&
        current.docs.has(write.path)
      ) {
        throw Error("duplicate create");
      }

      current.docs.set(
        write.path,
        write.type === "update"
          ? {...current.docs.get(write.path), ...write.data}
          : write.data
      );
    }

    current.writes.push(...writes);

    return result;
  },
};

export const isServiceCategoryCode = (value) =>
  typeof value === "string" &&
  /^[a-z][a-z0-9_]{1,63}$/.test(value);

export function planPublishedPackageDiscoveryRefresh() {
  if (current.refreshError) {
    throw Error("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }
  return current.refreshPlan ?? [];
}

export function planOccasionGalleryWithdrawal() {
  if (current.galleryError) {
    throw Error("GALLERY_INVENTORY_REQUIRES_REVIEW");
  }
  return current.galleryChanges;
}

export async function requireOccasionLifecycleAdmin(_tx, uid) {
  if (!current.authorized || uid !== "admin_one") {
    throw Error("ADMIN_REQUIRED");
  }
}
`);

const harness = await import(
  pathToFileURL(join(stage, "harness.mjs")).href
);

const {
  activateRoutineOccasion,
  inspectRoutineOccasionActivation,
  repairPublishedPackageDiscovery,
} = await import(
  pathToFileURL(
    join(stage, "occasion-routine-transaction.ts")
  ).href
);

function fixture(overrides = {}) {
  const state = {
    docs: new Map([
      [
        "occasionCatalog/current",
        {
          revision: 6,
          activationState: "stable",
        },
      ],
      [
        "occasions/birthday",
        {
          id: "birthday",
          label: "Birthday",
          normalizedName: "birthday",
          aliases: [],
          moderationState: "approved",
          active: false,
          revision: 4,
          sortOrder: 1,
          applicableServiceCategoryCodes: [
            "catering_service",
          ],
          createdBy: "admin",
        },
      ],
      [
        "occasions/wedding",
        {
          id: "wedding",
          label: "Wedding",
          normalizedName: "wedding",
          aliases: [],
          moderationState: "approved",
          active: true,
          revision: 2,
          sortOrder: 2,
          applicableServiceCategoryCodes: [
            "catering_service",
          ],
          createdBy: "admin",
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
      [
        "contractPolicies/providerPackageV2",
        {
          maxSpecificOccasions: 10,
          maxThemeImages: 4,
        },
      ],
    ]),

    authorized: true,
    packages: [],
    galleries: [],
    refreshPlan: [],
    refreshError: false,
    galleryChanges: [],
    galleryError: false,
    writes: [],

    ...overrides,
  };

  harness.setFixture(state);

  return state;
}

function input(changes = {}) {
  return {
    occasionId: "birthday",
    expectedOccasionRevision: 4,
    expectedCatalogRevision: 6,
    idempotencyKey: "test_activation_12345",
    reason: "Approved event activation",
    ...changes,
  };
}

test("readiness is advisory and makes no writes", async () => {
  const f = fixture();

  const result = await inspectRoutineOccasionActivation(
    "admin_one",
    input()
  );

  assert.equal(
    result.status,
    "ELIGIBLE_FOR_TRANSACTION"
  );

  assert.equal(result.lifecycleAvailable, true);
  assert.deepEqual(f.writes, []);
});

test("activation updates authority and audit records", async () => {
  const f = fixture();

  const result = await activateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.equal(result.active, true);
  assert.equal(result.occasionRevision, 5);
  assert.equal(result.catalogRevision, 7);
  assert.deepEqual(result.refreshedPackageIds, []);

  assert.equal(
    f.docs.get("occasions/birthday").active,
    true
  );

  assert.equal(
    f.docs.get("occasionCatalog/current").revision,
    7
  );

  const updated = f.writes
    .filter((write) => write.type === "update")
    .map((write) => write.path)
    .sort();

  assert.deepEqual(updated, [
    "occasionCatalog/current",
    "occasions/birthday",
  ]);

  assert.equal(
    f.writes.filter((write) => write.type === "create").length,
    2
  );
});

test("activation refreshes published V2 discovery pins", async () => {
  const f = fixture({
    packages: [{
      id: "pkg_all",
      data: {
        occasionSchemaVersion: 2,
        occasionScope: "all",
        serviceCategoryCode: "catering_service",
      },
    }],
    refreshPlan: [{
      packageId: "pkg_all",
      changed: true,
      patch: {
        eventType: "wedding",
        occasionMatchIds: ["birthday", "wedding"],
        occasionCatalogRevision: 7,
        providerEligibilityRevision: 1,
        occasionEligibilityState: "valid",
      },
    }],
  });
  f.docs.set("packages/pkg_all", {
    occasionCatalogRevision: 6,
    status: "published",
  });

  const result = await activateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.deepEqual(result.refreshedPackageIds, ["pkg_all"]);
  assert.equal(
    f.docs.get("packages/pkg_all").occasionCatalogRevision,
    7
  );
  assert.deepEqual(
    f.docs.get("packages/pkg_all").occasionMatchIds,
    ["birthday", "wedding"]
  );
  assert.equal(f.docs.get("packages/pkg_all").status, "published");
});

test("unauthorized administrator is denied", async () => {
  const f = fixture({authorized: false});

  await assert.rejects(
    activateRoutineOccasion("admin_one", input()),
    /ADMIN_REQUIRED/
  );

  assert.deepEqual(f.writes, []);
});

test("stale revisions are rejected", async () => {
  const f = fixture();

  await assert.rejects(
    activateRoutineOccasion(
      "admin_one",
      input({expectedCatalogRevision: 5})
    ),
    /OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT/
  );

  await assert.rejects(
    activateRoutineOccasion(
      "admin_one",
      input({expectedOccasionRevision: 3})
    ),
    /OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT/
  );

  assert.deepEqual(f.writes, []);
});

test("inactive and rejected state checks", async () => {
  const f = fixture();

  f.docs.get("occasions/birthday").active = true;

  await assert.rejects(
    activateRoutineOccasion("admin_one", input()),
    /OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT/
  );

  f.docs.get("occasions/birthday").active = false;
  f.docs.get("occasions/birthday").moderationState = "rejected";

  await assert.rejects(
    activateRoutineOccasion("admin_one", input()),
    /OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT/
  );

  assert.deepEqual(f.writes, []);
});

test("inactive category is rejected", async () => {
  const f = fixture();

  f.docs.get(
    "serviceCategories/catering_service"
  ).status = "inactive";

  await assert.rejects(
    activateRoutineOccasion("admin_one", input()),
    /OCCASION_LIFECYCLE_CATEGORY_INACTIVE/
  );

  assert.deepEqual(f.writes, []);
});

test("unrefreshable packages block activation", async () => {
  const f = fixture({
    refreshError: true,
  });

  const readiness = await inspectRoutineOccasionActivation(
    "admin_one",
    input()
  );

  assert.equal(readiness.lifecycleAvailable, false);

  assert(
    readiness.blockers.includes(
      "PACKAGE_DISCOVERY_REFRESH_REQUIRED"
    )
  );

  await assert.rejects(
    activateRoutineOccasion("admin_one", input()),
    /PACKAGE_DISCOVERY_REFRESH_REQUIRED/
  );

  assert.deepEqual(f.writes, []);
});

test("affected galleries block activation", async () => {
  const f = fixture({
    galleryChanges: [
      {withdrawnIds: ["setup_one"]},
    ],
  });

  const readiness = await inspectRoutineOccasionActivation(
    "admin_one",
    input()
  );

  assert.equal(readiness.lifecycleAvailable, false);

  await assert.rejects(
    activateRoutineOccasion("admin_one", input()),
    /ROUTINE_ACTIVATION_GALLERY_REVIEW_REQUIRED/
  );

  assert.deepEqual(f.writes, []);
});

test("41 packages fail safely", async () => {
  const records = Array.from(
    {length: 41},
    (_, n) => ({
      id: "package_" + n,
      data: {},
    })
  );

  const f = fixture({packages: records});

  await assert.rejects(
    activateRoutineOccasion("admin_one", input()),
    /PACKAGE_INVENTORY_TOO_LARGE/
  );

  assert.deepEqual(f.writes, []);
});

test("41 gallery documents fail safely", async () => {
  const records = Array.from(
    {length: 41},
    (_, n) => ({
      id: "gallery_" + n,
      path: "providers/provider_" + n + "/catalog/setups",
      data: {},
    })
  );

  const f = fixture({galleries: records});

  await assert.rejects(
    activateRoutineOccasion("admin_one", input()),
    /GALLERY_INVENTORY_TOO_LARGE/
  );

  assert.deepEqual(f.writes, []);
});

test("idempotent retry does not duplicate writes", async () => {
  const f = fixture();

  const first = await activateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.equal(first.idempotentReplay, false);

  const count = f.writes.length;

  const retry = await activateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.equal(retry.idempotentReplay, true);
  assert.equal(f.writes.length, count);
});

test("same idempotency key with changed reason fails", async () => {
  const f = fixture();

  await activateRoutineOccasion(
    "admin_one",
    input()
  );

  const count = f.writes.length;

  await assert.rejects(
    activateRoutineOccasion(
      "admin_one",
      input({reason: "Changed activation reason"})
    ),
    /IDEMPOTENCY_CONFLICT/
  );

  assert.equal(f.writes.length, count);
});

test("repair refreshes only stale published packages", async () => {
  const f = fixture({
    packages: [
      {id: "stale", data: {occasionSchemaVersion: 2, status: "published"}},
      {id: "current", data: {occasionSchemaVersion: 2, status: "published"}},
    ],
    refreshPlan: [{
      packageId: "stale",
      changed: true,
      patch: {
        eventType: "wedding",
        occasionMatchIds: ["wedding"],
        occasionCatalogRevision: 6,
        providerEligibilityRevision: 1,
        occasionEligibilityState: "valid",
      },
    }],
  });
  f.docs.set("packages/stale", {occasionCatalogRevision: 5});
  f.docs.set("packages/current", {occasionCatalogRevision: 6});

  const result = await repairPublishedPackageDiscovery("admin_one");

  assert.deepEqual(result.refreshedPackageIds, ["stale"]);
  assert.deepEqual(result.skippedPackageIds, ["current"]);
  assert.equal(
    f.docs.get("packages/stale").occasionCatalogRevision,
    6
  );
});
