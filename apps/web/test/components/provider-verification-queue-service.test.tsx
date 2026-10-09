import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import type { ProviderVerificationQueueFilters } from "@/lib/admin/provider-verification/provider-verification-types";

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => {
  type Row = Record<string, unknown>;
  const value = (input: unknown): string | number => {
    if (input && typeof input === "object" && "toMillis" in input) {
      return (input as { toMillis(): number }).toMillis();
    }
    return input as string | number;
  };
  const document = (row: Row) => ({ id: row.id, exists: true, data: () => row });
  class Query {
    rows: Row[];
    ordering: { field: string; direction: string }[] = [];
    after: unknown[] | null = null;
    before: unknown[] | null = null;
    size = Infinity;
    last = false;
    constructor(rows: Row[]) { this.rows = [...rows]; }
    where(field: string, operator: string, expected: unknown) {
      this.rows = this.rows.filter((row) => {
        if (operator === "in") return (expected as unknown[]).includes(row[field]);
        if (operator === "==") return row[field] === expected;
        if (operator === "array-contains") return (row[field] as unknown[] ?? []).includes(expected);
        if (operator === ">=") return value(row[field]) >= value(expected);
        if (operator === "<=") return value(row[field]) <= value(expected);
        throw new Error("Unexpected operator");
      });
      return this;
    }
    orderBy(field: unknown, direction: string) {
      this.ordering.push({ field: typeof field === "string" ? field : "id", direction });
      return this;
    }
    startAfter(...values: unknown[]) { this.after = values; return this; }
    endBefore(...values: unknown[]) { this.before = values; return this; }
    limit(size: number) { this.size = size; return this; }
    limitToLast(size: number) { this.size = size; this.last = true; return this; }
    doc(id: string) { return { id }; }
    async get() {
      const compare = (left: Row, right: Row) => {
        for (const { field, direction } of this.ordering) {
          const a = value(left[field]); const b = value(right[field]);
          const difference = a < b ? -1 : a > b ? 1 : 0;
          if (difference) return direction === "desc" ? -difference : difference;
        }
        return 0;
      };
      const cursorRow = (values: unknown[]) => Object.fromEntries(this.ordering.map(({ field }, index) => [field, values[index]]));
      let rows = this.rows.sort(compare);
      if (this.after) rows = rows.filter((row) => compare(row, cursorRow(this.after!)) > 0);
      if (this.before) rows = rows.filter((row) => compare(row, cursorRow(this.before!)) < 0);
      rows = this.last ? rows.slice(-this.size) : rows.slice(0, this.size);
      return { docs: rows.map(document) };
    }
  }
  return { adminDb: {
    collection: vi.fn((name: string) => new Query(name === "providerVerifications" ? state.rows : [])),
    getAll: async (...references: { id: string }[]) => references.map(({ id }) => ({ id, exists: false, data: () => undefined })),
  } };
});

import { getProviderVerificationQueue } from "@/lib/admin/provider-verification/provider-verification-service";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

const statuses = ["pending", "draft", "submitted", "under_review", "resubmission_required", "approved", "rejected", "suspended"] as const;
const filters: ProviderVerificationQueueFilters = {
  status: "all", search: "", serviceType: "all", from: "", to: "", cursor: null, direction: "next",
};
function application(status: string, index: number) {
  return {
    id: "application-" + String(index).padStart(2, "0"),
    providerId: "provider-" + index, ownerId: "owner-" + index,
    businessName: "Provider " + index, ownerFirstName: "Owner", businessEmail: "provider@example.test",
    providerServiceType: index % 2 ? "addon" : "catering", status,
    createdAt: Timestamp.fromDate(new Date("2026-09-" + String(index + 1).padStart(2, "0") + "T00:00:00Z")),
    searchTokens: ["provider " + index],
  };
}
beforeEach(() => {
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(adminDb.collection).mockClear();
  state.rows = statuses.map(application);
});

describe("provider verification status queries", () => {
  it("includes all eight statuses, including approved and other non-pending applications", async () => {
    const result = await getProviderVerificationQueue(filters);
    expect(result.items).toHaveLength(8);
    expect(new Set(result.items.map((item) => item.status))).toEqual(new Set(statuses));
    expect(new Set(result.items.map((item) => item.providerId)).size).toBe(8);
  });

  it("returns providers when every application is outside the old pending queue", async () => {
    state.rows = ["draft", "approved", "rejected", "suspended", "resubmission_required"].map(application);
    expect((await getProviderVerificationQueue(filters)).items).toHaveLength(5);
  });

  it.each(statuses)("filters %s exactly", async (status) => {
    const result = await getProviderVerificationQueue({ ...filters, status });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe(status);
  });

  it("retains search, service and date filtering for all statuses", async () => {
    const result = await getProviderVerificationQueue({
      ...filters, search: "Provider 5", serviceType: "addon", from: "2026-09-01", to: "2026-09-30",
    });
    expect(result.items.map((item) => item.status)).toEqual(["approved"]);
    expect((await getProviderVerificationQueue({ ...filters, search: "missing" })).items).toEqual([]);
  });

  it("pages forward and backward across mixed statuses without duplicates or omissions", async () => {
    state.rows = Array.from({ length: 27 }, (_, index) => application(statuses[index % statuses.length], index));
    const first = await getProviderVerificationQueue(filters);
    expect(first.items).toHaveLength(20);
    expect(first.previousCursor).toBeNull();
    expect(first.nextCursor).not.toBeNull();
    const second = await getProviderVerificationQueue({ ...filters, cursor: first.nextCursor });
    expect(second.items).toHaveLength(7);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(27);
    const back = await getProviderVerificationQueue({ ...filters, cursor: second.previousCursor, direction: "previous" });
    expect(back.items).toEqual(first.items);
    expect(back.previousCursor).toBeNull();
  });

  it("requires admin authorization before querying", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("Forbidden"));
    await expect(getProviderVerificationQueue(filters)).rejects.toThrow("Forbidden");
    expect(adminDb.collection).not.toHaveBeenCalled();
  });
});
