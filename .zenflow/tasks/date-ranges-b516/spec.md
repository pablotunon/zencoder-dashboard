# Technical Specification: Flexible Date Ranges

## Difficulty: Hard

Cross-cutting change touching every layer of the stack (frontend types, UI components, API models, query builder, SQL queries, caching, E2E tests). Many files affected, careful coordination needed to avoid breaking the existing dashboard while introducing the new model.

---

## Technical Context

| Layer | Tech | Key Files |
|-------|------|-----------|
| Frontend | React 19, TypeScript, TailwindCSS 4, Headless UI, Recharts, React Query, Vite | `frontend/src/` |
| Analytics API | Python, FastAPI, Pydantic, clickhouse-connect | `analytics-api/app/` |
| ClickHouse | DateTime64(3) on `started_at` column | `init-scripts/clickhouse/001-tables.sql` |
| Caching | Redis with TTL | `analytics-api/app/services/redis_cache.py` |
| E2E Tests | Playwright | `tests/e2e/tests/` |

**No date picker library** currently installed. Need to add one.

---

## Design Decisions

### 1. Absolute timestamps (Approach A)

Replace the `Period` concept (`"7d" | "30d" | "90d"`) with `{ start: ISO8601, end: ISO8601 }`. Predefined presets ("Last 7 days", "Last 30 days", etc.) are frontend-only convenience that compute absolute start/end before sending to the API.

**Rationale**: One code path everywhere. No branching between "relative" and "custom" in the backend. Presets are trivially extensible without API changes.

### 2. Auto-granularity (backend decides bucket size)

The user picks start/end; the backend determines the time bucket based on range span:

| Range span | Bucket function | Approx data points |
|------------|----------------|---------------------|
| <= 6 hours | `toStartOfMinute(started_at)` | up to 360 |
| <= 48 hours | `toStartOfHour(started_at)` | up to 48 |
| <= 90 days | `toDate(started_at)` | up to 90 |
| > 90 days | `toStartOfWeek(started_at)` | variable |

The response includes a `granularity` field so the frontend knows how to format the x-axis.

**Rationale**: Keeps the UI simple (no granularity selector), prevents nonsensical combinations (minute-level over 90 days = 129k points), and ClickHouse can compute all of these functions on the fly from the raw `agent_runs` table without needing pre-aggregated hourly/minute tables.

### 3. Partial-data detection

Current logic marks "today" as partial. With sub-day granularity, "partial" means the bucket containing `now()`. The backend will compare the bucket timestamp against `toStartOfMinute/Hour/Day(now())` to flag the current bucket.

### 4. Previous-period change %

For any custom range of duration D, the "previous period" is the immediately preceding range of the same duration. E.g., "March 5 to March 8" (3 days) compares against "March 2 to March 5".

### 5. Date picker library

Use **react-day-picker** (headless, composable, works with any styling approach including TailwindCSS, no heavy dependencies). Pair with native `<input type="time">` for time selection, keeping the bundle small.

---

## API Contract Changes

### Widget endpoint: POST /api/metrics/widget

**Before:**
```json
{
  "metric": "run_count",
  "period": "30d",
  "breakdown": "team",
  "filters": { "teams": ["t1"] }
}
```

**After:**
```json
{
  "metric": "run_count",
  "start": "2026-03-04T00:00:00Z",
  "end": "2026-03-11T14:30:00Z",
  "breakdown": "team",
  "filters": { "teams": ["t1"] }
}
```

### GET endpoints: /api/metrics/{overview,usage,cost,performance}

**Before:** `?period=30d&teams=t1,t2`

**After:** `?start=2026-03-04T00:00:00Z&end=2026-03-11T14:30:00Z&teams=t1,t2`

### Timeseries response changes

**Before:**
```json
{
  "type": "timeseries",
  "metric": "run_count",
  "summary": { "value": 1234, "change_pct": 12.5 },
  "data": [
    { "date": "2026-03-04", "value": 100, "is_partial": false }
  ]
}
```

