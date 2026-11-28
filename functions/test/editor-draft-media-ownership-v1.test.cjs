const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertEditorDraftMediaOwnershipV1,
  EditorDraftMediaOwnershipError,
} = require(
  process.env.FEASTA_MEDIA_OWNERSHIP_MODULE ||
  "../lib/packages/editor-draft-media-ownership-v1.js"
);

const owner = {
  ownerUid: "user_1",
  providerId: "provider_1",
  editorDraftId: "draft_1",
};

const manifest = {
  packageAssetIds: ["cover_1"],
  themes: [{
    themeId: "garden",
    assetIds: ["theme_asset_1"],
  }],
};

const records = [
  {
    assetId: "cover_1",
    ...owner,
    kind: "package",
    themeId: null,
    cloudinaryPublicId:
      "feasta/providers/user_1/editor-drafts/draft_1/package/cover_1",
    state: "verified",
  },
  {
    assetId: "theme_asset_1",
    ...owner,
    kind: "theme",
    themeId: "garden",
    cloudinaryPublicId:
      "feasta/providers/user_1/editor-drafts/draft_1/themes/garden/theme_asset_1",
    state: "verified",
  },
];

function reject(changedManifest, changedOwner, changedRecords) {
  assert.throws(
    () => assertEditorDraftMediaOwnershipV1(
      changedManifest,
      changedOwner,
      changedRecords,
    ),
    (error) => error instanceof EditorDraftMediaOwnershipError,
  );
}

test("accepts properly matched verified assets", () => {
  assert.deepEqual(
    assertEditorDraftMediaOwnershipV1(manifest, owner, records),
    manifest,
  );
});

test("accepts an empty manifest with no registry assets", () => {
  const empty = {packageAssetIds: [], themes: []};
  assert.deepEqual(
    assertEditorDraftMediaOwnershipV1(empty, owner, []),
    empty,
  );
});

test("rejects another account's asset", () => {
  reject(manifest, owner, [
    {...records[0], ownerUid: "other_user"},
    records[1],
  ]);
});

test("rejects another provider's asset", () => {
  reject(manifest, owner, [
    {...records[0], providerId: "other_provider"},
    records[1],
  ]);
});

test("rejects another editor draft's asset", () => {
  reject(manifest, owner, [
    {...records[0], editorDraftId: "other_draft"},
    records[1],
  ]);
});

test("rejects assets without verified registry state", () => {
  reject(manifest, owner, [
    {...records[0], state: "pending"},
    records[1],
  ]);
});

test("rejects missing registry records", () => {
  reject(manifest, owner, [records[0]]);
});

test("rejects extra or duplicate registry records", () => {
  reject(manifest, owner, [...records, records[0]]);
});

test("rejects package images disguised as theme images", () => {
  reject(manifest, owner, [
    records[0],
    {...records[1], kind: "package"},
  ]);
});

test("rejects images assigned to a different theme", () => {
  reject(manifest, owner, [
    records[0],
    {...records[1], themeId: "other_theme"},
  ]);
});

test("rejects unexpected Cloudinary public IDs", () => {
  reject(manifest, owner, [
    {...records[0], cloudinaryPublicId:
      "feasta/providers/other_user/editor-drafts/draft_1/package/cover_1"},
    records[1],
  ]);
});

test("rejects malformed owner identifiers", () => {
  reject(manifest, {...owner, editorDraftId: "../other"}, records);
});