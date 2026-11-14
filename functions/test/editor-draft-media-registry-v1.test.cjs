const test = require("node:test");
const assert = require("node:assert/strict");

const {
  planEditorDraftMediaRegistrationV1: plan,
  EditorDraftMediaRegistryError,
} = require(process.env.FEASTA_MEDIA_REGISTRY_MODULE || require("node:path").resolve(__dirname, "../lib/packages/editor-draft-media-registry-v1.js"));

const owner = {
  ownerUid: "user_1",
  providerId: "provider_1",
  editorDraftId: "draft_1",
};

const publicId =
  "feasta/providers/user_1/editor-drafts/draft_1/package/cover_1";

const proof = {
  url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.webp`,
  record: {
    ...owner,
    assetId: "cover_1",
    kind: "package",
    themeId: null,
    cloudinaryPublicId: publicId,
    state: "verified",
  },
};

function reject(nextOwner, nextProof, existing = null) {
  assert.throws(
    () => plan(nextOwner, nextProof, existing),
    EditorDraftMediaRegistryError,
  );
}

test("allows first verified registration", () => {
  const result = plan(owner, proof, null);
  assert.equal(result.action, "create");
  assert.equal(result.record.assetId, "cover_1");
});

test("accepts an identical registration retry", () => {
  const first = plan(owner, proof, null);
  const next = plan(owner, proof, first.record);

  assert.equal(next.action, "unchanged");
  assert.deepEqual(next.record, first.record);
});

test("rejects another owner", () => {
  reject({...owner, ownerUid: "other"}, proof);
});

test("rejects another provider", () => {
  reject({...owner, providerId: "other"}, proof);
});

test("rejects another private draft", () => {
  reject({...owner, editorDraftId: "other"}, proof);
});

test("rejects unverified evidence", () => {
  reject(owner, {
    ...proof,
    record: {...proof.record, state: "pending"},
  });
});

test("rejects a mismatched Cloudinary public ID", () => {
  reject(owner, {
    ...proof,
    record: {
      ...proof.record,
      cloudinaryPublicId: "other",
    },
  });
});

test("rejects another account's Cloudinary path", () => {
  reject(owner, {
    ...proof,
    record: {
      ...proof.record,
      cloudinaryPublicId: publicId.replace(
        "user_1",
        "other_user",
      ),
    },
  });
});

test("rejects rewriting an existing registered URL", () => {
  const first = plan(owner, proof, null);

  reject(
    owner,
    {...proof, url: proof.url.replace("v1/", "v2/")},
    first.record,
  );
});

test("rejects changing registered asset category", () => {
  const first = plan(owner, proof, null);

  reject(
    owner,
    {
      ...proof,
      record: {
        ...proof.record,
        kind: "theme",
        themeId: "garden",
      },
    },
    first.record,
  );
});

test("rejects package images with theme IDs", () => {
  reject(owner, {
    ...proof,
    record: {
      ...proof.record,
      themeId: "garden",
    },
  });
});

test("rejects theme images with missing theme IDs", () => {
  reject(owner, {
    ...proof,
    record: {
      ...proof.record,
      kind: "theme",
      themeId: null,
    },
  });
});

test("rejects malformed URL evidence", () => {
  reject(owner, {
    ...proof,
    url: "https://example.com/image.webp",
  });
});

test("accepts a correctly scoped theme asset", () => {
  const id =
    "feasta/providers/user_1/editor-drafts/draft_1/themes/garden/image_1";

  const themeProof = {
    url: `https://res.cloudinary.com/demo/image/upload/v1/${id}.png`,
    record: {
      ...owner,
      assetId: "image_1",
      kind: "theme",
      themeId: "garden",
      cloudinaryPublicId: id,
      state: "verified",
    },
  };

  const result = plan(owner, themeProof, null);

  assert.equal(result.action, "create");
  assert.equal(result.record.kind, "theme");
  assert.equal(result.record.themeId, "garden");
});
