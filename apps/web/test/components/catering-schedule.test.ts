import {describe, expect, it} from "vitest";
import {
  DROP_OFF_END_TIME_LABEL,
  DROP_OFF_TIME_LABEL,
  cateringScheduleFieldLabel,
  cateringScheduleMode,
  formatCateringScheduleDisplay,
  normalizeCateringSchedule,
  usesDropOffTimeDisplay,
} from "@/lib/catering/catering-schedule";

describe("catering schedule helpers", () => {
  it("uses drop-off mode only for drop_off", () => {
    expect(cateringScheduleMode("drop_off")).toBe("drop_off_time");
    expect(cateringScheduleMode("buffet_setup")).toBe("event_range");
    expect(cateringScheduleMode("full_service")).toBe("event_range");
    expect(cateringScheduleMode(null)).toBe("event_range");
  });

  it("requires estimated drop-off and end time for drop_off", () => {
    expect(
      normalizeCateringSchedule({
        serviceTier: "drop_off",
        eventTime: "14:30",
      }),
    ).toMatchObject({ok: false, field: "eventEndTime"});

    expect(
      normalizeCateringSchedule({
        serviceTier: "drop_off",
        eventTime: "14:30",
        eventEndTime: "14:30",
      }),
    ).toMatchObject({ok: false, field: "eventEndTime"});

    expect(
      normalizeCateringSchedule({
        serviceTier: "drop_off",
        eventTime: "14:30",
        eventEndTime: "18:00",
      }),
    ).toEqual({
      ok: true,
      value: {eventTime: "14:30", eventEndTime: "18:00"},
    });
  });

  it("requires a start/end range for buffet and full-service", () => {
    expect(
      normalizeCateringSchedule({
        serviceTier: "buffet_setup",
        eventTime: "14:30",
        eventEndTime: "14:30",
      }),
    ).toMatchObject({ok: false, field: "eventEndTime"});

    expect(
      normalizeCateringSchedule({
        serviceTier: "full_service",
        eventTime: "14:30",
        eventEndTime: "18:00",
      }),
    ).toEqual({
      ok: true,
      value: {eventTime: "14:30", eventEndTime: "18:00"},
    });
  });

  it("labels drop-off as estimated drop-off range with to", () => {
    expect(DROP_OFF_TIME_LABEL).toBe("Estimated Drop-Off Time");
    expect(DROP_OFF_END_TIME_LABEL).toBe("to");
    expect(cateringScheduleFieldLabel("eventTime", "drop_off")).toBe(
      "Estimated Drop-Off Time",
    );
    expect(cateringScheduleFieldLabel("eventEndTime", "drop_off")).toBe(
      "to",
    );
    expect(
      formatCateringScheduleDisplay({
        serviceTier: "drop_off",
        eventTime: "14:30",
        eventEndTime: "18:00",
      }),
    ).toBe("2:30 PM–6:00 PM");
    expect(
      usesDropOffTimeDisplay({
        serviceTier: "drop_off",
        eventTime: "14:30",
        eventEndTime: "18:00",
      }),
    ).toBe(false);
    expect(
      usesDropOffTimeDisplay({
        serviceTier: "drop_off",
        eventTime: "14:30",
        eventEndTime: "",
      }),
    ).toBe(true);
  });

  it("keeps historical range display when tier is unknown", () => {
    expect(
      formatCateringScheduleDisplay({
        eventTime: "10:00",
        eventEndTime: "14:00",
      }),
    ).toBe("10:00 AM–2:00 PM");
    expect(
      usesDropOffTimeDisplay({
        eventTime: "10:00",
        eventEndTime: "",
      }),
    ).toBe(true);
  });
});
