const {test} = require("node:test");
const assert = require("node:assert/strict");
const {
  planPublishedPackageDiscoveryRefresh: plan,
} = require("../lib/packages/occasion-package-discovery-refresh.js");

const catalog = (rows) => rows.map((row, sortOrder) => ({
  id: row.id,
  label: row.id,
  normalizedName: row.id,
  aliases: [],
  active: row.active !== false,
  moderationState: "approved",
  applicableServiceCategoryCodes: ["catering_service"],
  sortOrder,
  revision: 1,
  createdBy: "admin",
  createdAt: null,
  updatedAt: null,
}));

const authority = (extra = {}) => ({
  catalog: catalog([
    {id: "birthday"},
    {id: "wedding"},
    {id: "bagong_occasion"},
  ]),
  catalogRevision: 24,
  maxSpecificOccasions: 10,
  approvedActiveCategoryCodes: ["catering_service"],
  ...extra,
});

const publishedV2 = (patch = {}) => ({
  occasionSchemaVersion: 2,
  occasionScope: "all",
  occasionIds: [],
  eventType: "birthday",
  occasionMatchIds: ["birthday", "wedding"],
  occasionCatalogRevision: 23,
  providerEligibilityRevision: 1,
  occasionEligibilityState: "valid",
  serviceCategoryCode: "catering_service",
  status: "published",
  isPublished: true,
  isActive: true,
  providerPubliclyVisible: true,
  ...patch,
});

test("fits-all expands match ids and bumps catalog revision", () => {
  const result = plan({
    packageRows: [{id: "pkg_all", data: publishedV2()}],
    ...authority(),
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].changed, true);
  assert.deepEqual(result[0].patch.occasionMatchIds, [
    "birthday", "wedding", "bagong_occasion",
  ]);
  assert.equal(result[0].patch.occasionCatalogRevision, 24);
  assert.equal(result[0].patch.eventType, "birthday");
});

test("specific keeps selection and bumps catalog revision", () => {
  const result = plan({
    packageRows: [{
      id: "pkg_specific",
      data: publishedV2({
        occasionScope: "specific",
        occasionIds: ["wedding"],
        eventType: "wedding",
        occasionMatchIds: ["wedding"],
      }),
    }],
    ...authority(),
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].patch.occasionMatchIds, ["wedding"]);
  assert.equal(result[0].patch.occasionCatalogRevision, 24);
  assert.equal(result[0].patch.eventType, "wedding");
});

test("onlyStale skips packages already current", () => {
  const current = publishedV2({
    occasionMatchIds: ["birthday", "wedding", "bagong_occasion"],
    occasionCatalogRevision: 24,
  });
  const result = plan({
    packageRows: [{id: "pkg_current", data: current}],
    ...authority(),
    onlyStale: true,
  });
  assert.deepEqual(result, []);
});

test("legacy packages are ignored", () => {
  const result = plan({
    packageRows: [{
      id: "legacy",
      data: {
        eventType: "birthday",
        status: "published",
        isPublished: true,
        isActive: true,
        providerPubliclyVisible: true,
        serviceCategoryCode: "catering_service",
      },
    }],
    ...authority(),
  });
  assert.deepEqual(result, []);
});

test("malformed V2 fails closed", () => {
  assert.throws(() => plan({
    packageRows: [{
      id: "bad",
      data: publishedV2({occasionIds: "not-an-array"}),
    }],
    ...authority(),
  }), /PACKAGE_DISCOVERY_REFRESH_REQUIRED/);
});

test("draft packages are not refreshed", () => {
  const result = plan({
    packageRows: [{
      id: "draft",
      data: publishedV2({
        status: "draft",
        isPublished: false,
        isActive: false,
        providerPubliclyVisible: false,
      }),
    }],
    ...authority(),
  });
  assert.deepEqual(result, []);
});