**After:**
```json
{
  "type": "timeseries",
  "metric": "run_count",
  "granularity": "day",
  "summary": { "value": 1234, "change_pct": 12.5 },
  "data": [
    { "timestamp": "2026-03-04T00:00:00", "value": 100, "is_partial": false }
  ]
}
```

- `date` field renamed to `timestamp` (ISO8601 string, always present)
- New `granularity` field: `"minute" | "hour" | "day" | "week"`

---

## Source Code Changes

### Frontend - Types & Constants

| File | Change |
|------|--------|
| `frontend/src/types/api.ts` | Replace `Period` type with `DateRange = { start: string; end: string }`. Update `MetricFilters` to use `start`/`end` instead of `period`. Update `TimeSeriesPoint` and similar types to use `timestamp` instead of `date`. |
| `frontend/src/types/widget.ts` | Update `WidgetConfig.timeRange` to `{ useGlobal: true } \| { useGlobal: false; start: string; end: string }`. Update `WidgetTimeseriesPoint` to use `timestamp`. Add `granularity` to `WidgetTimeseriesResponse`. |
| `frontend/src/lib/constants.ts` | Replace `PERIOD_OPTIONS` with `DATE_RANGE_PRESETS` array containing preset label + computeRange function pairs. E.g., `{ label: "Last 7 days", getRange: () => ({ start: ..., end: ... }) }`. Add presets: Last 1 hour, Last 24 hours, Last 7 days, Last 30 days, Last 90 days, This month, This quarter. |

### Frontend - Date Range Picker Component (NEW)

| File | Description |
|------|-------------|
| `frontend/src/components/ui/DateRangePicker.tsx` | New component. Uses react-day-picker for calendar + native time inputs. Shows preset buttons on the left, calendar in the center, time fields below each date. Emits `{ start: string, end: string }` on apply. Supports both popover mode (for global header) and inline mode (for widget modal). |

### Frontend - State Management & Data Flow

| File | Change |
|------|--------|
| `frontend/src/pages/CustomPage.tsx` | Replace `globalPeriod: Period` state with `globalDateRange: DateRange`. Replace `<select>` with `<DateRangePicker>`. Pass `globalDateRange` to `RowLayout`. |
| `frontend/src/components/widgets/WidgetRenderer.tsx` | Update `resolveEffectivePeriod` to `resolveEffectiveDateRange`. Update `WidgetRendererProps` to accept `globalDateRange: DateRange`. Update all hook calls to pass `start`/`end` instead of `period`. |
| `frontend/src/components/widgets/WidgetModal.tsx` | Replace `useGlobal`+`period` state with `useGlobal`+`dateRange` state. Replace `<select>` with `<DateRangePicker>` when useGlobal is unchecked. |
| `frontend/src/components/widgets/RowLayout.tsx` | Update prop types from `globalPeriod: Period` to `globalDateRange: DateRange`. Pass through to WidgetRenderer. |

### Frontend - API Layer

| File | Change |
|------|--------|
| `frontend/src/api/widget.ts` | Update `WidgetQueryParams` to use `start`/`end` instead of `period`. Update `postWidgetQuery` to send `start`/`end` in the body. Update `mergeTimeSeries` to join on `timestamp` instead of `date`. Update query keys. |
| `frontend/src/api/client.ts` | Update `buildQueryString` to use `start`/`end` instead of `period`. |
| `frontend/src/api/hooks.ts` | Update hook parameter types to accept `DateRange` in filters. |

### Frontend - Chart Rendering

| File | Change |
|------|--------|
| `frontend/src/components/charts/TimeSeriesChart.tsx` | Accept `granularity` prop. Format x-axis labels based on granularity: minute -> "HH:mm", hour -> "Mar 5 14:00", day -> "Mar 5", week -> "Mar 5". Update partial-data detection to work with `timestamp` field. |

### Backend - Request Models

