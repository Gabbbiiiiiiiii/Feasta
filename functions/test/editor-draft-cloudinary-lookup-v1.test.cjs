const test = require("node:test");
const assert = require("node:assert/strict");

const {
  lookupVerifiedEditorDraftCloudinaryV1,
  EditorDraftMediaLookupError,
} = require(process.env.FEASTA_MEDIA_LOOKUP_MODULE || require("node:path").resolve(__dirname, "../lib/packages/editor-draft-cloudinary-lookup-v1.js"));

const owner = {
  ownerUid: "user_1",
  providerId: "provider_1",
  editorDraftId: "draft_1",
  assetId: "asset_1",
  kind: "package",
  themeId: null,
};

const publicId =
  "feasta/providers/user_1/editor-drafts/draft_1/package/asset_1";

function resource(id = publicId) {
  return {
    asset_id: "immutable_asset", version: 123,
    public_id: id,
    resource_type: "image",
    type: "upload",
    format: "webp",
    bytes: 2048,
    secure_url:
      `https://res.cloudinary.com/demo/image/upload/v123/${id}.webp`,
  };
}

test("queries exact server-derived public ID", async () => {
  const requested = [];

  const result = await lookupVerifiedEditorDraftCloudinaryV1(
    owner,
    "demo",
    async (id) => {
      requested.push(id);
      return resource(id);
    },
  );

  assert.deepEqual(requested, [publicId]);
  assert.equal(result.record.state, "verified");
  assert.equal(result.record.ownerUid, owner.ownerUid);
});

test("verifies theme images", async () => {
  const theme = {...owner, kind: "theme", themeId: "garden"};

  const result = await lookupVerifiedEditorDraftCloudinaryV1(
    theme,
    "demo",
    async (id) => resource(id),
  );

  assert.equal(result.record.kind, "theme");
  assert.equal(result.record.themeId, "garden");
});

test("rejects another owner's asset", async () => {
  await assert.rejects(() =>
    lookupVerifiedEditorDraftCloudinaryV1(
      owner,
      "demo",
      async () => resource(
        publicId.replace("user_1", "other_user")
      ),
    ),
  );
});

test("rejects missing resource", async () => {
  await assert.rejects(
    () => lookupVerifiedEditorDraftCloudinaryV1(
      owner,
      "demo",
      async () => {
        throw new Error("not found");
      },
    ),
    EditorDraftMediaLookupError,
  );
});

test("rejects invalid draft ID before lookup", async () => {
  let called = false;

  await assert.rejects(
    () => lookupVerifiedEditorDraftCloudinaryV1(
      {...owner, editorDraftId: "../other"},
      "demo",
      async () => {
        called = true;
        return resource();
      },
    ),
    EditorDraftMediaLookupError,
  );

  assert.equal(called, false);
});

test("rejects missing theme ID before lookup", async () => {
  let called = false;

  await assert.rejects(
    () => lookupVerifiedEditorDraftCloudinaryV1(
      {...owner, kind: "theme", themeId: null},
      "demo",
      async () => {
        called = true;
        return resource();
      },
    ),
    EditorDraftMediaLookupError,
  );

  assert.equal(called, false);
});

test("rejects oversized resource", async () => {
  await assert.rejects(() =>
    lookupVerifiedEditorDraftCloudinaryV1(
      owner,
      "demo",
      async () => ({
        ...resource(),
        bytes: 5 * 1024 * 1024 + 1,
      }),
    ),
  );
});

test("rejects substituted delivery URL", async () => {
  await assert.rejects(() =>
    lookupVerifiedEditorDraftCloudinaryV1(
      owner,
      "demo",
      async () => ({
        ...resource(),
        secure_url: "https://example.com/other.webp",
      }),
    ),
  );
});
