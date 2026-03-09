# Implementation Plan: Multi-Metric Widgets, Row-Based Layout, and Declarative Templates

**Goal**: Extend the widget system to support multi-metric charts, row-based dashboard layout, two new chart types (gauge/stat), two sealed template-only widget types, and convert all 4 template pages to fully declarative `DashboardRow[]` arrays. Also remove `active_runs_count` dead code and add `licensed_users` to the org endpoint.

**Design doc**: `docs/plans/2026-03-09-multi-metric-row-layout-design.md`

**Architecture**: React 19 + Vite 6 + Tailwind CSS 4 + Recharts 2 + TanStack React Query 5 (frontend), FastAPI + Pydantic + ClickHouse + PostgreSQL + Redis (backend). All tests/builds run in Docker containers.

**Tech stack**: TypeScript, Python 3.12, Docker Compose.

---

## Task 1: Backend — Dead Code Removal and Org Endpoint Extension

Remove `active_runs_count` from the overview endpoint and add `licensed_users` to the org endpoint.

### Files to modify

- `analytics-api/app/models/responses.py:43` — Remove `active_runs_count: int` from `OverviewResponse`
- `analytics-api/app/models/responses.py:204` — Add `licensed_users: int = 0` to `OrgResponse`
- `analytics-api/app/routers/overview.py:42` — Remove `active_runs = redis_cache.get_active_runs(ctx.org_id)` call
- `analytics-api/app/routers/overview.py:69` — Remove `active_runs_count=active_runs` from response constructor
- `analytics-api/app/services/redis_cache.py:63-70` — Delete the `get_active_runs()` function
- `analytics-api/app/routers/org.py:40-55` — Add `licensed_users` field to OrgResponse by calling `pg_service.get_total_licensed_users()`
- `analytics-api/tests/test_unit.py:102` — Remove `active_runs_count=3` from test fixture
- `analytics-api/tests/test_unit.py:109` — Remove `assert data["active_runs_count"] == 3` assertion
- `analytics-api/tests/test_integration.py:123` — Remove `assert "active_runs_count" in data` assertion
- `analytics-api/tests/test_integration.py:224` — Remove `"active_runs_count": 0` from mock data
- `frontend/src/types/api.ts:62` — Remove `active_runs_count: number` from `OverviewResponse`
- `frontend/src/types/api.ts:219-226` — Add `licensed_users: number` to `OrgResponse`
- `frontend/src/pages/Overview.tsx:78-88` — Remove the green dot + active runs count display

### Implementation steps

1. Remove `active_runs_count: int` field from `OverviewResponse` in `analytics-api/app/models/responses.py:43`
2. Remove `active_runs = redis_cache.get_active_runs(ctx.org_id)` from `analytics-api/app/routers/overview.py:42`
3. Remove `active_runs_count=active_runs` from `analytics-api/app/routers/overview.py:69`
4. Delete `get_active_runs()` function from `analytics-api/app/services/redis_cache.py:63-70`
5. Add `licensed_users: int = 0` to `OrgResponse` in `analytics-api/app/models/responses.py` (after `monthly_budget` field)
6. In `analytics-api/app/routers/org.py`: call `licensed_users = await pg_service.get_total_licensed_users(ctx.org_id)` and add `licensed_users=licensed_users` to the OrgResponse constructor
7. Update test files: remove `active_runs_count` from unit test fixture, unit test assertion, integration test assertion, and integration test mock data
8. Update `frontend/src/types/api.ts`: remove `active_runs_count` from `OverviewResponse`, add `licensed_users: number` to `OrgResponse`
9. Remove the active runs indicator (green dot + count) from `frontend/src/pages/Overview.tsx:78-88`

### Verification

```bash
docker-compose exec -T analytics-api pytest
docker-compose exec -T frontend npm run lint
```

### Commit

`Backend: remove active_runs_count dead code, add licensed_users to org endpoint`

---

## Task 2: Frontend Types — Multi-Metric WidgetConfig, New Chart Types, DashboardRow

