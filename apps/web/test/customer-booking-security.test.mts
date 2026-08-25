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

test("canonical booking collections and provider-request ownership are preserved", async () => {
  const service = await source(
    "lib/customer/bookings/customer-booking-service.ts",
  );

  assert.match(service, /mainEvents: "mainEvents"/u);
  assert.match(service, /providerRequests: "providerRequests"/u);
  assert.match(service, /document\.data\(\)\.customerId === customerId/u);
  assert.doesNotMatch(service, /collection\(["']bookings["']\)/u);
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
