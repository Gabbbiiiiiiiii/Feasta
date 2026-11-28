import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("provider availability data contract", () => {
  const root = process.cwd();
  const service = readFileSync(
    join(
      root,
      "src/lib/provider/availability/provider-availability-service.ts",
    ),
    "utf8",
  );
  const types = readFileSync(
    join(
      root,
      "src/lib/provider/availability/provider-availability-types.ts",
    ),
    "utf8",
  );
  const settingsClient = readFileSync(
    join(
      root,
      "src/lib/provider/availability/provider-availability-client.ts",
    ),
    "utf8",
  );
  const dateClient = readFileSync(
    join(
      root,
      "src/lib/provider/calendar/provider-calendar-client.ts",
    ),
    "utf8",
  );
  const page = readFileSync(
    join(
      root,
      "src/app/provider/availability/page.tsx",
    ),
    "utf8",
  );

  it("loads only the authenticated provider's approved settings", () => {
    expect(service).toMatch(/^import "server-only";/u);
    expect(service).toContain("await requireApprovedProvider()");
    expect(service).toContain(".doc(providerId)");
    expect(service).toContain(
      "providerSnapshot.data()?.ownerId !== account.uid",
    );
    expect(service).not.toMatch(
      /getProviderAvailabilitySettings\s*\([^)]*providerId/u,
    );
    expect(page).toContain("await getProviderAvailabilitySettings()");
    expect(page).toContain("initialSettings={settings}");
  });

  it("exposes canonical schedule fields and derived capabilities", () => {
    for (const field of [
      "operatingDays",
      "unavailableDates",
      "bookingLeadTimeDays",
      "acceptsMultipleEventsPerDay",
      "maxEventsPerDay",
      "guestCapacity",
      "availableStaffCount",
      "availableEquipmentCount",
      "providerServiceType",
      "serviceCategories",
      "capacityCapabilities",
    ]) {
      expect(types).toContain(field);
    }
    expect(service).toContain(
      "providerCapacityCapabilities(serviceCategories)",
    );
  });

  it("keeps protected provider fields out of the read contract", () => {
    expect(types).not.toMatch(
      /ownerId|ownerEmail|approvedBy|reviewedBy|suspensionReason/u,
    );
  });

  it("uses App Check-aware settings mutation without client provider identity", () => {
    const inputContract = types.slice(
      types.indexOf("export type UpdateProviderAvailabilitySettingsInput"),
      types.indexOf("export type UpdateProviderAvailabilitySettingsResult"),
    );

    expect(settingsClient).toContain(
      '"updateProviderAvailabilitySettings"',
    );
    expect(settingsClient).toContain("initializeBrowserAppCheck()");
    expect(inputContract).not.toContain("providerId");
  });

  it("reuses the existing unavailable-date callable contract", () => {
    expect(settingsClient).toContain('"updateProviderAvailability"');
    expect(types).toContain('"mark_unavailable"');
    expect(types).toContain('"mark_available"');
    expect(settingsClient).toContain("initializeBrowserAppCheck()");
    expect(dateClient).toContain("provider-availability-client");
  });
});