| File | Change |
|------|--------|
| `analytics-api/app/models/requests.py` | Replace `period: Literal["7d","30d","90d"]` with `start: datetime` and `end: datetime` in both `MetricFilters` and `WidgetQueryRequest`. Add validation: start < end, range <= 1 year, end <= now + 1 day. Update `get_metric_filters()` to parse `start`/`end` query params. |

### Backend - Date/Time Utilities

| File | Change |
|------|--------|
| `analytics-api/app/services/clickhouse.py` | Replace `period_to_dates()` with `resolve_granularity(start, end)` that returns the bucket function name and granularity label. Replace `previous_period_dates()` with `previous_range(start, end)` that shifts back by the range duration. Update `_is_today()` to `_is_current_bucket(timestamp, granularity)`. |

### Backend - Query Builder

| File | Change |
|------|--------|
| `analytics-api/app/services/widget_query.py` | Update `build_widget_query()` signature: replace `period: str` with `start: datetime, end: datetime`. Use `resolve_granularity()` for bucket function. Replace `toDate(started_at)` with dynamic bucket function in SQL. Update response to include `granularity` field and use `timestamp` in data points. |
| `analytics-api/app/queries/overview.sql` | Replace `toDate(started_at)` with parameterized bucket function. Use `started_at >= %(start)s AND started_at < %(end)s` (datetime comparison, not date). |
| `analytics-api/app/queries/usage.sql` | Same pattern. |
| `analytics-api/app/queries/cost.sql` | Same pattern. |
| `analytics-api/app/queries/performance.sql` | Same pattern. |

### Backend - Routers

| File | Change |
|------|--------|
| `analytics-api/app/routers/widget.py` | Pass `body.start` and `body.end` to `build_widget_query()` instead of `body.period`. |
| `analytics-api/app/routers/overview.py` | Use updated `MetricFilters` with `start`/`end`. |
| `analytics-api/app/routers/usage.py` | Same. |
| `analytics-api/app/routers/cost.py` | Same. |
| `analytics-api/app/routers/performance.py` | Same. |

### Backend - ClickHouse Service Functions

| File | Change |
|------|--------|
| `analytics-api/app/services/clickhouse.py` | Update all `query_*` functions that call `period_to_dates()` to accept `start`/`end` datetime params instead. Replace `toDate(started_at)` in inline SQL with dynamic bucket expression. Update datetime comparison from `toDate(started_at) >= %(start)s` to `started_at >= %(start)s`. |

### Tests

| File | Change |
|------|--------|
| `analytics-api/tests/` | Update any unit tests that pass `period` to pass `start`/`end`. Test auto-granularity thresholds. Test validation (start < end, max range). |
| `frontend/src/` (vitest) | Update widget hook tests, add DateRangePicker tests. |
| `tests/e2e/tests/auth.spec.ts` | Update API calls from `?period=7d` to `?start=...&end=...`. |
| `tests/e2e/tests/pipeline.spec.ts` | Same. |

---

## Verification Approach

1. **Unit tests (per step)**: Run `./scripts/test.sh analytics-api` and `./scripts/test.sh frontend` after each backend/frontend change.
2. **Lint**: `docker compose exec ingestion cargo clippy`, `docker compose exec frontend npm run lint`.
3. **E2E**: `./scripts/test.sh e2e` after full integration.
4. **Manual**: Open dashboard, verify preset selection works, pick a custom range with specific times, confirm chart renders with appropriate granularity labels.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| ClickHouse performance with minute-level queries over large datasets | Auto-granularity caps data points. ClickHouse handles `toStartOfMinute()` efficiently on DateTime64 columns. Monitor query times. |
| Cache key explosion with arbitrary start/end | Round cache key timestamps to nearest minute. Set shorter TTL for sub-day ranges. |
| Breaking existing saved widget configs that have `period` field | Migration: on frontend load, if a widget config has `period` field, convert it to `start`/`end` using the same preset logic. Backend can temporarily accept both formats during transition (but spec targets clean cutover). |
| react-day-picker bundle size | Library is ~8KB gzipped, acceptable for the functionality. |