Update the type system to support multi-metric widgets, new chart types, org metrics, and row-based layout.

### Files to modify

- `frontend/src/types/widget.ts` — Full rewrite of types

### Implementation steps

1. Change `ChartType` to include `gauge`, `stat`, `active_users_trend`, `top_users`:
   ```typescript
   type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'kpi' | 'table'
     | 'gauge' | 'stat' | 'active_users_trend' | 'top_users';
   ```
2. Add `OrgMetricKey` type:
   ```typescript
   type OrgMetricKey = 'monthly_budget' | 'licensed_users';
   ```
3. Change `WidgetConfig.metric: MetricKey` → `WidgetConfig.metrics: MetricKey[]`
4. Add `orgMetric?: OrgMetricKey` field to `WidgetConfig`
5. Add `DashboardRow` interface:
   ```typescript
   interface DashboardRow {
     id: string;
     columns: 1 | 2 | 3 | 4;
     widgets: (WidgetConfig | null)[];  // length === columns
   }
   ```
6. Update `MetricMeta.compatibleChartTypes` array type to include new chart types

### Verification

```bash
docker-compose exec -T frontend npm run lint
```

### Commit

`Frontend types: multi-metric WidgetConfig, new chart types, DashboardRow`

---

## Task 3: Frontend Widget Registry — New Chart Type Metadata

Update the registry to support new chart types and multi-metric limits.

### Files to modify

- `frontend/src/lib/widget-registry.ts` — Add chart type metadata, metric limits, and update `breakdownModeForChartType`

### Implementation steps

1. Add `MAX_METRICS` constant mapping chart type → max allowed metrics:
   ```typescript
   export const MAX_METRICS: Record<ChartType, number> = {
     line: 3, area: 3, bar: 1, pie: 1, kpi: 1, table: 5,
     gauge: 1, stat: 1, active_users_trend: 0, top_users: 0,
   };
   ```
2. Add `CHART_TYPE_META` with labels and user-creatable flag:
   ```typescript
   export const CHART_TYPE_META: Record<ChartType, { label: string; userCreatable: boolean }> = {
     line: { label: 'Line', userCreatable: true },
     // ... gauge/stat are userCreatable: true
     // ... active_users_trend/top_users are userCreatable: false (sealed)
   };
   ```
3. Update `breakdownModeForChartType` to handle `gauge`, `stat`, `active_users_trend`, `top_users` → return `"none"`
4. Add `ORG_METRIC_LABELS` map: `{ monthly_budget: 'Monthly Budget', licensed_users: 'Licensed Users' }`

### Verification

```bash
docker-compose exec -T frontend npm run lint
```

### Commit

`Frontend registry: chart type metadata, multi-metric limits, org metric labels`

---

## Task 4: Frontend Data Layer — Multi-Metric useWidgetData

Extend `useWidgetData` to support multi-metric parallel queries with result merging.

### Files to modify

- `frontend/src/api/widget.ts` — New `useMultiMetricWidgetData` hook, keep existing `useWidgetData` for single-metric backward compat

### Implementation steps

1. Keep existing `postWidgetQuery()` and `useWidgetData()` unchanged (they serve single-metric widgets)
2. Add `useMultiMetricWidgetData()` hook that:
   - Takes `metrics: MetricKey[]` + standard params (period, breakdown, filters)
   - Fires N parallel `useQuery` calls via `useQueries()` from React Query
   - Returns `{ data: MergedWidgetData | undefined, isLoading, error }`
3. Add merge functions:
   - `mergeTimeSeries(responses: WidgetTimeseriesResponse[])` → merges by date, each metric becomes a keyed value on merged data points
   - `mergeBreakdowns(responses: WidgetBreakdownResponse[])` → merges by label, each metric becomes a column value
4. Export `MergedTimeseriesData` and `MergedBreakdownData` types

### Verification

```bash
docker-compose exec -T frontend npm run lint
```

### Commit

`Frontend data layer: multi-metric parallel queries with result merging`

---

