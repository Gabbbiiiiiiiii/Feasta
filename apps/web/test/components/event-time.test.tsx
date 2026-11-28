import {expect, it} from "vitest";
import {formatEventTime} from "@/lib/presentation/event-time";
it.each([["00:00", "12:00 AM"], ["00:05", "12:05 AM"], ["06:38", "6:38 AM"], ["06:38:00", "6:38 AM"], ["11:59", "11:59 AM"], ["12:00", "12:00 PM"], ["12:30", "12:30 PM"], ["13:05", "1:05 PM"], ["18:38", "6:38 PM"], ["23:59", "11:59 PM"]])("formats %s as %s", (value, expected) => {expect(formatEventTime(value)).toBe(expected);});
it.each([null, undefined, "", "legacy time", "25:00", "12:60"])("handles invalid time %s safely", value => {expect(formatEventTime(value)).toBe("");});
