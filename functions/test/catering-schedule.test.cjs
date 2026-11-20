const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cateringScheduleMode,
  normalizeCateringSchedule,
  parseOccupancyWindow,
  rangesOverlap,
} = require("../lib/bookings/catering-schedule.js");

test("drop_off mode requires estimated drop-off and end time", () => {
  assert.equal(cateringScheduleMode("drop_off"), "drop_off_time");
  assert.equal(
    normalizeCateringSchedule({
      serviceTier: "drop_off",
      eventTime: "15:00",
    }).ok,
    false,
  );
  assert.deepEqual(
    normalizeCateringSchedule({
      serviceTier: "drop_off",
      eventTime: "15:00",
      eventEndTime: "20:00",
    }),
    {ok: true, value: {eventTime: "15:00", eventEndTime: "20:00"}},
  );
});

test("buffet_setup and full_service require end after start", () => {
  assert.equal(
    normalizeCateringSchedule({
      serviceTier: "buffet_setup",
      eventTime: "15:00",
    }).ok,
    false,
  );
  assert.deepEqual(
    normalizeCateringSchedule({
      serviceTier: "full_service",
      eventTime: "15:00",
      eventEndTime: "18:00",
    }),
    {ok: true, value: {eventTime: "15:00", eventEndTime: "18:00"}},
  );
});

test("drop-off occupancy uses range when end is present", () => {
  assert.deepEqual(
    parseOccupancyWindow("12:00", "14:00", {dropOff: true}),
    {startMinutes: 12 * 60, endMinutes: 14 * 60},
  );
  assert.deepEqual(
    parseOccupancyWindow("12:00", null, {dropOff: true}),
    {startMinutes: 12 * 60, endMinutes: 12 * 60},
  );
  assert.equal(
    parseOccupancyWindow("12:00", "11:00", {dropOff: false}),
    null,
  );
});

test("point and range overlap helpers", () => {
  assert.equal(
    rangesOverlap(
      {startMinutes: 12 * 60, endMinutes: 12 * 60},
      {startMinutes: 10 * 60, endMinutes: 14 * 60},
    ),
    true,
  );
  assert.equal(
    rangesOverlap(
      {startMinutes: 12 * 60, endMinutes: 12 * 60},
      {startMinutes: 13 * 60, endMinutes: 13 * 60},
    ),
    false,
  );
});
