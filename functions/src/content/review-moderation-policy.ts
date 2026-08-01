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