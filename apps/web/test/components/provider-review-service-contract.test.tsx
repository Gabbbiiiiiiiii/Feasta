import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("provider review service contract", () => {
  const root = process.cwd();
  const service = readFileSync(
    join(root, "src/lib/provider/reviews/provider-review-service.ts"),
    "utf8",
  );
  const types = readFileSync(
    join(root, "src/lib/provider/reviews/provider-review-types.ts"),
    "utf8",
  );
  const submitReview = readFileSync(
    join(root, "../../functions/src/content/submit-review.ts"),
    "utf8",
  );
  const rules = readFileSync(
    join(root, "../../firebase/firestore.rules"),
    "utf8",
  );
  const indexes = JSON.parse(readFileSync(
    join(root, "../../firebase/firestore.indexes.json"),
    "utf8",
  )) as {
    indexes: Array<{
      collectionGroup: string;
      fields: Array<{
        fieldPath: string;
        order?: string;
        arrayConfig?: string;
      }>;
    }>;
  };

  it("requires an approved provider and never trusts a browser provider ID", () => {
    expect(service).toMatch(/^import "server-only";/u);
    expect(service.match(/await requireApprovedProvider\(\)/gu)).toHaveLength(3);
    expect(service).toContain("normalizeDocumentId(account.providerId)");
    expect(service).toContain('.where("providerId", "==", providerId)');
    expect(service).not.toMatch(
      /getProviderReview(?:Page|Summary)?\s*\([^)]*providerId/gu,
    );
  });

  it("uses provider-request relationships with explicit legacy support", () => {
    expect(service).toContain('reviews: "reviews"');
    expect(service).toContain('providerRequests: "providerRequests"');
    expect(service).toContain('mainEvents: "mainEvents"');
    expect(service).toContain('packages: "packages"');
    expect(service).toContain('users: "users"');
    expect(service).not.toMatch(/providerReviews|reviewStats|reviewResponses/u);
    expect(service).not.toMatch(/collection\(["']bookings["']\)/u);
  });

  it("fails closed on cross-provider and inconsistent relationships", () => {
    expect(service).toContain("reviewData.providerId !== providerId");
    expect(service).toContain("providerId !== expectedProviderId");
    expect(service).toContain("mainEvent.customerId !== customerId");
    expect(service).toContain("providerRequest.providerId !== expectedProviderId");
    expect(service).toContain("providerRequest.mainEventId !== mainEventId");
    expect(service).toContain("mainEventRequestIds.includes");
    expect(service).toContain("mainEvent.providerId !== expectedProviderId ||");
    expect(service).toContain("packageData.providerId !== expectedProviderId");
    expect(service).toContain("throw unavailableReview()");
    expect(service).toContain("skippedMalformedCount += 1");
  });

  it("validates canonical ratings and moderation visibility safely", () => {
    expect(types).toContain("export type ProviderReviewRating = 1 | 2 | 3 | 4 | 5");
    expect(service).toContain("function ratingValue(");
    expect(service).toContain('data.moderationStatus === "published"');
    expect(service).toContain('data.moderationStatus === "hidden"');
    expect(service).toContain("data.isDeleted !== false");
    expect(service).toContain('.where("isDeleted", "==", false)');
  });

  it("exposes only a privacy-safe customer display identity", () => {
    expect(types).toContain("customerDisplayName: string");
    expect(service).toContain('CUSTOMER_NAME_FALLBACK = "FEASTA customer"');

    for (const sensitiveField of [
      "customerEmail",
      "customerPhone",
      "customerAddress",
      "moderationReason",
      "moderatedBy",
      "isReported",
      "adminLogs",
      "customerId:",
      "providerId:",
      "bookingId:",
      "packageId:",
    ]) {
      expect(types).not.toContain(sensitiveField);
    }
  });

  it("keeps history bounded, rating-filtered, and cursor-paginated", () => {
    expect(service).toContain("DEFAULT_PAGE_SIZE = 10");
    expect(service).toContain("MAX_PAGE_SIZE = 30");
    expect(service).toContain("filters.pageSize + 1");
    expect(service).toContain('.where("rating", "==", Number(filters.rating))');
    expect(service).toContain('.orderBy("createdAt", "desc")');
    expect(service).toContain('.orderBy(FieldPath.documentId(), "desc")');
    expect(service).toContain('.toString("base64url")');
    expect(service).toContain("Buffer.from(value, \"base64url\")");
    expect(service).toContain("parsed.rating !== rating");
  });

  it("reads exact bounded canonical metrics maintained by trusted writes", () => {
    expect(service).toContain("export async function getProviderReviewSummary");
    expect(service).toContain("canonicalReviewSummary(provider)");
    expect(service).toContain("canonicalReviewCount");
    expect(service).toContain("canonicalRatingTotal");
    expect(service).toContain("canonicalRatingDistribution");
    expect(service).toContain("summary.ratingTotal / summary.totalReviews");
    expect(service).toContain("Math.round(value * 100) / 100");
    expect(service).not.toContain("publishedReviews");
    expect(service).not.toContain(".count().get()");
  });

  it("keeps the existing canonical reply read-only and adds no moderation API", () => {
    expect(submitReview).toContain("providerReply: null");
    expect(rules).toContain("'providerReply'");
    expect(types).toContain("providerReply: string | null");
    expect(service).not.toMatch(
      /export async function (?:hide|restore|delete|moderate|reply|update)/u,
    );
    expect(service).not.toMatch(/\.set\(|\.delete\(|runTransaction\(|\.batch\(/u);
    expect(service.match(/\.update\(/gu)).toHaveLength(1);
    expect(service).toContain(
      '.update(`${providerRequestId}\\u0000${customerId}`)',
    );
  });

  it("declares precisely the provider history and summary index shapes", () => {
    const reviewIndexes = indexes.indexes
      .filter((index) => index.collectionGroup === "reviews")
      .map((index) => index.fields.map((field) =>
        `${field.fieldPath}:${field.order ?? field.arrayConfig ?? ""}`,
      ));

    expect(reviewIndexes).toContainEqual([
      "providerId:ASCENDING",
      "isDeleted:ASCENDING",
      "createdAt:DESCENDING",
      "__name__:DESCENDING",
    ]);
    expect(reviewIndexes).toContainEqual([
      "providerId:ASCENDING",
      "isDeleted:ASCENDING",
      "rating:ASCENDING",
      "createdAt:DESCENDING",
      "__name__:DESCENDING",
    ]);
    expect(reviewIndexes).toContainEqual([
      "providerId:ASCENDING",
      "isVisible:ASCENDING",
      "isDeleted:ASCENDING",
      "rating:ASCENDING",
    ]);
    expect(new Set(reviewIndexes.map((fields) => fields.join("|"))).size)
      .toBe(reviewIndexes.length);
  });
});
