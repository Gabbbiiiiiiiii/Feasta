const test = require("node:test");
const assert = require("node:assert/strict");

const {
  planSpecificPackageMembership,
} = require("../lib/admin/occasion-package-membership-plan.js");

function pkg(ids, overrides = {}) {
  return {
    occasionSchemaVersion: 2,
    occasionScope: "specific",
    occasionIds: ids,
    occasionMatchIds: [...ids],
    eventType: ids[0],
    ...overrides,
  };
}

test("new package registers all specific occasions", () => {
  assert.deepEqual(
    planSpecificPackageMembership({
      previous: null,
      next: pkg(["birthday", "wedding"]),
    }),
    {
      add: ["birthday", "wedding"],
      remove: [],
      retain: [],
    },
  );
});

test("unchanged memberships require no additions or removals", () => {
  assert.deepEqual(
    planSpecificPackageMembership({
      previous: pkg(["birthday", "wedding"]),
      next: pkg(["wedding", "birthday"], {
        eventType: "wedding",
      }),
    }),
    {
      add: [],
      remove: [],
      retain: ["birthday", "wedding"],
    },
  );
});

test("changed memberships produce an exact delta", () => {
  assert.deepEqual(
    planSpecificPackageMembership({
      previous: pkg(["birthday", "wedding"]),
      next: pkg(["wedding", "anniversary"]),
    }),
    {
      add: ["anniversary"],
      remove: ["birthday"],
      retain: ["wedding"],
    },
  );
});

test("all-scope requires category-wide registry coverage", () => {
  const all = pkg([], {
    occasionScope: "all",
    occasionMatchIds: ["birthday", "wedding"],
    eventType: "birthday",
  });

  for (const input of [
    {previous: null, next: all},
    {previous: all, next: pkg(["birthday"])},
    {previous: pkg(["birthday"]), next: all},
  ]) {
    assert.throws(
      () => planSpecificPackageMembership(input),
      /OCCASION_CATEGORY_DEPENDENCY_REGISTRY_REQUIRED/,
    );
  }
});

test("missing or inconsistent historical membership fails closed", () => {
  const invalid = [
    pkg(["birthday"], {occasionMatchIds: []}),
    pkg(["birthday"], {eventType: "wedding"}),
    pkg(["birthday", "birthday"]),
    pkg(["birthday"], {occasionScope: "unknown"}),
    pkg(["birthday"], {occasionSchemaVersion: 1}),
    pkg(["birthday"], {occasionIds: undefined}),
  ];

  for (const previous of invalid) {
    assert.throws(
      () => planSpecificPackageMembership({
        previous,
        next: pkg(["wedding"]),
      }),
      /OCCASION_PACKAGE_MEMBERSHIP_REQUIRES_REVIEW/,
    );
  }
});

test("unverified new membership fails closed", () => {
  assert.throws(
    () => planSpecificPackageMembership({
      previous: pkg(["birthday"]),
      next: pkg(["wedding"], {
        occasionMatchIds: ["birthday"],
      }),
    }),
    /OCCASION_PACKAGE_MEMBERSHIP_REQUIRES_REVIEW/,
  );
});
