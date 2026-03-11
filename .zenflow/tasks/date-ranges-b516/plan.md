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

If you are blocked and need user clarification, mark the current step with `[!]` in plan.md before stopping.

---

## Workflow Steps

### [x] Step: Technical Specification

Spec saved to `.zenflow/tasks/date-ranges-b516/spec.md`. Key decisions:
- **Approach A**: Always send absolute `start`/`end` ISO timestamps to the API. Presets are frontend-only.
- **Auto-granularity**: Backend picks bucket size based on range span (minute/hour/day/week).
- **Date picker**: react-day-picker + native time inputs.
- **Difficulty**: Hard — cross-cutting change across all layers.

---

### [x] Step 1: Backend date/time utilities and request models
<!-- chat-id: 62573f11-1d76-40f8-bbc5-27e63465dde2 -->

Update the core backend infrastructure that all endpoints depend on.

- Modify `analytics-api/app/models/requests.py`:
  - Replace `period: Literal["7d","30d","90d"]` with `start: datetime` and `end: datetime` in `MetricFilters` and `WidgetQueryRequest`
  - Add validation (start < end, range <= 1 year, end <= now + 1 day)
  - Update `get_metric_filters()` to parse `start`/`end` query params with sensible defaults (default: last 30 days)
- Modify `analytics-api/app/services/clickhouse.py`:
  - Replace `period_to_dates()` with `resolve_granularity(start, end)` returning `(bucket_function, granularity_label)`
  - Replace `previous_period_dates()` with `previous_range(start, end)` that shifts back by the range duration
  - Update `_is_today()` to `_is_current_bucket(timestamp, granularity)` for partial-data detection
  - Update `_query_aggregate()` to use datetime comparisons (`started_at >= %(start)s AND started_at < %(end)s`)
- Write/update unit tests for the new utility functions
- Run `./scripts/test.sh analytics-api`

### [x] Step 2: Backend query builder and SQL queries
<!-- chat-id: ea880166-a6c6-4996-b954-e9b8a995c575 -->

Update all SQL queries and the widget query builder to use dynamic bucketing.

- Modify `analytics-api/app/services/widget_query.py`:
  - Update `build_widget_query()` to accept `start: datetime, end: datetime` instead of `period: str`
  - Use `resolve_granularity()` for dynamic bucket function in SQL
  - Include `granularity` field in response
  - Rename `date` to `timestamp` in data points
  - Update `_query_aggregate()` calls
- Modify `analytics-api/app/queries/overview.sql`, `usage.sql`, `cost.sql`, `performance.sql`:
  - Replace hardcoded `toDate(started_at)` with `{bucket_fn}(started_at)` parameter
  - Replace `toDate(started_at) >= %(start)s` with `started_at >= %(start)s` (datetime comparison)
- Update all `query_*` functions in `clickhouse.py` that use `period_to_dates()` to accept `start`/`end`
- Run `./scripts/test.sh analytics-api`

### [x] Step 3: Backend routers

Wire the updated models and query builder into the API endpoints.

- Modify `analytics-api/app/routers/widget.py`: pass `body.start`, `body.end` to `build_widget_query()`
- Modify `analytics-api/app/routers/overview.py`, `usage.py`, `cost.py`, `performance.py`: use updated `MetricFilters` with `start`/`end`
- Update cache key generation to handle datetime params (round to nearest minute)
- Run `./scripts/test.sh analytics-api`

### [x] Step 4: Frontend types and API layer
<!-- chat-id: 9fa2669e-9347-426f-8e19-aabd2e2adc16 -->

Update TypeScript types, API client, and data hooks.

- Modify `frontend/src/types/api.ts`:
  - Replace `Period` type with `DateRange = { start: string; end: string }`
  - Update `MetricFilters` to use `start`/`end`
  - Update `TimeSeriesPoint` and similar types: `date` -> `timestamp`
- Modify `frontend/src/types/widget.ts`:
  - Update `WidgetConfig.timeRange` to use `DateRange` instead of `Period`
  - Update `WidgetTimeseriesPoint`: `date` -> `timestamp`
  - Add `granularity` to `WidgetTimeseriesResponse`
