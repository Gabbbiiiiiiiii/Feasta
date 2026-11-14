import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("customer completed-booking review contract", () => {
  const webRoot = process.cwd();
  const service = readFileSync(
    join(webRoot, "src/lib/customer/bookings/customer-booking-service.ts"),
    "utf8",
  );
  const reviewPolicy = readFileSync(
    join(webRoot, "src/lib/customer/bookings/customer-booking-review.ts"),
    "utf8",
  );
  const reviewClient = readFileSync(
    join(webRoot, "src/lib/customer/reviews/customer-review-client.ts"),
    "utf8",
  );
  const reviewTypes = readFileSync(
    join(webRoot, "src/lib/customer/reviews/customer-review-types.ts"),
    "utf8",
  );
  const callable = readFileSync(
    join(webRoot, "../../functions/src/content/submit-review.ts"),
    "utf8",
  );

  it("reuses the existing callable's exact rating and comment contract", () => {
    expect(reviewClient).toContain('SUBMIT_REVIEW_FUNCTION = "submitReview"');
    expect(callable).toContain('"providerRequestId"');
    expect(callable).toContain('"rating"');
    expect(callable).toContain('"comment"');
    expect(callable).toContain('"idempotencyKey"');
    expect(callable).toContain("minLength: 2");
    expect(callable).toContain("maxLength: 2000");
    expect(callable).toContain("(input.rating as number) < 1");
    expect(callable).toContain("(input.rating as number) > 5");
  });

  it("preserves authoritative ownership, completion, and canonical membership checks", () => {
    expect(callable).toContain("requireAuth(request)");
    expect(callable).toContain("requireRole(user.uid, [USER_ROLES.customer])");
    expect(callable).toContain("customerId !== user.uid");
    expect(callable).toContain('providerRequest.status !== "completed"');
    expect(callable).toContain('mainEvent.status !== "completed"');
    expect(callable).toContain("canonicalReviewRelationship({");
    expect(reviewPolicy).toContain("request.mainEventId === bookingId");
    expect(reviewPolicy).toContain('mainEventStatus === "completed"');
    expect(reviewPolicy).toContain("reviewData.customerId === customerId");
  });

  it("hydrates deterministic review state with bounded direct reads", () => {
    expect(service).toContain("canonicalCustomerReviewId(providerRequestId, customerId)");
    expect(service).toContain("adminDb.getAll(...reviewReferences)");
    expect(service).toContain("includeReviewStatus");
    expect(service).not.toMatch(/collection\(COLLECTIONS\.reviews\)\s*\.where\(/u);
    expect(reviewTypes).not.toMatch(/reviewId|customerId|providerId|mainEventId/u);
  });

  it("handles deterministic duplicates without exposing internal review identity", () => {
    expect(callable).toContain("if (existingReview.exists)");
    expect(callable).toContain("created: false");
    expect(callable).toContain("transaction.create(reviewReference");
    expect(reviewClient).toContain("return {created: value.created}");
    expect(reviewClient).not.toMatch(/return\s*\{[^}]*reviewId/u);
  });

  it("uses no direct browser Firestore write, polling, or listener", () => {
    expect(reviewClient).not.toMatch(/firebase\/firestore|setDoc|addDoc|updateDoc|onSnapshot|setInterval/u);
  });
});
