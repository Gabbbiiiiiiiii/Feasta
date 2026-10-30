import {describe, expect, it} from "vitest";

import {formatPhilippineDate} from "@/lib/dates/philippine-date";

describe("Philippine dates", () => {
  it("writes calendar dates in Philippine long form using Manila time", () => {
    expect(formatPhilippineDate("2026-09-28")).toBe("September 28, 2026");
    expect(formatPhilippineDate("2026-09-28T16:30:00.000Z")).toBe("September 29, 2026");
  });

  it("leaves values that are not dates unchanged", () => {
    expect(formatPhilippineDate("2026-02-30")).toBe("2026-02-30");
    expect(formatPhilippineDate("not a date")).toBe("not a date");
  });
});
