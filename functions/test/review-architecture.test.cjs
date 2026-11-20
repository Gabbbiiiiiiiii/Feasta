const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  CANONICAL_REVIEW_RELATIONSHIP_VERSION,
  CANONICAL_REVIEW_SCHEMA_VERSION,
  canonicalReviewId,
  canonicalReviewRelationship,
  legacyReviewRelationship,
} = require("../lib/content/review-domain.js");
const {
  adjustedCanonicalRatingAggregate,
} = require("../lib/content/review-moderation-policy.js");

const sourceRoot = path.resolve(__dirname, "../src");
const source = (relative) => readFileSync(
  path.join(sourceRoot, relative),
  "utf8",
);

function canonicalReview(providerRequestId, providerId) {
  return {
    schemaVersion: CANONICAL_REVIEW_SCHEMA_VERSION,
    relationshipVersion: CANONICAL_REVIEW_RELATIONSHIP_VERSION,
    providerRequestId,
    mainEventId: "event-x",
    providerId,
    customerId: "customer-one",
  };
}

function canonicalRelationship(providerRequestId, providerId) {
  return canonicalReviewRelationship({
    review: canonicalReview(providerRequestId, providerId),
    providerRequestId,
    providerRequest: {
      providerRequestId,
      mainEventId: "event-x",
      providerId,
      customerId: "customer-one",
      status: "completed",
    },
    mainEventId: "event-x",
    mainEvent: {
      customerId: "customer-one",
      providerRequestIds: ["request-a", "request-b"],
      status: "completed",
    },
    providerId,
    providerExists: true,
  });
}

test("review identity is deterministic per customer and provider request", () => {
  const expectedDigest = createHash("sha256")
    .update("request-a\u0000customer-one")
    .digest("hex");
  const reviewA = canonicalReviewId("request-a", "customer-one");
  const reviewB = canonicalReviewId("request-b", "customer-one");

  assert.equal(reviewA, `review_${expectedDigest}`);
  assert.equal(reviewA, canonicalReviewId("request-a", "customer-one"));
  assert.notEqual(reviewA, reviewB);
});

test("one main event supports isolated reviews and aggregates per provider", () => {
  const relationshipA = canonicalRelationship("request-a", "provider-a");
  const relationshipB = canonicalRelationship("request-b", "provider-b");
  assert.equal(relationshipA.providerId, "provider-a");
  assert.equal(relationshipB.providerId, "provider-b");
  assert.notEqual(relationshipA.providerRequestId, relationshipB.providerRequestId);

  const providerA = adjustedCanonicalRatingAggregate({
    reviewCount: undefined,
    ratingTotal: undefined,
    ratingDistribution: undefined,
    rating: 5,
    contributionChange: 1,
  });
  const providerB = adjustedCanonicalRatingAggregate({
    reviewCount: undefined,
    ratingTotal: undefined,
    ratingDistribution: undefined,
    rating: 3,
    contributionChange: 1,
  });
  assert.deepEqual(providerA, {
    reviewCount: 1,
    ratingTotal: 5,
    ratingDistribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 1},
  });
  assert.deepEqual(providerB, {
    reviewCount: 1,
    ratingTotal: 3,
    ratingDistribution: {1: 0, 2: 0, 3: 1, 4: 0, 5: 0},
  });

  const forged = canonicalReviewRelationship({
    review: canonicalReview("request-b", "provider-a"),
    providerRequestId: "request-b",
    providerRequest: {
      providerRequestId: "request-b",
      mainEventId: "event-x",
      providerId: "provider-b",
      customerId: "customer-one",
    },
    mainEventId: "event-x",
    mainEvent: {
      customerId: "customer-one",
      providerRequestIds: ["request-a", "request-b"],
    },
    providerId: "provider-a",
    providerExists: true,
  });
  assert.equal(forged, null);
});

test("legacy fallback is explicit and fails closed on inconsistent records", () => {
  const valid = legacyReviewRelationship({
    review: {
      bookingId: "legacy-event",
      providerId: "provider-a",
      customerId: "customer-one",
    },
    mainEventId: "legacy-event",
    mainEvent: {
      providerId: "provider-a",
      customerId: "customer-one",
      status: "completed",
    },
    providerId: "provider-a",
    providerExists: true,
  });
  assert.equal(valid.kind, "legacy");

  const malformedCanonical = legacyReviewRelationship({
    review: {
      providerRequestId: null,
      bookingId: "legacy-event",
      providerId: "provider-a",
      customerId: "customer-one",
    },
    mainEventId: "legacy-event",
    mainEvent: {
      providerId: "provider-a",
      customerId: "customer-one",
      status: "completed",
    },
    providerId: "provider-a",
    providerExists: true,
  });
  assert.equal(malformedCanonical, null);
});

test("submit and delete callables trust only authenticated relationship IDs", () => {
  const submit = source("content/submit-review.ts");
  const remove = source("content/delete-review.ts");
  const rules = readFileSync(
    path.resolve(__dirname, "../../firebase/firestore.rules"),
    "utf8",
  );

  assert.match(submit, /input\.providerRequestId/u);
  assert.doesNotMatch(submit, /input\.providerId|input\.customerId|input\.mainEventId/u);
  assert.match(submit, /providerRequest\.status !== "completed"/u);
  assert.match(submit, /mainEvent\.status !== "completed"/u);
  assert.match(submit, /canonicalReviewRelationship/u);
  assert.match(remove, /loadReviewRelationship/u);
  assert.match(remove, /adjustedCanonicalRatingAggregate/u);
  assert.match(remove, /writeAuditLogInTransaction/u);
  assert.doesNotMatch(rules, /validSoftDelete\(\)[\s\S]{0,400}match \/reviews/u);
  assert.match(rules, /Customer deletion and admin moderation are callable-only/u);
});
