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
  join(sourceDir, "occasion-routine-deactivation.ts"),
  "utf8"
);

const helperFile = readFileSync(
  join(sourceDir, "occasion-routine-activation.ts"),
  "utf8"
);

const imports = [
  [
    'import {assertNoOccasionBookingDependencies} from "./occasion-booking-dependencies.js";',
    'import {assertNoOccasionBookingDependencies} from "./harness.mjs";',
  ],
  [
    'import {FieldPath} from "firebase-admin/firestore";',
    'import {FieldPath} from "./harness.mjs";',
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
  join(stage, "occasion-routine-deactivation.ts"),
  rewritten
);

writeFileSync(
  join(stage, "occasion-routine-activation.ts"),
  helperFile
);

writeFileSync(
  join(stage, "occasion-package-dependencies.ts"),
  readFileSync(
    join(sourceDir, "occasion-package-dependencies.ts"),
    "utf8"
  )
);
writeFileSync(join(stage, "harness.mjs"), `
const realBookingModule = await import(
  ${JSON.stringify(pathToFileURL(
    resolve("functions/lib/admin/occasion-booking-dependencies.js")
  ).href)}
);

const realBookingClassifier =
  realBookingModule.assertNoOccasionBookingDependencies ??
  realBookingModule.default?.assertNoOccasionBookingDependencies;

if (typeof realBookingClassifier !== "function") {
  throw Error("REAL_BOOKING_CLASSIFIER_UNAVAILABLE");
}

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
      limit: (n) => ({kind: name, limit: n, after: null}),
      startAfter: (after) => ({
        limit: (n) => ({kind: name, limit: n, after}),
      }),
    }),
  }),

  collectionGroup: () => ({
    limit: (n) => ({kind: "galleries", limit: n}),
  }),

  async runTransaction(work) {
    const writes = [];
    let writing = false;

    const tx = {
      async get(target) {
        if (writing) {
          throw Error("FIRESTORE_READ_AFTER_WRITE");
        }
        if (target.kind === "mainEvents" ||
            target.kind === "providerRequests") {
          const prefix = target.kind + "/";
          const docs = [...current.docs.entries()]
            .filter(([path]) => path.startsWith(prefix) &&
              (target.after == null ||
                path.slice(prefix.length) > target.after))
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, target.limit)
            .map(([path, data]) => ({
              id: path.slice(prefix.length),
              ref: ref(path),
              data: () => data,
            }));
          return {docs, size: docs.length};
        }

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

        return {
          data: () => current.docs.get(target.path),
        };
      },

      update(target, data) {
        writing = true;
        writes.push({
          type: "update",
          path: target.path,
          data,
        });
      },

      create(target, data) {
        writing = true;
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

export async function scanOccasionPackageInventory() {
  if (current.scanError) {
    throw Error("PACKAGE_INVENTORY_REQUIRES_REVIEW");
  }

  return {
    candidatePackageIds: current.candidatePackageIds,
  };
}

export function assertNoOccasionBookingDependencies(input) {
  if (current.bookingError) {
    throw Error(current.bookingError);
  }

  return realBookingClassifier(input);
}

export function withdrawalBatchOperationId() {
  return "a".repeat(64);
}

export async function withdrawOccasionPackageBatchInTransaction(tx, input) {
  if (current.withdrawalError) {
    throw Error(current.withdrawalError);
  }

  const ids = input.packageRefs.map((item) => item.path.split("/").at(-1));
  const withdrawnPackageIds = [];

  for (const item of input.packageRefs) {
    const id = item.path.split("/").at(-1);
    const record = current.packages.find((row) => row.id === id);

    if (!record) {
      throw Error("WITHDRAWAL_PACKAGE_CHANGED");
    }

    tx.update(item, {
      status: "draft",
      isActive: false,
      isPublished: false,
      providerPubliclyVisible: false,
      publishedAt: null,
    });
    withdrawnPackageIds.push(id);
  }

  if (withdrawnPackageIds.length !== ids.length) {
    throw Error("WITHDRAWAL_INCOMPLETE");
  }

  tx.create(input.operationRef, {
    state: "withdrawn_batch",
    withdrawnPackageIds,
  });
  tx.create(input.auditRef, {
    action: "occasion_withdraw_batch",
    withdrawnPackageIds,
  });

  return {
    state: "withdrawn_batch",
    withdrawnPackageIds,
    alreadyPrivatePackageIds: [],
    canCommitCatalog: false,
    canRestorePackages: false,
  };
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
  deactivateRoutineOccasion,
  inspectRoutineOccasionDeactivation,
} = await import(
  pathToFileURL(
    join(stage, "occasion-routine-deactivation.ts")
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
          moderationState: "approved",
          active: true,
          revision: 4,
          applicableServiceCategoryCodes: [
            "catering_service",
          ],
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
    ]),

    authorized: true,
    packages: [],
    galleries: [],
    candidatePackageIds: [],
    galleryChanges: [],
    scanError: false,
    galleryError: false,
    bookingError: null,
    withdrawalError: null,
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
    idempotencyKey: "test_deactivation_12345",
    reason: "Approved event activation",
    ...changes,
  };
}

test("readiness is advisory and makes no writes", async () => {
  const f = fixture();

  const result = await inspectRoutineOccasionDeactivation(
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

test("activation updates only authority and audit records", async () => {
  const f = fixture();

  const result = await deactivateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.equal(result.active, false);
  assert.equal(result.occasionRevision, 5);
  assert.equal(result.catalogRevision, 7);

  assert.equal(
    f.docs.get("occasions/birthday").active,
    false
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

  assert(
    f.writes.every(
      (write) =>
        !/bookings|payments|refunds|packages|providers|catalog\/setups/.test(
          write.path
        )
    )
  );
});

test("unauthorized administrator is denied", async () => {
  const f = fixture({authorized: false});

  await assert.rejects(
    deactivateRoutineOccasion("admin_one", input()),
    /ADMIN_REQUIRED/
  );

  assert.deepEqual(f.writes, []);
});

test("stale revisions are rejected", async () => {
  const f = fixture();

  await assert.rejects(
    deactivateRoutineOccasion(
      "admin_one",
      input({expectedCatalogRevision: 5})
    ),
    /OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT/
  );

  await assert.rejects(
    deactivateRoutineOccasion(
      "admin_one",
      input({expectedOccasionRevision: 3})
    ),
    /OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT/
  );

  assert.deepEqual(f.writes, []);
});

test("inactive and rejected state checks", async () => {
  const f = fixture();

  f.docs.get("occasions/birthday").active = false;

  await assert.rejects(
    deactivateRoutineOccasion("admin_one", input()),
    /OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT/
  );

  f.docs.get("occasions/birthday").active = true;
  f.docs.get("occasions/birthday").moderationState = "rejected";

  await assert.rejects(
    deactivateRoutineOccasion("admin_one", input()),
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
    deactivateRoutineOccasion("admin_one", input()),
    /OCCASION_LIFECYCLE_CATEGORY_INACTIVE/
  );

  assert.deepEqual(f.writes, []);
});

test("logical deactivation preserves Birthday and Wedding package records", async () => {
  const f = fixture({
    packages: [
      {id: "birthday_offer", data: {
        occasionSchemaVersion: 1,
        eventType: "birthday",
        status: "published",
        isActive: true,
        isPublished: true,
        providerPubliclyVisible: true,
        publishedAt: "previous",
      }},
      {id: "wedding_offer", data: {
        occasionSchemaVersion: 1,
        eventType: "wedding",
        status: "published",
        isActive: true,
        isPublished: true,
        providerPubliclyVisible: true,
        publishedAt: "previous",
      }},
    ],
  });

  const preview = await inspectRoutineOccasionDeactivation("admin_one", input());
  assert.equal(preview.lifecycleAvailable, true);
  assert.deepEqual(f.writes, []);

  const result = await deactivateRoutineOccasion("admin_one", input());
  assert.equal(result.active, false);
  assert.deepEqual(result.withdrawnPackageIds, []);
  assert.equal(f.docs.get("occasions/birthday").active, false);
  assert.deepEqual(result.withdrawnPackageIds, []);
  assert(f.writes.every((write) =>
    !write.path.startsWith("packages/")));
  assert(f.writes.every((write) => !write.path.startsWith("packages/")));
});

test("logical deactivation does not invoke package withdrawal", async () => {
  const f = fixture({
    packages: [{id: "birthday_offer", data: {
      eventType: "birthday",
      status: "published",
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
    }}],
    candidatePackageIds: ["birthday_offer"],
    withdrawalError: "WITHDRAWAL_PACKAGE_CHANGED",
  });

  const result = await deactivateRoutineOccasion("admin_one", input());
  assert.equal(result.active, false);
  assert.deepEqual(result.withdrawnPackageIds, []);
  assert(f.writes.every((write) => !write.path.startsWith("packages/")));
});

test("logical deactivation preserves published gallery records", async () => {
  const path = "providers/provider_one/catalog/setups";
  const f = fixture({
    galleries: [{
      id: "setups",
      path,
      data: {
        revision: 1,
        setups: [
          {id: "setup_one", eventType: "birthday", isPublished: true},
          {id: "setup_two", eventType: "wedding", isPublished: true},
        ],
      },
    }],
  });

  const result = await deactivateRoutineOccasion("admin_one", input());
  assert.equal(result.active, false);
  assert.deepEqual(result.withdrawnGallerySetupIds, []);
  assert.deepEqual(result.withdrawnGallerySetupIds, []);
  assert(f.writes.every((write) =>
    write.path !== path));
  assert(f.writes.every((write) => write.path !== path));
});

test("41 package records do not block logical deactivation", async () => {
  const records = Array.from({length: 41}, (_, n) => ({
    id: "package_" + n,
    data: {},
  }));
  const f = fixture({packages: records});

  const preview = await inspectRoutineOccasionDeactivation("admin_one", input());
  assert.equal(preview.lifecycleAvailable, true);

  const result = await deactivateRoutineOccasion("admin_one", input());
  assert.equal(result.active, false);
  assert(f.writes.every((write) => !write.path.startsWith("packages/")));
});

test("41 gallery documents do not block logical deactivation", async () => {
  const records = Array.from({length: 41}, (_, n) => ({
    id: "gallery_" + n,
    path: "providers/provider_" + n + "/catalog/setups",
    data: {},
  }));
  const f = fixture({galleries: records});

  const preview = await inspectRoutineOccasionDeactivation("admin_one", input());
  assert.equal(preview.lifecycleAvailable, true);

  const result = await deactivateRoutineOccasion("admin_one", input());
  assert.equal(result.active, false);
  assert(f.writes.every((write) => !write.path.includes("/catalog/setups")));
});

test("idempotent retry does not duplicate writes", async () => {
  const f = fixture();

  const first = await deactivateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.equal(first.idempotentReplay, false);

  const count = f.writes.length;

  const retry = await deactivateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.equal(retry.idempotentReplay, true);
  assert.equal(f.writes.length, count);
});

test("same idempotency key with changed reason fails", async () => {
  const f = fixture();

  await deactivateRoutineOccasion(
    "admin_one",
    input()
  );

  const count = f.writes.length;

  await assert.rejects(
    deactivateRoutineOccasion(
      "admin_one",
      input({reason: "Changed activation reason"})
    ),
    /IDEMPOTENCY_CONFLICT/
  );

  assert.equal(f.writes.length, count);
});

test("verified private draft does not block deactivation", async () => {
  const draft = {
    status: "draft",
    eventType: "birthday",
    isActive: false,
    isPublished: false,
    providerPubliclyVisible: false,
    isDeleted: false,
    publishedAt: null,
  };
  const f = fixture({
    packages: [{
      id: "birthday_private_offer",
      data: draft,
    }],
  });

  const preview = await inspectRoutineOccasionDeactivation(
    "admin_one",
    input()
  );

  assert.equal(preview.lifecycleAvailable, true);
  assert.deepEqual(f.writes, []);

  const result = await deactivateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.equal(result.active, false);
  assert.equal(result.state, "completed");
  assert(
    f.writes.every((write) =>
      !/^packages\//.test(write.path)
    )
  );
});

test("ambiguous package metadata does not block logical deactivation", async () => {
  const path = "packages/birthday_ambiguous_offer";
  const f = fixture({
    packages: [{
      id: "birthday_ambiguous_offer",
      data: {
        status: "draft",
        eventType: "birthday",
        isActive: false,
        isPublished: false,
      },
    }],
  });

  const preview = await inspectRoutineOccasionDeactivation("admin_one", input());
  assert.equal(preview.lifecycleAvailable, true);
  assert.deepEqual(f.writes, []);

  const result = await deactivateRoutineOccasion("admin_one", input());
  assert.equal(result.active, false);
  assert.deepEqual(result.withdrawnPackageIds, []);
  assert(f.writes.every((write) => write.path !== path));
});

test("live booking blocks routine deactivation without writes", async () => {
  const f = fixture({
    bookingError: "OCCASION_LIVE_BOOKING_DEPENDENCY",
  });

  const preview = await inspectRoutineOccasionDeactivation(
    "admin_one", input()
  );

  assert.equal(preview.lifecycleAvailable, false);
  assert.deepEqual(f.writes, []);

  await assert.rejects(
    deactivateRoutineOccasion("admin_one", input()),
    /OCCASION_LIVE_BOOKING_DEPENDENCY/
  );
  assert.deepEqual(f.writes, []);
});

test("41 completed bookings do not trigger the old inventory limit", async () => {
  const f = fixture();

  for (let i = 0; i < 41; i++) {
    const id = "booking_" + String(i).padStart(3, "0");

    f.docs.set("mainEvents/" + id, {
      eventType: "birthday",
      status: "completed",
      providerRequestIds: [],
      providerRequestCount: 0,
    });
  }

  const preview = await inspectRoutineOccasionDeactivation(
    "admin_one", input()
  );

  assert.equal(preview.lifecycleAvailable, true);

  const result = await deactivateRoutineOccasion(
    "admin_one", input()
  );

  assert.equal(result.active, false);

  assert(f.writes.every((write) =>
    !/^(mainEvents|providerRequests|payments|refunds)\//.test(write.path)
  ));
});
test("deactivation preserves historical booking and payment records", async () => {
  const f = fixture();

  const booking = {
    eventType: "birthday",
    status: "completed",
    providerRequestIds: [],
    providerRequestCount: 0,
    amount: 2500,
  };

  const payment = {
    bookingId: "historical_booking",
    status: "paid",
    amount: 2500,
  };

  f.docs.set("mainEvents/historical_booking", booking);
  f.docs.set("payments/historical_payment", payment);

  const result = await deactivateRoutineOccasion(
    "admin_one",
    input()
  );

  assert.equal(result.active, false);
  assert.deepEqual(f.docs.get("mainEvents/historical_booking"), booking);
  assert.deepEqual(f.docs.get("payments/historical_payment"), payment);

  assert(
    f.writes.every((write) =>
      !/^(mainEvents|providerRequests|payments|refunds)\//.test(write.path)
    )
  );
});

test("pagination accepts more than 40 unrelated bookings", async () => {
  const f = fixture();

  for (let i = 0; i < 85; i++) {
    const id = "other_" + String(i).padStart(3, "0");
    f.docs.set("mainEvents/" + id, {
      eventType: "wedding",
      status: "confirmed",
      providerRequestIds: [],
      providerRequestCount: 0,
    });
  }

  const preview = await inspectRoutineOccasionDeactivation(
    "admin_one", input()
  );
  assert.equal(preview.lifecycleAvailable, true);

  const result = await deactivateRoutineOccasion("admin_one", input());
  assert.equal(result.active, false);
});

test("late-position live booking blocks deactivation", async () => {
  const f = fixture();

  for (let i = 0; i < 85; i++) {
    const id = "booking_" + String(i).padStart(3, "0");
    f.docs.set("mainEvents/" + id, {
      eventType: "birthday",
      status: i === 84 ? "confirmed" : "completed",
      providerRequestIds: [],
      providerRequestCount: 0,
    });
  }

  const preview = await inspectRoutineOccasionDeactivation(
    "admin_one", input()
  );
  assert.equal(preview.lifecycleAvailable, false);

  await assert.rejects(
    deactivateRoutineOccasion("admin_one", input()),
    /OCCASION_LIVE_BOOKING_DEPENDENCY/
  );

  assert.deepEqual(f.writes, []);
});

test("late-position orphan request blocks deactivation", async () => {
  const f = fixture();

  for (let i = 0; i < 85; i++) {
    const id = "request_" + String(i).padStart(3, "0");
    f.docs.set("providerRequests/" + id, {
      eventType: "wedding",
      mainEventId: "unrelated_parent",
      status: "completed",
    });
  }

  f.docs.set("providerRequests/zz_orphan", {
    eventType: "birthday",
    mainEventId: "missing_parent",
    status: "completed",
  });

  const preview = await inspectRoutineOccasionDeactivation(
    "admin_one", input()
  );
  assert.equal(preview.lifecycleAvailable, false);

  await assert.rejects(
    deactivateRoutineOccasion("admin_one", input()),
    /OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED/
  );

  assert.deepEqual(f.writes, []);
});

test("late-position missing occasion evidence fails closed", async () => {
  const f = fixture();

  for (let i = 0; i < 85; i++) {
    const id = "booking_" + String(i).padStart(3, "0");
    f.docs.set("mainEvents/" + id, {
      eventType: "wedding",
      status: "completed",
      providerRequestIds: [],
      providerRequestCount: 0,
    });
  }

  f.docs.set("mainEvents/zz_unknown_occasion", {
    status: "confirmed",
    providerRequestIds: [],
    providerRequestCount: 0,
  });

  await assert.rejects(
    deactivateRoutineOccasion("admin_one", input()),
    /OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED/
  );

  assert.deepEqual(f.writes, []);
});

test("exact pagination boundary does not truncate inventory", async () => {
  const f = fixture();

  for (let i = 0; i < 80; i++) {
    const id = "booking_" + String(i).padStart(3, "0");
    f.docs.set("mainEvents/" + id, {
      eventType: "birthday",
      status: "completed",
      providerRequestIds: [],
      providerRequestCount: 0,
    });
  }

  const result = await deactivateRoutineOccasion("admin_one", input());
  assert.equal(result.active, false);

  assert(f.writes.every((write) =>
    !/^(mainEvents|providerRequests|payments|refunds)\//.test(write.path)
  ));
});
