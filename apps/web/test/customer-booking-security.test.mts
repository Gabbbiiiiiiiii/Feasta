import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("customer booking reads derive ownership from the trusted session", async () => {
  const [service, page, actions] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("app/customer/bookings/page.tsx"),
    source("app/customer/bookings/actions.ts"),
  ]);

  assert.match(service, /^import "server-only";/u);
  assert.match(service, /const customer = await requireCustomer\(\)/u);
  assert.match(service, /\.where\("customerId", "==", customerId\)/u);
  assert.match(service, /bookingData\?\.customerId !== customer\.uid/u);
  assert.match(page, /await getCustomerBookingPage\(\{/u);
  assert.match(actions, /return getCustomerBookingResults\(filters\)/u);
  assert.doesNotMatch(page, /firebase\/firestore/u);
  assert.doesNotMatch(actions, /customerId/u);
});

test("exact search cannot return another customer's booking", async () => {
  const service = await source(
    "lib/customer/bookings/customer-booking-service.ts",
  );

  assert.match(service, /SAFE_DOCUMENT_ID/u);
  assert.match(service, /\.doc\(filters\.search\)/u);
  assert.match(
    service,
    /\.where\("bookingCode", "==", filters\.search\.toUpperCase\(\)\)/u,
  );
  assert.match(service, /data\.customerId === customerId/u);
  assert.match(service, /\.limit\(1\)/u);
  assert.match(service, /\.slice\(0, filters\.pageSize\)/u);
});

test("booking list remains bounded and detail data loads on demand", async () => {
  const [service, experience] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("components/customer/bookings/customer-booking-experience.tsx"),
  ]);

  assert.match(service, /MAX_PAGE_SIZE = 30/u);
  assert.match(service, /filters\.pageSize \+ 1/u);
  assert.match(service, /FieldPath\.documentId\(\)/u);
  assert.match(service, /encodeCursor\(lastDocument\)/u);
  assert.match(experience, /CustomerBookingDetailsDrawer/u);
  assert.doesNotMatch(experience, /loadCustomerBookingDetailsAction/u);
});

