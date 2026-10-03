import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const source = (relativePath: string) => readFileSync(
  resolve(process.cwd(), relativePath),
  "utf8",
);

describe("admin report service contract", () => {
  it("authorizes an administrator before reading or returning cached data", () => {
    const service = source(
      "src/lib/admin/reports/admin-report-service.ts",
    );
    const entryPoint = service.slice(
      service.indexOf("export async function getAdminReport"),
      service.indexOf("async function queryAdminReport"),
    );

    expect(entryPoint).toContain("await requireAdmin()");
    expect(entryPoint.indexOf("await requireAdmin()")).toBeLessThan(
      entryPoint.indexOf("reportCache.get"),
    );
  });

  it("keeps every report collection query date-bounded and field-projected", () => {
    const service = source(
      "src/lib/admin/reports/admin-report-service.ts",
    );
    const loader = service.slice(
      service.indexOf("async function loadReportSource"),
      service.indexOf("function selectPeriod"),
    );

    expect(loader).toContain("await Promise.all");
    expect(loader.match(/\.where\("createdAt", ">=", startTimestamp\)/gu))
      .toHaveLength(3);
    expect(loader.match(/\.where\("createdAt", "<", endTimestamp\)/gu))
      .toHaveLength(3);
    expect(loader.match(/\.select\(/gu)).toHaveLength(3);
    expect(loader).not.toContain(".limit(");
  });

  it("uses a bounded failure-safe cache and batched provider loading", () => {
    const service = source(
      "src/lib/admin/reports/admin-report-service.ts",
    );

    expect(service).toContain("const REPORT_CACHE_MS = 30 * 1000");
    expect(service).toContain("const MAX_CACHE_ENTRIES = 20");
    expect(service).toContain("void promise.catch");
    expect(service).toContain("reportCache.delete(cacheKey)");
    expect(service).toContain("adminDb.getAll(...references)");
  });

  it("does not mislabel provider payment volume as FEASTA revenue", () => {
    const service = source(
      "src/lib/admin/reports/admin-report-service.ts",
    );

    expect(service).toContain('status: "not_configured" as const');
    expect(service).toContain("grossPlatformFeeInCentavos: null");
    expect(service).toContain("processingFeeInCentavos: null");
    expect(service).toContain("netPlatformRevenueInCentavos: null");
    expect(service).not.toMatch(/commission\s*[+*/-]/iu);
  });

  it("exposes only a typed server action that delegates to the secured service", () => {
    const action = source("src/app/admin/reports/actions.ts");

    expect(action.trimStart().startsWith('"use server";')).toBe(true);
    expect(action).toContain("filters: AdminReportFilters");
    expect(action).toContain("Promise<AdminReportResult>");
    expect(action).toContain("return getAdminReport(filters)");
    expect(action).not.toContain("adminDb");
  });
});