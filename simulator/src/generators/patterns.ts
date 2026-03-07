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
