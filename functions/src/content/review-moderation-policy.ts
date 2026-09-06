export const REVIEW_ACTIONS = [
  "hide",
  "restore",
  "dismiss_report",
] as const;

export type ReviewAction =
  (typeof REVIEW_ACTIONS)[number];

export type ModerationStatus =
  | "published"
  | "hidden";

export type CanonicalRatingAggregate = {
  reviewCount: number;
  ratingTotal: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
};

export function moderationStatus(
  review: Record<string, unknown>,
): ModerationStatus {
  if (
    review.moderationStatus ===
      "hidden"
  ) {
    return "hidden";
  }

  if (
    review.moderationStatus ===
      "published"
  ) {
    return "published";
  }

  return review.isVisible === false
    ? "hidden"
    : "published";
}

export function resolveNextState(input: {
  action: ReviewAction;
  currentStatus: ModerationStatus;
  currentVisible: boolean;
  currentReported: boolean;
}): {
  status: ModerationStatus;
  isVisible: boolean;
  isReported: boolean;
  changed: boolean;
} {
  if (input.action === "hide") {
    return {
      status: "hidden",
      isVisible: false,
      isReported: false,
      changed:
        input.currentStatus !==
          "hidden" ||
        input.currentVisible ||
        input.currentReported,
    };
  }

  if (input.action === "restore") {
    return {
      status: "published",
      isVisible: true,
      isReported: false,
      changed:
        input.currentStatus !==
          "published" ||
        !input.currentVisible ||
        input.currentReported,
    };
  }

  return {
    status: input.currentStatus,
    isVisible: input.currentVisible,
    isReported: false,
    changed:
      input.currentReported,
  };
}

export function adjustedRatingAggregate(input: {
  reviewCount: unknown;
  ratingAverage: unknown;
  rating: number;
  contributionChange: number;
}): {
  reviewCount: number;
  ratingAverage: number;
} {
  const currentCount =
    Number.isSafeInteger(
      input.reviewCount,
    ) &&
    (input.reviewCount as number) >= 0
      ? input.reviewCount as number
      : 0;

  const currentAverage =
    typeof input.ratingAverage ===
      "number" &&
    Number.isFinite(
      input.ratingAverage,
    )
      ? input.ratingAverage
      : 0;

  const nextCount = Math.max(
    0,
    currentCount +
      input.contributionChange,
  );

  if (nextCount === 0) {
    return {
      reviewCount: 0,
      ratingAverage: 0,
    };
  }

  const currentTotal =
    currentAverage * currentCount;

  const nextTotal =
    currentTotal +
    input.rating *
      input.contributionChange;

  return {
    reviewCount: nextCount,
    ratingAverage:
      Math.max(
        0,
        Math.min(
          5,
          nextTotal / nextCount,
        ),
      ),
  };
}

export function adjustedCanonicalRatingAggregate(input: {
  reviewCount: unknown;
  ratingTotal: unknown;
  ratingDistribution: unknown;
  rating: number;
  contributionChange: 1 | -1;
}): CanonicalRatingAggregate | null {
  const hasStoredAggregate =
    input.reviewCount !== undefined ||
    input.ratingTotal !== undefined ||
    input.ratingDistribution !== undefined;
  const current = hasStoredAggregate
    ? parseCanonicalRatingAggregate(input)
    : emptyCanonicalRatingAggregate();

  if (!current) return null;

  const rating = input.rating as 1 | 2 | 3 | 4 | 5;
  const currentRatingCount = current.ratingDistribution[rating];

  if (
    input.contributionChange === -1 &&
    (current.reviewCount === 0 || currentRatingCount === 0)
  ) {
    return null;
  }

  const nextDistribution = {
    ...current.ratingDistribution,
    [rating]: currentRatingCount + input.contributionChange,
  };
  const nextCount = current.reviewCount + input.contributionChange;
  const nextTotal = current.ratingTotal + rating * input.contributionChange;

  if (nextCount < 0 || nextTotal < 0) return null;

  return {
    reviewCount: nextCount,
    ratingTotal: nextTotal,
    ratingDistribution: nextDistribution,
  };
}

export function parseCanonicalRatingAggregate(input: {
  reviewCount: unknown;
  ratingTotal: unknown;
  ratingDistribution: unknown;
}): CanonicalRatingAggregate | null {
  if (
    !Number.isSafeInteger(input.reviewCount) ||
    (input.reviewCount as number) < 0 ||
    !Number.isSafeInteger(input.ratingTotal) ||
    (input.ratingTotal as number) < 0 ||
    !isRecord(input.ratingDistribution)
  ) {
    return null;
  }

  const distribution = {
    1: nonNegativeInteger(input.ratingDistribution["1"]),
    2: nonNegativeInteger(input.ratingDistribution["2"]),
    3: nonNegativeInteger(input.ratingDistribution["3"]),
    4: nonNegativeInteger(input.ratingDistribution["4"]),
    5: nonNegativeInteger(input.ratingDistribution["5"]),
  };

  if (Object.values(distribution).some((value) => value === null)) {
    return null;
  }

  const safeDistribution = distribution as CanonicalRatingAggregate[
    "ratingDistribution"
  ];
  const count = Object.values(safeDistribution)
    .reduce((total, value) => total + value, 0);
  const ratingTotal = Object.entries(safeDistribution)
    .reduce(
      (total, [rating, value]) => total + Number(rating) * value,
      0,
    );

  if (count !== input.reviewCount || ratingTotal !== input.ratingTotal) {
    return null;
  }

  return {
    reviewCount: input.reviewCount as number,
    ratingTotal: input.ratingTotal as number,
    ratingDistribution: safeDistribution,
  };
}

export function emptyCanonicalRatingAggregate(): CanonicalRatingAggregate {
  return {
    reviewCount: 0,
    ratingTotal: 0,
    ratingDistribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
  };
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? value as number
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
