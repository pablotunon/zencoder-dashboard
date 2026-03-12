/**
 * Temporal patterns for event generation.
 *
 * - Weekdays have more activity than weekends (multiplier)
 * - Peak hours are 10am-4pm
 * - Team activity is proportional to team size
 */

/**
 * Returns an activity multiplier (0-1) for a given date,
 * based on day-of-week and hour-of-day.
 */
export function getActivityMultiplier(date: Date): number {
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 6=Sat
  const hour = date.getUTCHours();

  const dayMultiplier = getDayMultiplier(dayOfWeek);
  const hourMultiplier = getHourMultiplier(hour);

  return dayMultiplier * hourMultiplier;
}

/**
 * Weekday vs weekend multiplier.
 */
export function getDayMultiplier(dayOfWeek: number): number {
  // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 0.3;
  }
  return 1.0;
}

/**
 * Hour-of-day multiplier simulating work patterns.
 * Peak: 10am-4pm (1.0), Shoulder: 8-10am and 4-7pm (0.6), Off-hours: (0.15)
 */
export function getHourMultiplier(hour: number): number {
  if (hour >= 10 && hour < 16) return 1.0; // Peak
  if (hour >= 8 && hour < 10) return 0.6; // Morning ramp-up
  if (hour >= 16 && hour < 19) return 0.6; // Evening wind-down
  if (hour >= 7 && hour < 8) return 0.3; // Early
  if (hour >= 19 && hour < 22) return 0.2; // Late evening
  return 0.05; // Night hours (some CI/automation still runs)
}

/**
 * Calculate expected events for a given day across all teams.
 * base is the average daily events for a full weekday.
 */
export function expectedEventsForDay(
  date: Date,
  baseDailyEvents: number,
): number {
  const dayMultiplier = getDayMultiplier(date.getUTCDay());
  return Math.round(baseDailyEvents * dayMultiplier);
}

/**
 * Growth multiplier — older data should have fewer events to simulate
 * organic adoption growth. Linear curve from ~0.6x at the start of
 * the backfill period to 1.0x today.
 *
 * @param daysAgo - How many days in the past (0 = today)
 * @param totalBackfillDays - Total number of days in the backfill window
 * @returns Multiplier in [0.5, 1.0]
 */
export function getGrowthMultiplier(
  daysAgo: number,
  totalBackfillDays: number,
): number {
  if (totalBackfillDays <= 0) return 1.0;
  const clamped = Math.max(0, Math.min(daysAgo, totalBackfillDays));
  // Linear interpolation: 0.6 at oldest day → 1.0 at today
  const t = 1 - clamped / totalBackfillDays; // 0 at oldest, 1 at newest
  return 0.6 + 0.4 * t;
}

/**
 * Simple seeded PRNG (mulberry32) for deterministic daily noise.
 * Returns a value in [0, 1).
 */
function seededRandom(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Deterministic daily noise multiplier. Returns a value around 1.0
 * with occasional spikes and dips to simulate real-world variance.
 *
 * - ~90% of days: normal noise (stddev ~0.15, bounded ~[0.7, 1.3])
 * - ~5% of days: spike (1.5–2.0x, simulating deploy/launch days)
 * - ~5% of days: dip (0.3–0.5x, simulating holidays/incidents)
 *
 * The result is deterministic for the same date across runs.
 *
 * @param date - The date to compute noise for
 * @returns Multiplier, typically in [0.3, 2.0]
 */
export function getDailyNoise(date: Date): number {
  // Seed from date components (year * 10000 + month * 100 + day)
  const seed =
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate();

  const r1 = seededRandom(seed);
  const r2 = seededRandom(seed + 1);

  // Use Box-Muller to get a normal distribution from two uniform values
  const normal =
    Math.sqrt(-2 * Math.log(Math.max(r1, 1e-10))) *
    Math.cos(2 * Math.PI * r2);

  // Determine if this day is an anomaly using a third seeded value
  const r3 = seededRandom(seed + 2);

  if (r3 < 0.05) {
    // Spike day: 1.5–2.0x
    return 1.5 + seededRandom(seed + 3) * 0.5;
  }
  if (r3 < 0.10) {
    // Dip day: 0.3–0.5x
    return 0.3 + seededRandom(seed + 4) * 0.2;
  }

  // Normal day: mean 1.0, stddev 0.15, clamped to [0.7, 1.3]
  const noise = 1.0 + normal * 0.15;
  return Math.max(0.7, Math.min(1.3, noise));
}

/**
 * Distribute events across hours of a day based on hour multipliers.
 * Returns an array of 24 counts (one per hour).
 */
export function distributeEventsAcrossHours(totalEvents: number): number[] {
  const hourWeights = Array.from({ length: 24 }, (_, h) =>
    getHourMultiplier(h),
  );
  const totalWeight = hourWeights.reduce((sum, w) => sum + w, 0);

  const counts = hourWeights.map((w) =>
    Math.round((w / totalWeight) * totalEvents),
  );

  // Adjust rounding errors — add/remove from peak hour
  const diff = totalEvents - counts.reduce((sum, c) => sum + c, 0);
  counts[12] += diff;

  return counts;
}
