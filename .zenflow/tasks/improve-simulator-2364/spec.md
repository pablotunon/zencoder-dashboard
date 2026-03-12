# Technical Specification: Improve Simulator Realism

## Difficulty: Medium

The changes span multiple files within a single service but follow established patterns. The main risks are breaking existing test assertions and introducing subtle statistical bugs. No new services, APIs, or data model changes required.

## Technical Context

- **Language**: TypeScript (ES modules, strict mode)
- **Runtime**: Node.js via `tsx` inside Docker
- **Test framework**: Vitest
- **Key files**:
  - `simulator/src/generators/events.ts` — event generation, distributions, weighted random
  - `simulator/src/generators/patterns.ts` — temporal multipliers (day-of-week, hour-of-day)
  - `simulator/src/generators/org.ts` — org/team/user definitions
  - `simulator/src/index.ts` — backfill loop and live mode orchestration
  - `simulator/src/__tests__/events.test.ts` — event generation tests
  - `simulator/src/__tests__/patterns.test.ts` — temporal pattern tests

## Problem Analysis

The simulator currently produces data that looks "too clean" due to several issues:

### Issue 1: Uniform distributions across breakdowns
All orgs use the same agent type weights, model weights, error distributions, and tool selections. In reality, different teams, orgs, and projects would have distinct usage fingerprints. For example, a DevOps team would use CI agents far more than a Frontend team.

### Issue 2: Narrow randomization ranges
Numeric values (duration, tokens, cost, queue wait) use uniform random distributions within fixed ranges. This produces data that clusters around the midpoint with no tails, outliers, or skew — the opposite of real-world telemetry. Real data follows log-normal or similar skewed distributions where most values are small but occasional large values exist.

### Issue 3: Backfill/live rate discrepancy
- **Backfill**: `baseDailyEvents` per org (200 for Acme, 120 for Globex), distributed across 24 hours with temporal weights. This works out to roughly 8-12 events/hour at peak for Acme.
- **Live mode**: 3 events/second across 2 orgs = ~5,400 events/hour total (~2,700 per org at peak). That's ~225x the backfill rate.
- This creates a dramatic cliff in the dashboard between historical and current data.

### Issue 4: No growth trend (research-informed)
Real SaaS data shows organic growth over time. The current simulator uses flat `baseDailyEvents` for the entire 90-day backfill period, which looks artificial on time-series charts.

### Issue 5: No anomalies or variance (research-informed)
Real telemetry has occasional spikes (deploy days, incidents), dips (holidays, outages), and day-to-day natural variance. The current simulator is perfectly smooth — every Monday looks identical.

## Implementation Approach

### Change 1: Per-breakdown multipliers for agent types, models, and tools

Add org-level and team-level profile overrides so different breakdowns produce distinct usage patterns.

**In `events.ts`**:
- Extend `OrgEventProfile` with optional overrides for `agentTypeWeights`, `modelWeights`, and `preferredTools`.
- Add a new `TeamEventProfile` concept (a map of team_id to overrides) so that e.g. DevOps teams use CI more, Frontend teams use coding more.
- The `generateRunEvents` function will accept and use these overrides when picking agent type, model, and tools, falling back to global defaults when no override exists.

**Data design** (example profiles):
```typescript
// Acme org overrides
org_acme: {
  baseDailyEvents: 200,
  successRate: 0.87,
  teamProfiles: {
    team_platform: { agentTypeWeights: { ci: 0.25, coding: 0.30, ... }, preferredTools: ["docker", "terminal", ...] },
    team_frontend: { agentTypeWeights: { coding: 0.55, review: 0.20, ... }, preferredTools: ["linter", "test_runner", ...] },
    ...
  }
}
```

### Change 2: Wider, more realistic randomization distributions

Replace uniform random (`min + Math.random() * range`) with log-normal-like distributions for numeric metrics. This produces many small values with occasional large ones — matching real telemetry patterns.

