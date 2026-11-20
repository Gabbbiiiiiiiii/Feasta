const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyHistoricalPackage,
  classifyHistoricalMainEvent,
} = require("../lib/admin/occasion-historical-witnesses.js");

function specific(overrides = {}) {
  return {
    occasionSchemaVersion: 2,
    occasionScope: "specific",
    occasionIds: ["birthday", "wedding"],
    occasionMatchIds: ["birthday", "wedding"],
    eventType: "birthday",
    serviceCategoryCode: "catering",
    ...overrides,
  };
}

test("legacy package produces its occasion witness", () => {
  const result = classifyHistoricalPackage("pkg_1", {
    eventType: "birthday",
  });

  assert.equal(result.kind, "witnesses");
  assert.equal(
    result.witnesses[0].path,
    "occasionDependencies/birthday/entries/package_pkg_1",
  );
});

test("V2 specific package produces multiple witnesses", () => {
  const result = classifyHistoricalPackage("pkg_2", specific());

  assert.equal(result.kind, "witnesses");
  assert.deepEqual(
    result.witnesses.map(value => value.value.occasionId),
    ["birthday", "wedding"],
  );
});

test("V3 all-scope package produces category witness", () => {
  const result = classifyHistoricalPackage("pkg_3", specific({
    occasionScope: "all",
    occasionIds: [],
  }));

  assert.equal(result.kind, "witnesses");
  assert.equal(
    result.witnesses[0].path,
    "occasionCategoryDependencies/catering/entries/" +
      "universal_package_pkg_3",
  );
});

test("archived and deleted packages are excluded", () => {
  const archived = classifyHistoricalPackage("pkg_4", {
    ...specific(),
    status: "archived",
    isActive: false,
    isPublished: false,
    providerPubliclyVisible: false,
  });

  const deleted = classifyHistoricalPackage("pkg_5", {
    ...specific(),
    isDeleted: true,
  });

  assert.equal(archived.kind, "excluded");
  assert.equal(deleted.kind, "excluded");
});

test("ambiguous package selections require review", () => {
  const invalid = [
    specific({occasionIds: ["birthday", "birthday"]}),
    specific({occasionMatchIds: ["wedding"]}),
    specific({eventType: "anniversary"}),
    specific({occasionScope: "invalid"}),
    specific({serviceCategoryCode: "BAD/CATEGORY"}),
    {occasionSchemaVersion: 99, eventType: "birthday"},
  ];

  for (const value of invalid) {
    assert.equal(
      classifyHistoricalPackage("pkg_6", value).kind,
      "unresolved",
    );
  }
});

test("customer planning draft creates no booking witness", () => {
  const result = classifyHistoricalMainEvent("draft_1", {
    status: "draft",
    customerId: "customer_1",
    eventType: "birthday",
  });

  assert.equal(result.kind, "excluded");
  assert.equal(result.reason, "customer_draft");
});

test("incomplete submitted booking requires review", () => {
  const result = classifyHistoricalMainEvent("booking_1", {
    status: "pending",
    eventType: "birthday",
    bookingId: "booking_1",
  });

  assert.equal(result.kind, "unresolved");
});

test("invalid record identifiers require review", () => {
  assert.equal(
    classifyHistoricalPackage("bad/id", specific()).kind,
    "unresolved",
  );

  assert.equal(
    classifyHistoricalMainEvent("bad/id", {}).kind,
    "unresolved",
  );
});
