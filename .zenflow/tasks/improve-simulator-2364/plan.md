# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification

Difficulty: **Medium**. Spec saved to `.zenflow/tasks/improve-simulator-2364/spec.md`.

---

### [ ] Step: Per-breakdown multipliers and skewed distributions

Implement changes 1 and 2 from the spec — the core data realism improvements.

1. In `events.ts`: Add per-org and per-team profile overrides for `agentTypeWeights`, `modelWeights`, and `preferredTools`. Define distinct profiles for each team (e.g., DevOps → more CI, Frontend → more coding).
2. In `events.ts`: Add a `skewedRandom(min, max, skew)` utility function that produces right-skewed distributions (median < mean). Apply it to `duration_ms`, `tokens_input`, `tokens_output`, and `queue_wait_ms`.
3. Update `generateRunEvents` to use team-aware overrides when picking agent type, model, and tools.
4. Update existing tests in `events.test.ts` and add new tests:
   - Verify per-team agent type distributions differ (DevOps team generates more CI events than Frontend)
   - Verify skewed distributions have median < mean and produce occasional outliers
5. Run tests: `docker compose exec simulator npm run test`
6. Run lint: `docker compose exec simulator npm run lint`

---

### [ ] Step: Growth trend, daily variance, and anomalies

Implement changes 4 and 5 from the spec — temporal realism improvements.

1. In `patterns.ts`: Add `getGrowthMultiplier(daysAgo, totalBackfillDays)` — linear curve from ~0.6x at 90 days ago to 1.0x today.
2. In `patterns.ts`: Add `getDailyNoise(date)` — deterministic seeded noise returning multiplier around 1.0 (stddev ~0.15), with ~5% chance of spike (1.5-2.0x) or dip (0.3-0.5x).
3. In `index.ts`: Apply growth multiplier and daily noise to `dayEventCount` during backfill.
4. Add tests in `patterns.test.ts`:
   - Growth multiplier: monotonically increases toward present, bounded [0.5, 1.0]
   - Daily noise: deterministic for same date, bounded range, mean near 1.0 over many days
5. Run tests: `docker compose exec simulator npm run test`
6. Run lint: `docker compose exec simulator npm run lint`

---

### [ ] Step: Align backfill and live mode rates

Implement change 3 from the spec — eliminate the data cliff.

1. In `index.ts`: Derive live event rate from `baseDailyEvents` + current temporal multipliers instead of using a hardcoded rate. Recalculate each minute as the hour changes.
2. Keep `SIMULATOR_LIVE_EVENTS_PER_SEC` env var as an optional override.
3. Verify: live mode rate at peak hours should be consistent with what the backfill generates for recent days.
4. Update any tests affected by the rate derivation logic.
5. Run tests: `docker compose exec simulator npm run test`
6. Run lint: `docker compose exec simulator npm run lint`
7. Write report to `.zenflow/tasks/improve-simulator-2364/report.md`
