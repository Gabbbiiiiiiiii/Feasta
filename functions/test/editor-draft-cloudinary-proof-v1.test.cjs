const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertEditorDraftCloudinaryProofV1,
  EditorDraftCloudinaryProofError,
} = require(
  process.env.FEASTA_CLOUDINARY_PROOF_MODULE || require("node:path").resolve(__dirname, "../lib/packages/editor-draft-cloudinary-proof-v1.js")
);

const scope = {
  ownerUid: "user_1",
  providerId: "provider_1",
  editorDraftId: "draft_1",
  assetId: "asset_1",
  kind: "package",
  themeId: null,
};

const publicId =
  "feasta/providers/user_1/editor-drafts/draft_1/package/asset_1";

const resource = {
  asset_id: "immutable_asset", version: 123,
  public_id: publicId,
  resource_type: "image",
  type: "upload",
  format: "webp",
  bytes: 1024,
  secure_url:
    `https://res.cloudinary.com/demo/image/upload/v123/${publicId}.webp`,
};

function rejects(nextScope = scope, nextResource = resource, cloud = "demo") {
  assert.throws(
    () => assertEditorDraftCloudinaryProofV1(
      nextScope, cloud, nextResource
    ),
    (error) => error instanceof EditorDraftCloudinaryProofError
  );
}

test("accepts a matching package asset", () => {
  const output = assertEditorDraftCloudinaryProofV1(
    scope, "demo", resource
  );

  assert.equal(output.url, resource.secure_url);
  assert.equal(output.record.cloudinaryPublicId, publicId);
  assert.equal(output.record.state, "verified");
});

test("accepts a matching theme asset", () => {
  const themeScope = {
    ...scope,
    kind: "theme",
    themeId: "garden",
  };

  const themeId =
    "feasta/providers/user_1/editor-drafts/draft_1/themes/garden/asset_1";

  const themeResource = {
    ...resource,
    public_id: themeId,
    secure_url:
      `https://res.cloudinary.com/demo/image/upload/v123/${themeId}.webp`,
  };

  const output = assertEditorDraftCloudinaryProofV1(
    themeScope, "demo", themeResource
  );

  assert.equal(output.record.themeId, "garden");
});

test("rejects another provider account path", () => {
  rejects(scope, {
    ...resource,
    public_id: publicId.replace("user_1", "other_user"),
  });
});

test("rejects another draft's public ID", () => {
  rejects(scope, {
    ...resource,
    public_id: publicId.replace("draft_1", "draft_other"),
  });
});

test("rejects a non-image resource", () => {
  rejects(scope, {...resource, resource_type: "raw"});
});

test("rejects non-upload Cloudinary resources", () => {
  rejects(scope, {...resource, type: "private"});
});

test("rejects invalid file formats", () => {
  rejects(scope, {...resource, format: "svg"});
});

test("rejects oversized images", () => {
  rejects(scope, {...resource, bytes: 5 * 1024 * 1024 + 1});
});

test("rejects zero-byte images", () => {
  rejects(scope, {...resource, bytes: 0});
});

test("rejects a substituted delivery URL", () => {
  rejects(scope, {
    ...resource,
    secure_url:
      "https://res.cloudinary.com/demo/image/upload/v123/other.webp",
  });
});

test("rejects an unexpected Cloudinary cloud", () => {
  rejects(scope, resource, "another_cloud");
});

test("rejects HTTP and unrelated domains", () => {
  rejects(scope, {
    ...resource,
    secure_url: resource.secure_url.replace(
      "https:", "http:"
    ),
  });

  rejects(scope, {
    ...resource,
    secure_url: resource.secure_url.replace(
      "res.cloudinary.com", "example.com"
    ),
  });
});

test("rejects unexpected transformations", () => {
  rejects(scope, {
    ...resource,
    secure_url:
      `https://res.cloudinary.com/demo/image/upload/w_300/v123/${publicId}.webp`,
  });
});

test("rejects invalid package/theme associations", () => {
  rejects({...scope, themeId: "garden"});
  rejects({...scope, kind: "theme", themeId: null});
});

test("rejects an invalid asset scope", () => {
  rejects({...scope, editorDraftId: "../draft"});
});
for(const change of [{asset_id:undefined},{asset_id:''},{version:undefined},{version:0},{version:124}]) {
 test('rejects invalid immutable resource identity '+JSON.stringify(change),()=>rejects(scope,{...resource,...change}));
}
