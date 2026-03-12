# Report: Align Backfill and Live Mode Rates

## Problem

The simulator had a dramatic data cliff between historical (backfill) and real-time (live) data. Backfill produced ~8-12 events/hour at peak for the largest org, while live mode generated ~5,400 events/hour total (3 events/sec hardcoded). This created a ~225x jump visible on dashboards.

## Solution

Derived the live event rate from the same parameters used during backfill, so both modes produce consistent data volumes.

### Changes

**`simulator/src/generators/patterns.ts`** - Added `deriveLiveEventsPerSecond()`:
- Computes expected events/second for the current moment using the same formula as backfill: `baseDailyEvents * dayMultiplier * growth * noise * hourFraction / 3600`
- Sums across all orgs to get the total rate
- Uses the same temporal multipliers (day-of-week, hour-of-day), growth curve, and daily noise that backfill applies

**`simulator/src/config.ts`** - Changed `liveEventsPerSec` to `liveEventsPerSecOverride`:
- When `SIMULATOR_LIVE_EVENTS_PER_SEC` env var is set, it overrides the derived rate
- When unset (default), the rate is derived from backfill parameters

**`simulator/src/index.ts`** - Refactored live mode loop:
- Derives the initial live rate from org profiles and temporal multipliers
- Recalculates every minute to pick up hour/day boundary changes
- Logs derived rate at startup and when it changes
- Guards against zero rate (defaults to 60s interval)

### Expected Behavior

For Acme (200 base daily events) on a Tuesday at 2pm (peak):
- Hour share: 200 * (1.0 / 8.8) = ~22.7 events/hour
- Events/sec: ~0.006 (one event every ~2.5 minutes)
- Combined with Globex (120 base): ~0.01 events/sec total

This matches what backfill generates for the same time period, eliminating the data cliff.

### Tests Added

6 new tests in `patterns.test.ts` for `deriveLiveEventsPerSecond`:
- Positive rate during peak weekday hours
- Lower rate at night vs peak
- Lower rate on weekends vs weekdays
- Linear scaling with number of orgs
- Rate consistent with backfill event counts (5-60 events/hour range at peak)
- Zero rate for empty org list

### Verification

- All 71 tests pass (`docker compose exec simulator npm run test`)
- Lint passes (`docker compose exec simulator npm run lint`)
