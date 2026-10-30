const test = require("node:test");
const assert = require("node:assert/strict");

const {
  adjustedRatingAggregate,
  moderationStatus,
  resolveNextState,
} = require("../lib/content/review-moderation-policy.js");

test("canonical and legacy moderation states resolve safely", () => {
  assert.equal(
    moderationStatus({
      moderationStatus: "published",
      isVisible: false,
    }),
    "published",
  );

  assert.equal(
    moderationStatus({
      moderationStatus: "hidden",
      isVisible: true,
    }),
    "hidden",
  );

  assert.equal(
    moderationStatus({isVisible: false}),
    "hidden",
  );

  assert.equal(
    moderationStatus({isVisible: true}),
    "published",
  );
});

test("hiding a published review resolves reports and becomes idempotent", () => {
  const first = resolveNextState({
    action: "hide",
    currentStatus: "published",
    currentVisible: true,
    currentReported: true,
  });

  assert.deepEqual(first, {
    status: "hidden",
    isVisible: false,
    isReported: false,
    changed: true,
  });

  const repeated = resolveNextState({
    action: "hide",
    currentStatus: first.status,
    currentVisible: first.isVisible,
    currentReported: first.isReported,
  });

  assert.equal(repeated.changed, false);
});

test("restoring a hidden review becomes idempotent", () => {
  const first = resolveNextState({
    action: "restore",
    currentStatus: "hidden",
    currentVisible: false,
    currentReported: false,
  });

  assert.deepEqual(first, {
    status: "published",
    isVisible: true,
    isReported: false,
    changed: true,
  });

  const repeated = resolveNextState({
    action: "restore",
    currentStatus: first.status,
    currentVisible: first.isVisible,
    currentReported: first.isReported,
  });

  assert.equal(repeated.changed, false);
});

test("dismissing a report does not alter visibility", () => {
  const result = resolveNextState({
    action: "dismiss_report",
    currentStatus: "published",
    currentVisible: true,
    currentReported: true,
  });

  assert.deepEqual(result, {
    status: "published",
    isVisible: true,
    isReported: false,
    changed: true,
  });
});

test("hiding subtracts the rating from the aggregate", () => {
  const result = adjustedRatingAggregate({
    reviewCount: 2,
    ratingAverage: 4.5,
    rating: 4,
    contributionChange: -1,
  });

  assert.deepEqual(result, {
    reviewCount: 1,
    ratingAverage: 5,
  });
});

test("restoring adds the rating to the aggregate", () => {
  const result = adjustedRatingAggregate({
    reviewCount: 1,
    ratingAverage: 5,
    rating: 4,
    contributionChange: 1,
  });

  assert.deepEqual(result, {
    reviewCount: 2,
    ratingAverage: 4.5,
  });
});

test("removing the final review resets the aggregate", () => {
  const result = adjustedRatingAggregate({
    reviewCount: 1,
    ratingAverage: 3,
    rating: 3,
    contributionChange: -1,
  });

  assert.deepEqual(result, {
    reviewCount: 0,
    ratingAverage: 0,
  });
});

test("invalid aggregate fields fail closed without negative counts", () => {
  const result = adjustedRatingAggregate({
    reviewCount: -5,
    ratingAverage: Number.NaN,
    rating: 5,
    contributionChange: -1,
  });

  assert.deepEqual(result, {
    reviewCount: 0,
    ratingAverage: 0,
  });
});