- Modify `frontend/src/lib/constants.ts`:
  - Replace `PERIOD_OPTIONS` with `DATE_RANGE_PRESETS` with compute functions
  - Presets: Last 1 hour, Last 24 hours, Last 7 days, Last 30 days, Last 90 days
- Modify `frontend/src/api/widget.ts`:
  - Update `WidgetQueryParams` and `postWidgetQuery` to use `start`/`end`
  - Update `mergeTimeSeries` to join on `timestamp`
- Modify `frontend/src/api/client.ts`:
  - Update `buildQueryString` to use `start`/`end`
- Modify `frontend/src/api/hooks.ts`:
  - Update hook parameter types
- Run `./scripts/test.sh frontend` and `docker compose exec frontend npm run lint`

### [x] Step 5: DateRangePicker component
<!-- chat-id: 33c051b3-1f3e-48c3-85aa-26fb56cde060 -->

Build the new date/time range picker UI component.

- Install react-day-picker: `./scripts/npm.sh frontend install react-day-picker`
- Create `frontend/src/components/ui/DateRangePicker.tsx`:
  - Preset buttons panel (left side): Last 1 hour, Last 24 hours, Last 7 days, Last 30 days, Last 90 days
  - Calendar panel (center): react-day-picker range selection
  - Time inputs below each date: native `<input type="time">` with step="60" (minute precision)
  - Popover wrapper using Headless UI `Popover`
  - Display current range as readable text in the trigger button (e.g., "Mar 5, 2:30 PM - Mar 8, 11:45 AM")
  - "Apply" and "Cancel" buttons in popover footer
  - Props: `value: DateRange`, `onChange: (range: DateRange) => void`
- Write unit tests for DateRangePicker
- Run `./scripts/test.sh frontend`

### [x] Step 6: Dashboard integration (global and per-widget date ranges)
<!-- chat-id: 7788a360-bcd7-4858-9375-395e3a24efe7 -->

Wire the DateRangePicker into the dashboard pages and widget system.

- Modify `frontend/src/pages/CustomPage.tsx`:
  - Replace `globalPeriod: Period` state with `globalDateRange: DateRange` (default: last 30 days)
  - Replace `<select>` with `<DateRangePicker>`
  - Pass `globalDateRange` down to `RowLayout`
- Modify `frontend/src/components/widgets/RowLayout.tsx`:
  - Update prop types from `globalPeriod: Period` to `globalDateRange: DateRange`
- Modify `frontend/src/components/widgets/WidgetRenderer.tsx`:
  - Replace `resolveEffectivePeriod` with `resolveEffectiveDateRange`
  - Update all hook calls to pass `start`/`end`
- Modify `frontend/src/components/widgets/WidgetModal.tsx`:
  - Replace period `<select>` with `<DateRangePicker>` when useGlobal is unchecked
  - Update state and output config format
- Run `./scripts/test.sh frontend` and `docker compose exec frontend npm run lint`

### [ ] Step 7: Chart x-axis formatting

Update timeseries charts to format timestamps based on granularity.

- Modify `frontend/src/components/charts/TimeSeriesChart.tsx`:
  - Accept `granularity` prop
  - Add x-axis tick formatter: minute -> "HH:mm", hour -> "Mar 5 14:00", day -> "Mar 5", week -> "Mar 5"
  - Update partial-data detection to use `timestamp` field
  - Ensure `mergeTimeSeries` in `widget.ts` joins on `timestamp`
- Modify `frontend/src/components/widgets/WidgetRenderer.tsx`:
  - Pass `granularity` from API response to `TimeSeriesChart`
- Run `./scripts/test.sh frontend`

### [ ] Step 8: E2E tests and full-stack verification

Update E2E tests and run full integration verification.

- Modify `tests/e2e/tests/auth.spec.ts`: update API calls from `?period=7d` to `?start=...&end=...`
- Modify `tests/e2e/tests/pipeline.spec.ts`: same
- Verify other E2E specs still pass (custom-pages, dashboard, chart-colors)
- Run `./scripts/test.sh e2e`
- Build all services: `docker compose up --build -d`
- Run full test suite: `./scripts/test.sh`
- Write report to `.zenflow/tasks/date-ranges-b516/report.md`