## Task 5: Frontend WidgetRenderer — Multi-Metric Charts and New Widget Types

Extend WidgetRenderer to handle multi-metric time-series/tables, gauge, stat, and sealed widgets.

### Files to modify

- `frontend/src/components/widgets/WidgetRenderer.tsx` — Major extension

### Implementation steps

1. Update `WidgetRenderer` to call `useMultiMetricWidgetData()` when `widget.metrics.length > 1`, otherwise keep existing `useWidgetData()` path for single-metric widgets
2. Update `ChartDispatch` to handle multi-metric data:
   - `line`/`area` with multiple metrics: pass merged time-series to `<TimeSeriesChart>` with multi-series config (one series per metric, using each metric's color from registry)
   - `table` with multiple metrics: render multi-column table where each metric becomes a value column (header = metric label), first column = breakdown dimension
3. Add `GaugeWidget` renderer:
   - Takes `useWidgetData` result for the agent_runs metric + `useOrg()` for the org metric
   - Shows current value, target (from org), projected value (date math), colored progress bar (green < 70%, yellow 70-90%, red > 90%)
4. Add `StatWidget` renderer:
   - Takes `useWidgetData` result + `useOrg()` for denominator
   - Shows "X of Y unit" with percentage
5. Add `ActiveUsersTrendWidget` sealed renderer:
   - Uses `useUsageMetrics()` hook directly (existing data source)
   - Renders `<TimeSeriesChart>` with DAU/WAU/MAU series config
6. Add `TopUsersWidget` sealed renderer:
   - Uses `useUsageMetrics()` hook directly
   - Renders user table with avatar initials, name, team, runs, last active
7. Update `WidgetSkeleton` for new chart types

### Verification

```bash
docker-compose exec -T frontend npm run lint
```

### Commit

`Frontend renderer: multi-metric charts, gauge, stat, sealed widget types`

---

## Task 6: Frontend WidgetModal — Extra Metric Inputs and Org Metric Picker

Extend the widget creation modal to support multi-metric configuration and new chart types.

### Files to modify

- `frontend/src/components/widgets/WidgetModal.tsx`

### Implementation steps

1. Update `CHART_TYPE_OPTIONS` to include `gauge` and `stat` (8 user-creatable types). Update grid from `grid-cols-6` to `grid-cols-4` for 2 rows of 4.
2. Change form state from `metric: MetricKey` to `metrics: MetricKey[]` (initialized as `["run_count"]`)
3. For compatible chart types (line, area, table):
   - Show "Metric 1" as existing required dropdown
   - Show "Metric 2 (optional)" and "Metric 3 (optional)" dropdowns, defaulting to blank
   - For table only: show "Metric 4 (optional)" and "Metric 5 (optional)"
   - Import `MAX_METRICS` from registry to determine how many dropdowns to show
4. For `gauge` and `stat` chart types:
   - Show org metric dropdown (`OrgMetricKey` selection: Monthly Budget / Licensed Users)
   - Add `orgMetric` state field
5. Update auto-title generation to join metric labels: `"Cost, Run Count (Line)"` or `"Runs, Users, Cost by Team (Table)"`
6. Update validation: check each metric is compatible with the chart type
7. Update `handleSubmit` to build config with `metrics: MetricKey[]` and `orgMetric?: OrgMetricKey`

### Verification

```bash
docker-compose exec -T frontend npm run lint
```

### Commit

`Frontend modal: multi-metric inputs, gauge/stat org metric picker`

---

## Task 7: Frontend Row Layout — RowLayout, AddRowPicker, useDashboard Rewrite

Build the row-based layout system and rewrite dashboard state management.

### Files to modify

- `frontend/src/hooks/useDashboard.ts` — Rewrite to `DashboardRow[]` state
- `frontend/src/components/widgets/RowLayout.tsx` — New file: shared row renderer
- `frontend/src/components/widgets/AddRowPicker.tsx` — New file: column count picker

### Implementation steps

1. Rewrite `useDashboard.ts`:
   - State: `rows: DashboardRow[]` (replaces `widgets: WidgetConfig[]`)
   - `addRow(columns: 1|2|3|4)`: creates new row with N null slots
   - `removeRow(rowId: string)`: removes row
   - `addWidgetToSlot(rowId: string, slotIndex: number, config: Omit<WidgetConfig, 'id'>)`: fills slot
   - `removeWidgetFromSlot(rowId: string, slotIndex: number)`: sets slot back to null
   - Keep `generateId()` for both row and widget IDs
2. Create `RowLayout.tsx`:
   - Takes `rows: DashboardRow[]`, `globalPeriod`, optional `onRemoveWidget`, optional `onAddWidget` callbacks
   - Renders each row as a CSS grid: `grid-cols-{row.columns}`
   - For each slot: if widget exists → `<WidgetRenderer>`, if null and `onAddWidget` provided → grayed-out `+` button
   - Shared between Dashboard page (interactive, with add/remove) and template pages (read-only, no callbacks)
3. Create `AddRowPicker.tsx`:
   - Button group showing 1/2/3/4 column options
   - Calls `onAddRow(columns)` callback

### Verification

```bash
docker-compose exec -T frontend npm run lint
```

### Commit

`Frontend layout: RowLayout component, AddRowPicker, useDashboard row-based state`

---

## Task 8: Frontend Dashboard Page — Row-Based Layout

Replace the flat CSS grid dashboard with the row-based layout.

### Files to modify

- `frontend/src/pages/Dashboard.tsx` — Replace flat grid with RowLayout + AddRowPicker

### Implementation steps

1. Replace `useDashboard()` destructuring from `{ widgets, addWidget, removeWidget }` to `{ rows, addRow, addWidgetToSlot, removeWidgetFromSlot }`
2. Replace the flat `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` grid with `<RowLayout>` component
3. Update empty state: show `<AddRowPicker>` when `rows.length === 0`
4. Show `<AddRowPicker>` below the last non-empty row
5. "Add Widget" button in header → opens modal. Modal now needs to know which row/slot to target. Options:
   - When clicking `+` in a row slot, open modal with `targetRow` and `targetSlot` context
   - "Add Widget" in header: if only one empty slot exists, auto-target it; otherwise prompt
6. Update modal integration: pass `onAdd` as `(config) => addWidgetToSlot(targetRowId, targetSlotIndex, config)`
7. Remove the header "Add Widget" button (users add rows first, then click `+` in slots)

### Verification

```bash
docker-compose exec -T frontend npm run lint
```

### Commit

`Frontend dashboard: row-based layout with AddRowPicker and slot-based widget insertion`

---

## Task 9: Frontend Template Pages — Fully Declarative DashboardRow Arrays

Convert all 4 template pages from mixed widget/custom layouts to pure `DashboardRow[]` arrays rendered by `<RowLayout>`.

### Files to modify

- `frontend/src/pages/Overview.tsx` — Rewrite as `DashboardRow[]`
- `frontend/src/pages/Usage.tsx` — Rewrite as `DashboardRow[]`
- `frontend/src/pages/Cost.tsx` — Rewrite as `DashboardRow[]`
- `frontend/src/pages/Performance.tsx` — Rewrite as `DashboardRow[]`

### Implementation steps

#### Overview (`Overview.tsx`)
Replace entire page body with `<RowLayout rows={overviewTemplate} globalPeriod={period} />` where:
```
Row (4): [KPI: run_count] [KPI: active_users] [KPI: cost] [KPI: success_rate]
Row (1): [Area: run_count]
Row (1): [Table: run_count, active_users, cost, success_rate x team]
```
- The team breakdown table becomes a multi-metric table widget with 4 metrics (run_count, active_users, cost, success_rate) broken down by team
- Delete `useOverviewMetrics` import (no longer needed if all data comes from widget endpoint)
- Keep `useOverviewMetrics` hook alive in `api/hooks.ts` for now (other pages or future use)

#### Usage (`Usage.tsx`)
```
Row (2): [Stat: active_users / licensed_users] [Pie: run_count x agent_type]
Row (1): [active_users_trend (sealed)]
Row (2): [top_users (sealed)] [Table: run_count, active_users, cost x project]
```
- Adoption rate card → `stat` widget with `metrics: ['active_users']`, `orgMetric: 'licensed_users'`
- Active users trend → `active_users_trend` sealed widget
- Top users → `top_users` sealed widget
- Project breakdown → multi-metric table with 3 metrics by project
- Delete custom components and `useUsageMetrics` dependency from page (sealed widgets use it internally)

#### Cost (`Cost.tsx`)
```
Row (1): [Gauge: cost / monthly_budget]
Row (2): [Area: cost] [Line: cost_per_run]
Row (3): [Bar: cost x team] [Bar: cost x project] [Bar: cost x agent_type]
Row (1): [Table: tokens_input, tokens_output x model]
```
- Budget card → `gauge` widget with `metrics: ['cost']`, `orgMetric: 'monthly_budget'`
- Cost breakdown with group-by switcher → 3 individual bar widgets, one per dimension
- Token usage table → multi-metric table with 2 metrics (tokens_input, tokens_output) by model
- Delete `useCostMetrics`, custom bar chart, group-by state, and token table from page

#### Performance (`Performance.tsx`)
```
Row (1): [KPI: success_rate]
Row (2): [Area: success_rate, failure_rate, error_rate] [Line: latency_p50, latency_p95, latency_p99]
Row (2): [Pie: run_count x error_category] [Line: queue_wait_avg, queue_wait_p95]
```
- Availability KPI → `kpi` widget for `success_rate`
- Success/failure/error trend → multi-metric area chart (3 metrics)
- Latency percentiles → multi-metric line chart (3 metrics)
- Error distribution → pie widget with `run_count` by `error_category`
- Queue wait → multi-metric line chart (2 metrics)
- Delete `usePerformanceMetrics` dependency from page, delete all custom chart components

### Verification

```bash
docker-compose exec -T frontend npm run lint
```

### Commit

`Frontend templates: all 4 pages as declarative DashboardRow arrays`

---

## Task 10: Integration Testing and Polish

Full end-to-end verification of the complete system.

### Steps

1. `docker-compose up --build -d` — verify all services start
2. `./scripts/test.sh` — run full test suite, fix any failures
3. `docker-compose exec -T frontend npm run lint` — fix any lint errors
4. Browser verification:
   - Dashboard (`/`): add rows (1/2/3/4 columns), add widgets to slots, test multi-metric line/area/table charts
   - Dashboard: create gauge widget, stat widget
   - Dashboard: remove widgets, verify slot shows `+` again
   - Overview (`/overview`): verify 3 rows (4 KPIs, 1 area, 1 multi-metric table)
   - Usage (`/usage`): verify stat widget, sealed active_users_trend, sealed top_users, multi-metric project table
   - Cost (`/cost`): verify gauge widget, 2 charts, 3 bar charts, multi-metric token table
   - Performance (`/performance`): verify KPI, 2 multi-metric charts, pie, multi-metric queue wait chart
5. Write report

### Verification

```bash
./scripts/test.sh
docker-compose exec -T frontend npm run lint
```

### Commit

`Integration testing and polish`

---

## Task Dependency Graph

```
Task 1 (backend)  ──┐
Task 2 (types)    ──┼── Task 3 (registry)  ── Task 4 (data layer) ── Task 5 (renderer)
                    │                                                      │
                    │                          Task 6 (modal) ─────────────┤
                    │                                                      │
                    └── Task 7 (row layout) ── Task 8 (dashboard) ── Task 9 (templates) ── Task 10 (integration)
```

Tasks 1, 2 can run in parallel. Tasks 3, 7 depend on 2. Task 4 depends on 2, 3. Task 5 depends on 4. Task 6 depends on 2, 3. Tasks 8, 9 depend on 5, 6, 7. Task 10 depends on all.
