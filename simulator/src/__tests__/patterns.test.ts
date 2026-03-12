import { describe, it, expect } from "vitest";
import {
  getDayMultiplier,
  getHourMultiplier,
  getActivityMultiplier,
  expectedEventsForDay,
  distributeEventsAcrossHours,
  getGrowthMultiplier,
  getDailyNoise,
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

describe("getGrowthMultiplier", () => {
  it("should return 1.0 for today (daysAgo=0)", () => {
    expect(getGrowthMultiplier(0, 90)).toBe(1.0);
  });

  it("should return 0.6 at the oldest day", () => {
    expect(getGrowthMultiplier(90, 90)).toBeCloseTo(0.6, 5);
  });

  it("should monotonically increase toward the present", () => {
    const values = [];
    for (let d = 90; d >= 0; d--) {
      values.push(getGrowthMultiplier(d, 90));
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it("should be bounded between 0.5 and 1.0", () => {
    for (let d = 0; d <= 90; d++) {
      const m = getGrowthMultiplier(d, 90);
      expect(m).toBeGreaterThanOrEqual(0.5);
      expect(m).toBeLessThanOrEqual(1.0);
    }
  });

  it("should clamp values beyond the backfill range", () => {
    expect(getGrowthMultiplier(200, 90)).toBeCloseTo(0.6, 5);
    expect(getGrowthMultiplier(-5, 90)).toBe(1.0);
  });

  it("should return 1.0 when totalBackfillDays is 0", () => {
    expect(getGrowthMultiplier(0, 0)).toBe(1.0);
    expect(getGrowthMultiplier(10, 0)).toBe(1.0);
  });
});

describe("getDailyNoise", () => {
  it("should be deterministic for the same date", () => {
    const date = new Date("2025-03-15T00:00:00Z");
    const v1 = getDailyNoise(date);
    const v2 = getDailyNoise(date);
    expect(v1).toBe(v2);
  });

  it("should produce different values for different dates", () => {
    const d1 = getDailyNoise(new Date("2025-03-15T00:00:00Z"));
    const d2 = getDailyNoise(new Date("2025-03-16T00:00:00Z"));
    const d3 = getDailyNoise(new Date("2025-03-17T00:00:00Z"));

    // At least two of the three should differ
    const allSame = d1 === d2 && d2 === d3;
    expect(allSame).toBe(false);
  });

  it("should produce values in a bounded range [0.3, 2.0]", () => {
    for (let i = 0; i < 365; i++) {
      const date = new Date(2025, 0, 1 + i);
      const noise = getDailyNoise(date);
      expect(noise).toBeGreaterThanOrEqual(0.3);
      expect(noise).toBeLessThanOrEqual(2.0);
    }
  });

  it("should have a mean near 1.0 over many days", () => {
    const values: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const date = new Date(2020, 0, 1 + i);
      values.push(getDailyNoise(date));
    }
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    // Mean should be near 1.0 (allowing for anomalies shifting it slightly)
    expect(mean).toBeGreaterThan(0.85);
    expect(mean).toBeLessThan(1.15);
  });

  it("should produce occasional anomalies (spikes and dips)", () => {
    const values: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const date = new Date(2020, 0, 1 + i);
      values.push(getDailyNoise(date));
    }
    const spikes = values.filter((v) => v >= 1.5);
    const dips = values.filter((v) => v <= 0.5);

    // With ~5% each over 1000 days, we expect roughly 50 of each
    // but allow wide tolerance since it's seeded PRNG
    expect(spikes.length).toBeGreaterThan(10);
    expect(dips.length).toBeGreaterThan(10);
  });
});