test("customer filters map to canonical main-event statuses", async () => {
  const [statusPolicy, service] = await Promise.all([
    source("lib/customer/bookings/customer-booking-status.ts"),
    source("lib/customer/bookings/customer-booking-service.ts"),
  ]);

  assert.match(statusPolicy, /awaiting_provider: \[/u);
  assert.match(statusPolicy, /"pending_provider_approval"/u);
  assert.match(statusPolicy, /"needs_provider_replacement"/u);
  assert.match(statusPolicy, /awaiting_payment: \[/u);
  assert.match(statusPolicy, /"waiting_for_down_payment"/u);
  assert.match(statusPolicy, /cancelled_or_expired: \[/u);
  assert.match(service, /query\.where\("status", "in", statuses\)/u);
});

test("canonical booking collections and provider-request membership are preserved", async () => {
  const [service, membership] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("lib/customer/bookings/customer-booking-membership.ts"),
  ]);

  assert.match(service, /mainEvents: "mainEvents"/u);
  assert.match(service, /providerRequests: "providerRequests"/u);
  assert.match(service, /normalizeCanonicalProviderRequestIds\(/u);
  assert.match(service, /adminDb\.getAll\(/u);
  assert.match(service, /isCanonicalOwnedProviderRequest\(/u);
  assert.match(membership, /canonicalProviderRequestIds\.has\(request\.documentId\)/u);
  assert.match(membership, /request\.storedProviderRequestId === request\.documentId/u);
  assert.match(membership, /request\.mainEventId === expected\.mainEventId/u);
  assert.match(membership, /request\.customerId === expected\.customerId/u);
  assert.match(membership, /MAX_PROVIDER_REQUESTS_PER_BOOKING = 30/u);
  assert.doesNotMatch(service, /collection\(["']bookings["']\)/u);
  assert.doesNotMatch(service, /\.collection\(COLLECTIONS\.providerRequests\)[\s\S]*\.where\("mainEventId"/u);
});

test("customer booking response fields are narrowly normalized without provider recovery IDs", async () => {
  const [service, normalizers, types] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("lib/customer/bookings/customer-booking-data-normalizers.ts"),
    source("lib/customer/bookings/customer-booking-types.ts"),
  ]);

  assert.match(service, /normalizeCustomerBookingAggregateCounts\(data\)/u);
  assert.match(service, /normalizeCustomerBookingProviderResponseFields\(data\)/u);
  assert.match(normalizers, /acceptedAt: safeIsoDate\(data\.acceptedAt\)/u);
  assert.match(normalizers, /rejectedAt: safeIsoDate\(data\.rejectedAt\)/u);
  assert.match(normalizers, /replacementStatus: safeOptionalString/u);
  assert.match(normalizers, /paidAt: safeIsoDate\(data\.paidAt\)/u);
  assert.match(normalizers, /refundedAt: safeIsoDate\(data\.refundedAt\)/u);
  assert.match(normalizers, /waitingPaymentProviderRequestCount/u);
  assert.match(normalizers, /paymentProcessingProviderRequestCount/u);
  assert.doesNotMatch(types, /rejectedByProviderIds/u);
  assert.doesNotMatch(service, /data\.rejectedByProviderIds/u);
  assert.doesNotMatch(types, /paymongoResourceId|checkoutId|webhook/u);
});

test("dedicated detail loading proves ownership before child collection reads", async () => {
  const [service, route] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("app/customer/bookings/[bookingId]/page.tsx"),
  ]);

  const ownerLoader = service.indexOf("async function loadOwnedCustomerBooking");
  const requireCustomer = service.indexOf("await requireCustomer()", ownerLoader);
  const mainEventRead = service.indexOf(".doc(normalizedBookingId)", ownerLoader);
  const ownershipCheck = service.indexOf("bookingData?.customerId !== customer.uid", ownerLoader);
  assert.ok(ownerLoader >= 0);
  assert.ok(requireCustomer > ownerLoader);
  assert.ok(mainEventRead > requireCustomer);
  assert.ok(ownershipCheck > mainEventRead);

  const detailLoader = service.indexOf("export async function getCustomerBookingDetailsWithTimeline");
  const ownedBooking = service.indexOf("await loadOwnedCustomerBooking(bookingId)", detailLoader);
  const providerRequests = service.indexOf("loadOwnedProviderRequests(", ownedBooking);
  const timelineRead = service.indexOf('.collection("timeline")', ownedBooking);
  assert.ok(detailLoader >= 0);
  assert.ok(ownedBooking > detailLoader);
  assert.ok(providerRequests > ownedBooking);
  assert.ok(timelineRead > ownedBooking);

  assert.match(route, /await getCustomerBookingDetailsWithTimeline\(bookingId\)/u);
  assert.match(route, /isCustomerBookingUnavailableError\(error\)/u);
  assert.match(route, /throw error/u);
  assert.doesNotMatch(route, /firebase\/firestore/u);
});

test("customer timeline uses the canonical bounded nested collection", async () => {
  const [service, normalizer, types] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("lib/customer/bookings/customer-booking-timeline-normalizer.ts"),
    source("lib/customer/bookings/customer-booking-types.ts"),
  ]);

  assert.match(service, /MAX_TIMELINE_ENTRIES = 100/u);
  assert.match(service, /\.collection\("timeline"\)/u);
  assert.match(service, /\.orderBy\("createdAt", "desc"\)/u);
  assert.match(service, /\.limit\(MAX_TIMELINE_ENTRIES \+ 1\)/u);
  assert.match(service, /\.slice\([\s\S]*MAX_TIMELINE_ENTRIES[\s\S]*\)/u);
  assert.match(service, /timelineSnapshot\.docs\.length > MAX_TIMELINE_ENTRIES/u);
  assert.match(service, /sort\(compareCustomerBookingTimelineEntries\)/u);
  assert.doesNotMatch(service, /bookingTimelines/u);
  assert.doesNotMatch(service, /collection\(["']bookings["']\)/u);

  const timelineType = types.slice(
    types.indexOf("export type CustomerBookingTimelineEntry"),
    types.indexOf("export type CustomerBookingTimeline ="),
  );
  assert.match(timelineType, /type CustomerBookingTimelineEntry/u);
  assert.doesNotMatch(timelineType, /createdBy:/u);
  assert.doesNotMatch(timelineType, /paymentId:/u);
  assert.doesNotMatch(timelineType, /providerRequestId:/u);
  assert.doesNotMatch(timelineType, /source:/u);
  assert.match(normalizer, /MAX_TIMELINE_DESCRIPTION_LENGTH = 1_000/u);
  assert.match(normalizer, /return \{/u);
});

test("the drawer remains lightweight while exposing the dedicated route", async () => {
  const [service, drawer] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("components/customer/bookings/customer-booking-details-drawer.tsx"),
  ]);

  const drawerLoader = service.slice(
    service.indexOf("export async function getCustomerBookingDetails("),
    service.indexOf("export async function getCustomerBookingDetailsWithTimeline"),
  );
  assert.doesNotMatch(drawerLoader, /timeline/u);
  assert.match(drawer, /Open full booking details/u);
  assert.match(drawer, /\/customer\/bookings\/\$\{encodeURIComponent\(booking\.id\)\}/u);
});

test("summary aggregates are loaded initially, not on every client transition", async () => {
  const [service, actions] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("app/customer/bookings/actions.ts"),
  ]);

  assert.match(service, /getCustomerBookingStatistics\(customer\.uid\)/u);
  assert.match(service, /export async function getCustomerBookingResults/u);
  assert.doesNotMatch(actions, /getCustomerBookingPage/u);
});

test("completed booking reviews use bounded canonical reads and the secure callable", async () => {
  const [service, reviewPolicy, reviewClient, detail] = await Promise.all([
    source("lib/customer/bookings/customer-booking-service.ts"),
    source("lib/customer/bookings/customer-booking-review.ts"),
    source("lib/customer/reviews/customer-review-client.ts"),
    source("components/customer/bookings/customer-booking-detail-content.tsx"),
  ]);

  assert.match(service, /reviews: "reviews"/u);
  assert.match(service, /canonicalCustomerReviewId\(providerRequestId, customerId\)/u);
  assert.match(service, /adminDb\.getAll\(\.\.\.reviewReferences\)/u);
  assert.match(service, /includeReviewStatus/u);
  assert.doesNotMatch(service, /collection\(COLLECTIONS\.reviews\)\s*\.where\(/u);
  assert.match(reviewPolicy, /reviewData\.providerRequestId === request\.providerRequestId/u);
  assert.match(reviewPolicy, /reviewData\.mainEventId === bookingId/u);
  assert.match(reviewPolicy, /reviewData\.customerId === customerId/u);
  assert.match(reviewPolicy, /request\.mainEventId === bookingId/u);
  assert.match(reviewPolicy, /request\.status === "completed"/u);
  assert.match(reviewPolicy, /mainEventStatus === "completed"/u);

  assert.match(reviewClient, /SUBMIT_REVIEW_FUNCTION = "submitReview"/u);
  assert.match(reviewClient, /initializeBrowserAppCheck\(\)/u);
  assert.match(reviewClient, /providerRequestId,/u);
  assert.match(reviewClient, /rating: input\.rating/u);
  assert.match(reviewClient, /comment,/u);
  assert.match(reviewClient, /idempotencyKey:/u);
  assert.doesNotMatch(reviewClient, /customerId\s*:/u);
  assert.doesNotMatch(reviewClient, /providerId\s*:/u);
  assert.doesNotMatch(reviewClient, /mainEventId\s*:/u);
  assert.doesNotMatch(detail, /firebase\/firestore|onSnapshot|setInterval/u);
});
