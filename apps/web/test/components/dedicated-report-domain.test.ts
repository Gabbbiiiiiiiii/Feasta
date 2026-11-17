import {expect, it} from "vitest";
import {accountState, inPeriod} from "@/lib/admin/reports/dedicated-report-domain";
import type {ReportFilters} from "@/lib/admin/reports/dedicated-report-types";
it("applies Philippine date boundaries rather than UTC dates", () => {
  const filters={startDate:"2026-11-01",endDate:"2026-11-01"} as ReportFilters;
  expect(inPeriod("2026-10-31T16:00:00Z",filters)).toBe(true);
  expect(inPeriod("2026-11-01T15:59:59Z",filters)).toBe(true);
  expect(inPeriod("2026-11-01T16:00:00Z",filters)).toBe(false);
});
it("does not convert verification review into an active account", () => {
  expect(accountState({isActive:true},{isActive:true,verificationStatus:"under_review"})).toBe("Under Review");
  expect(accountState({isActive:false})).toBe("Inactive");
});
