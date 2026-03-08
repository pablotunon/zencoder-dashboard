import { describe, it, expect } from "vitest";
import {
  getDayMultiplier,
  getHourMultiplier,
  getActivityMultiplier,
  expectedEventsForDay,
  distributeEventsAcrossHours,
} from "../generators/patterns.js";

// SIM-U03: Temporal patterns — weekday > weekend activity
describe("SIM-U03: Temporal patterns", () => {
  it("weekday multiplier should be greater than weekend", () => {
    const monday = getDayMultiplier(1);
    const saturday = getDayMultiplier(6);
    const sunday = getDayMultiplier(0);

    expect(monday).toBeGreaterThan(saturday);
    expect(monday).toBeGreaterThan(sunday);
    expect(monday).toBe(1.0);
    expect(saturday).toBe(0.3);
    expect(sunday).toBe(0.3);
  });

  it("peak hours should have higher multiplier than off-hours", () => {
    const peak = getHourMultiplier(12); // noon
    const night = getHourMultiplier(3); // 3am

    expect(peak).toBeGreaterThan(night);
    expect(peak).toBe(1.0);
    expect(night).toBeLessThan(0.1);
  });

  it("Monday should produce more events than Sunday", () => {
    // Monday = Jan 13, 2025; Sunday = Jan 12, 2025
    const monday = new Date("2025-01-13T12:00:00Z");
    const sunday = new Date("2025-01-12T12:00:00Z");

    const mondayEvents = expectedEventsForDay(monday, 200);
    const sundayEvents = expectedEventsForDay(sunday, 200);

    expect(mondayEvents).toBeGreaterThan(sundayEvents);
    expect(mondayEvents).toBe(200); // Full weekday
    expect(sundayEvents).toBe(60); // 200 * 0.3
  });
});

describe("getActivityMultiplier", () => {
  it("should combine day and hour multipliers", () => {
    // Monday at noon = 1.0 * 1.0
    const mondayNoon = new Date("2025-01-13T12:00:00Z");
    expect(getActivityMultiplier(mondayNoon)).toBe(1.0);

    // Sunday at 3am = 0.3 * 0.05
    const sunday3am = new Date("2025-01-12T03:00:00Z");
    expect(getActivityMultiplier(sunday3am)).toBeCloseTo(0.015, 3);
  });
});

describe("distributeEventsAcrossHours", () => {
  it("should sum to total events", () => {
    const total = 200;
    const distribution = distributeEventsAcrossHours(total);

    expect(distribution).toHaveLength(24);
    expect(distribution.reduce((s, c) => s + c, 0)).toBe(total);
  });

  it("should have peak hours with more events than night hours", () => {
    const distribution = distributeEventsAcrossHours(200);

    // Hour 12 (noon, peak) should have more events than hour 3 (night)
    expect(distribution[12]).toBeGreaterThan(distribution[3]);
  });

  it("should handle 0 total events", () => {
    const distribution = distributeEventsAcrossHours(0);
    expect(distribution).toHaveLength(24);
    expect(distribution.reduce((s, c) => s + c, 0)).toBe(0);
  });
});