**In `events.ts`**:
- Add a `skewedRandom(min, max, skew)` utility that uses the Box-Muller transform or a simpler power-curve approach to produce right-skewed distributions.
- Apply to: `duration_ms`, `tokens_input`, `tokens_output`, `queue_wait_ms`.
- Add occasional outliers: ~2% chance of a value near or beyond the normal max (e.g., a very long-running agent, or a massive token count).

**Distribution targets**:
- Duration: median ~30s (most runs are quick), long tail to 5min
- Tokens input: median ~3,000, long tail to 50k
- Tokens output: median ~500, long tail to 10k
- Queue wait: median ~500ms, long tail to 10s

### Change 3: Align backfill and live mode rates

The backfill rate and live rate must match to avoid a visible cliff in the data.

**In `index.ts`**:
- Derive the live events per second from the same `baseDailyEvents` and temporal patterns, rather than using a hardcoded rate.
- Calculate: at the current hour, the expected events/hour for each org (using `getHourMultiplier` and `getDayMultiplier`), then divide by 3600 to get events/second.
- Recalculate periodically (e.g., every minute) as the hour changes.
- Keep the `SIMULATOR_LIVE_EVENTS_PER_SEC` env var as an optional override, but default to the derived rate.

**Expected outcome**: If Acme has 200 base daily events and it's Tuesday at 2pm (peak), the hourly share is ~25 events/hour = ~0.007 events/sec. This means one event every ~2.5 minutes per org — consistent with what was backfilled.

### Change 4: Growth trend over backfill period

Add a gradual growth curve to `baseDailyEvents` over the backfill period so older data has fewer events than recent data.

**In `patterns.ts`**:
- Add a `getGrowthMultiplier(daysAgo: number, totalBackfillDays: number): number` function.
- Use a simple linear or exponential curve: e.g., from 0.5x at 90 days ago to 1.0x today.
- A gentle growth rate (e.g., ~1% weekly compound, or linear from 60% to 100%) avoids looking artificial while showing organic adoption.

**In `index.ts`**:
- Apply growth multiplier when calculating `dayEventCount` during backfill.

### Change 5: Day-to-day variance and occasional anomalies

Add natural noise to daily event counts and occasional spikes/dips.

**In `patterns.ts`**:
- Add a `getDailyNoise(date: Date): number` function that returns a multiplier around 1.0 with standard deviation ~0.15 (so most days are 85%-115% of expected).
- Use a seeded PRNG keyed on the date to ensure deterministic results across runs.
- Add rare anomalies: ~5% of days get a spike (1.5-2.0x multiplier, simulating deploy days) or dip (0.3-0.5x, simulating incidents/holidays).

**In `index.ts`**:
- Apply daily noise multiplier during backfill event count calculation.

## Files Modified

| File | Changes |
|------|---------|
| `simulator/src/generators/events.ts` | Add per-org/team profiles, skewed random distributions, team-aware agent type/model/tool selection |
| `simulator/src/generators/patterns.ts` | Add growth multiplier, daily noise/anomaly functions |
| `simulator/src/index.ts` | Apply growth + noise to backfill, derive live rate from backfill parameters |
| `simulator/src/__tests__/events.test.ts` | Update tests for new profile structure, add skewed distribution tests |
| `simulator/src/__tests__/patterns.test.ts` | Add tests for growth multiplier and daily noise |

No new files are created. No data model, API, or interface changes are needed — the `AgentEvent` schema remains unchanged. The changes are internal to the simulator's generation logic.

## Verification Approach

1. **Unit tests** (run via `docker compose exec simulator npm run test`):
   - Existing tests updated to work with new profile structure
   - New tests for: skewed distributions (verify median < mean, verify outlier presence), growth multiplier (verify monotonic increase toward present), daily noise (verify bounded range, deterministic for same date)
   - Per-team profile tests: verify DevOps team generates more CI events, Frontend generates more coding events

2. **Lint** (run via `docker compose exec simulator npm run lint`):
   - Verify no new lint errors

3. **Visual verification**:
   - Run full stack with `docker compose up --build -d`
   - Check dashboard for:
     - Smooth transition between backfill and live data (no cliff)
     - Visible growth trend over 90-day period
     - Varied agent type distributions when filtering by team
     - Some days with higher/lower activity (not perfectly uniform)
