const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseEditorDraftMediaManifestV1,
  EditorDraftMediaManifestError,
} = require("../lib/packages/editor-draft-media-manifest-v1.js");

function parse(value) {
  return parseEditorDraftMediaManifestV1(value);
}

function rejected(value) {
  assert.throws(
    () => parse(value),
    (error) => error instanceof EditorDraftMediaManifestError
  );
}

test("accepts an empty manifest", () => {
  const value = {packageAssetIds: [], themes: []};
  assert.deepEqual(parse(value), value);
});

test("preserves package and theme order", () => {
  const value = {
    packageAssetIds: ["cover_1", "gallery_2"],
    themes: [{
      themeId: "garden",
      assetIds: ["garden_1", "garden_2"],
    }],
  };
  assert.deepEqual(parse(value), value);
});

test("rejects arbitrary URLs and Cloudinary paths", () => {
  rejected({
    packageAssetIds: ["https://example.com/image.png"],
    themes: [],
  });
  rejected({
    packageAssetIds: ["feasta/providers/other/image"],
    themes: [],
  });
});

test("rejects duplicate assets, including across themes", () => {
  rejected({
    packageAssetIds: ["asset_a"],
    themes: [{themeId: "garden", assetIds: ["asset_a"]}],
  });
  rejected({
    packageAssetIds: [],
    themes: [{
      themeId: "garden",
      assetIds: ["asset_a", "asset_a"],
    }],
  });
});

test("rejects duplicate theme identifiers", () => {
  rejected({
    packageAssetIds: [],
    themes: [
      {themeId: "garden", assetIds: []},
      {themeId: "garden", assetIds: []},
    ],
  });
});

test("enforces package image limit", () => {
  rejected({
    packageAssetIds: Array.from(
      {length: 9},
      (_, index) => `asset_${index}`
    ),
    themes: [],
  });
});

test("enforces per-theme image limit", () => {
  rejected({
    packageAssetIds: [],
    themes: [{
      themeId: "garden",
      assetIds: Array.from(
        {length: 5},
        (_, index) => `asset_${index}`
      ),
    }],
  });
});

test("enforces theme count limit", () => {
  rejected({
    packageAssetIds: [],
    themes: Array.from({length: 13}, (_, index) => ({
      themeId: `theme_${index}`,
      assetIds: [],
    })),
  });
});

test("rejects unknown fields", () => {
  rejected({
    packageAssetIds: [],
    themes: [],
    ownerUid: "spoofed",
  });
  rejected({
    packageAssetIds: [],
    themes: [{
      themeId: "garden",
      assetIds: [],
      url: "https://example.com/image.png",
    }],
  });
});

test("rejects malformed arrays and objects", () => {
  rejected(null);
  rejected({packageAssetIds: [], themes: null});
  rejected({packageAssetIds: [], themes: [{}]});
  rejected({packageAssetIds: ["asset_1"]});
});