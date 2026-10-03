import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("provider booking service contract", () => {
  const root = process.cwd();
  const service = readFileSync(
    join(
      root,
      "src/lib/provider/bookings/provider-booking-service.ts",
    ),
    "utf8",
  );
  const types = readFileSync(
    join(
      root,
      "src/lib/provider/bookings/provider-booking-types.ts",
    ),
    "utf8",
  );
  const indexes = readFileSync(
    join(root, "../../firebase/firestore.indexes.json"),
    "utf8",
  );
  const page = readFileSync(
    join(root, "src/app/provider/bookings/page.tsx"),
    "utf8",
  );
  const actions = readFileSync(
    join(root, "src/app/provider/bookings/actions.ts"),
    "utf8",
  );
  const client = readFileSync(
    join(
      root,
      "src/lib/provider/bookings/provider-booking-client.ts",
    ),
    "utf8",
  );

  it("uses approved server identity and provider-scoped queries", () => {
    expect(service).toMatch(/^import "server-only";/u);
    expect(service).toContain("await requireApprovedProvider()");
    expect(service).toContain('.where("providerId", "==", providerId)');
    expect(service).not.toMatch(
      /getProviderBookingPage\s*\([^)]*providerId/u,
    );
  });

  it("protects the operational route through the approved-provider service", () => {
    expect(page).toContain("await getProviderBookingPage(initialFilters)");
    expect(actions).toContain("return await getProviderBookingPage(filters)");
    expect(service).toContain("await requireApprovedProvider()");
    expect(page).not.toContain("firebase/firestore");
  });

  it("joins only canonical events and linked canonical payments", () => {
    expect(service).toContain('mainEvents: "mainEvents"');
    expect(service).toContain('providerRequests: "providerRequests"');
    expect(service).toContain('payments: "payments"');
    expect(service).toContain("adminDb.getAll(...references)");
    expect(service).toContain(
      '.where("providerRequestId", "in", chunk)',
    );
    expect(service).toContain(
      "data.providerRequestId !== expected.providerRequestId",
    );
    expect(service).toContain(
      "mainEvent.customerId !== customerId",
    );
    expect(service).not.toMatch(/collection\(["']bookings["']\)/u);
  });

  it("rechecks ownership for direct booking details", () => {
    expect(service).toContain("export async function getProviderBooking(");
    expect(service).toContain(
      "requestSnapshot.data()?.providerId !== providerId",
    );
    expect(service).toContain("throw unavailableBooking()");
  });

  it("maps UI filters to canonical request statuses", () => {
    expect(service).toContain('pending: ["pending"]');
    expect(service).toContain('"accepted",');
    expect(service).toContain('"waiting_for_down_payment",');
    expect(service).toContain('"payment_processing",');
    expect(service).toContain('confirmed: ["confirmed"]');
    expect(service).toContain('in_progress: ["in_progress"]');
    expect(service).toContain('completed: ["completed"]');
    expect(service).toContain('cancelled: ["cancelled"]');
    expect(types).toContain('| "upcoming"');
  });

  it("keeps list reads bounded and cursor-paginated", () => {
    expect(service).toContain("MAX_PAGE_SIZE = 30");
    expect(service).toContain("filters.pageSize + 1");
    expect(service).toContain("FieldPath.documentId()");
    expect(service).toContain("encodeCursor(");
    expect(service).toContain("decodeCursor(");
  });

  it("uses bounded aggregation queries for exact provider summaries", () => {
    expect(service).toContain("loadProviderBookingSummary(providerId)");
    expect(service).toContain("query.count().get()");
    expect(service).toContain("Timestamp.now()");
    expect(types).toContain("export type ProviderBookingSummary");
    expect(types).toContain("summary: ProviderBookingSummary");
  });

  it("uses the canonical event timeline after ownership checks", () => {
    expect(service).toContain('.collection("timeline")');
    expect(service).toContain("requestData.providerId !== providerId");
    expect(service).toContain(
      "mainEventSnapshot.data()?.customerId !== customerId",
    );
    expect(service).not.toContain("bookingTimelines");
  });

  it("uses App Check-aware lifecycle wrappers without accepting provider identity", () => {
    expect(client).toContain('"markProviderBookingInProgress"');
    expect(client).toContain('"completeProviderBooking"');
    expect(client).toContain("initializeBrowserAppCheck()");
    expect(client).toContain("providerRequestId: normalizedRequestId");
    expect(client).not.toMatch(/providerId\s*:/u);
  });

  it("declares only the required provider date indexes", () => {
    const parsed = JSON.parse(indexes) as {
      indexes: Array<{
        collectionGroup: string;
        fields: Array<{fieldPath: string; order?: string}>;
      }>;
    };
    const providerDateIndexes = parsed.indexes.filter((index) =>
      index.collectionGroup === "providerRequests" &&
      index.fields.some((field) => field.fieldPath === "eventDate"),
    );

    expect(providerDateIndexes).toHaveLength(2);
    expect(providerDateIndexes.some((index) =>
      index.fields.some((field) => field.fieldPath === "status"),
    )).toBe(true);
  });
});
