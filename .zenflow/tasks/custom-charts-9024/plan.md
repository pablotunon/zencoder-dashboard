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

Difficulty: **Hard**. Multi-service change touching frontend architecture, backend API, and refactoring all 4 existing dashboard pages.

Specification saved to `.zenflow/tasks/custom-charts-9024/spec.md`.

Key decisions made with user:
- New route at `/` for custom dashboard, existing pages remain
- New `POST /api/metrics/widget` backend endpoint (Approach 1 — not reusing existing endpoints)
- Global time range with per-widget override
- Per-widget filters (team, project, agent_type) — global FilterBar removed
- 6 chart types: line, area, bar, pie, kpi, table
- 14 metrics, 5 breakdown dimensions
- Single-metric widgets; multi-series template charts stay as custom components
- Widget creation modal is a single form (not multi-step), with contextual show/hide
- In-memory state only (no persistence)
- No aggregation worker changes needed (queries run against `agent_runs` directly)

---

### [x] Step: Backend — Widget Query Endpoint
<!-- chat-id: 10011c68-57de-4fa5-938a-50efa1cc50d3 -->

Implement the new `POST /api/metrics/widget` endpoint and dynamic query builder.

- [ ] Create `analytics-api/app/services/widget_query.py` with:
  - `METRIC_REGISTRY` dict (14 metrics → SQL expressions)
  - `DIMENSION_REGISTRY` dict (5 dimensions → column names)
  - `build_widget_query()` function that constructs ClickHouse SQL from metric + dimension + filters + period
  - Time-series query (no breakdown): `GROUP BY toDate(started_at)`
  - Breakdown query (with dimension): `GROUP BY {dimension_column}`
  - Summary computation with change % using `previous_period_dates()`
- [ ] Create `analytics-api/app/models/requests.py` additions: `WidgetQueryRequest` Pydantic model
- [ ] Create `analytics-api/app/routers/widget.py` with POST endpoint, Redis caching, error handling
- [ ] Register router in `analytics-api/app/main.py`
- [ ] Add pytest tests for the widget endpoint (valid requests, invalid combos, filter building)
- [ ] Run `docker-compose exec analytics-api pytest` and fix any failures

---

### [x] Step: Frontend — Widget Types, Registry, and Data Hook
<!-- chat-id: 5064398c-884c-4d84-a53e-960c374d6dcf -->

Redesign the widget type system and data fetching to use the new backend endpoint.

- [x] Rewrite `frontend/src/types/widget.ts`:
  - `WidgetConfig` with `metric: MetricKey`, `chartType` (6 types incl. kpi + table), `breakdownDimension?`, `timeRange` (useGlobal toggle), `filters?`
  - `MetricKey` type (14 values), `BreakdownDimension` type (5 values), `ChartType` type (6 values)
  - Added `MetricMeta`, `MetricCategory`, `ValueFormat` types
  - Added backend response types: `WidgetTimeseriesResponse`, `WidgetBreakdownResponse`, `WidgetQueryResponse`
- [x] Rewrite `frontend/src/lib/widget-registry.ts`:
  - Metric metadata: label, category (Usage/Cost/Performance), valid chart types, formatter, valid breakdown dimensions
  - `METRIC_BY_CATEGORY` for the modal's grouped dropdown
  - `BREAKDOWN_LABELS` for display
  - `breakdownModeForChartType()` helper for modal contextual show/hide
- [x] Create `frontend/src/api/widget.ts`:
  - `postWidgetQuery()` function calling `POST /api/metrics/widget`
  - `useWidgetData()` React Query hook with stable query key
- [x] Update `frontend/src/api/hooks.ts`: removed `useWidgetData`, `DATA_SOURCE_FETCHERS`, `METRIC_TO_RESPONSE_KEY`, and unused imports. Kept existing endpoint hooks for template pages.
- [x] Updated `WidgetRenderer.tsx` to compile against new types (placeholder pending full replacement in next step)
- [x] Run `docker-compose exec frontend npm run lint` — 0 errors, 3 pre-existing warnings

---

### [x] Step: Frontend — Widget Renderer Component
<!-- chat-id: 12db75ec-612e-4f5a-b686-cb7e27cb46bf -->

Build the shared widget renderer that fetches data and dispatches to chart components.

- [x] Replaced `frontend/src/components/widgets/WidgetRenderer.tsx`:
  - Takes `WidgetConfig` + `globalPeriod` as props
  - Resolves effective period (global vs per-widget custom)
  - Calls `useWidgetData()` with metric + breakdown + period + filters
  - `ChartDispatch` routes to sub-components based on `chartType` + response type:
    - `line` / `area`: reuses `<TimeSeriesChart>` with partial-day support
    - `bar` (time-series): inline `<BarChart>` with date X-axis
    - `bar` (breakdown): `<BreakdownBarWidget>` with categorical X-axis
    - `pie`: `<PieWidget>` donut with 10-color palette
    - `kpi`: `<KpiWidget>` showing summary value + change %
    - `table`: `<TableWidget>` simple HTML table with dimension header
  - `WidgetSkeleton` provides per-chart-type loading states (KPI, table, chart)
  - `ErrorState` with retry button on fetch failure
  - `WidgetCard` wrapper with title + remove button in header
  - `FORMAT_FN` lookup maps `ValueFormat` → formatter function
- [x] Run `docker-compose exec frontend npm run lint` — 0 errors, 3 pre-existing warnings

---

### [x] Step: Frontend — Dashboard Page and Widget Modal
<!-- chat-id: c33652db-2b32-4fb9-8c2b-7c7f9535445e -->

Build the custom dashboard page at `/` and the widget creation modal.

- [x] Create `frontend/src/hooks/useDashboard.ts`:
  - In-memory state: `widgets: WidgetConfig[]`
  - Functions: `addWidget()`, `removeWidget()`, `updateWidget()`
  - Generates incremental IDs for new widget IDs
- [x] Create `frontend/src/components/widgets/WidgetModal.tsx`:
  - Single form with all fields visible, contextual show/hide based on chart type:
    - Chart type: 6 icon cards
    - Metric: grouped dropdown (Usage / Cost / Performance)
    - Breakdown dimension: dropdown — hidden/disabled for line/area/kpi, required for pie, optional for bar/table
    - Time range: "Use global" toggle + period picker when unchecked
    - Filters: expandable section with team/project/agent_type multi-selects (uses `useOrg()` for team/project lists)
    - Title: auto-generated from metric + chart type, editable
  - Validation: metric + chart type compatibility, breakdown required for pie
  - Submit adds widget via `addWidget()` callback
- [x] Create `frontend/src/pages/Dashboard.tsx`:
  - Page header: "Dashboard" title + global period `<select>` + "Add Widget" button
  - Widget grid: responsive CSS grid (1/2/3 cols via `md:grid-cols-2 xl:grid-cols-3`)
  - Maps over `widgets` from `useDashboard()`, renders `<WidgetRenderer>` for each
  - Empty state with dashed border and prompt when no widgets
- [x] Update `frontend/src/App.tsx`: add `/` route for `<DashboardPage>`, change catch-all to `/`
- [x] Update `frontend/src/components/layout/Sidebar.tsx`: add "Dashboard" nav item at top with `Squares2X2Icon`, `end` prop for exact match
- [x] Run `docker-compose exec frontend npm run lint` — 0 errors, 3 pre-existing warnings

---

### [x] Step: Frontend — Remove Global FilterBar and Refactor Template Pages
<!-- chat-id: 13058265-9355-4589-8ac7-23f8f29128de -->

Remove the global FilterBar and refactor existing pages to use the widget system.

- [x] Deleted `frontend/src/components/layout/FilterBar.tsx`
- [x] Updated `frontend/src/components/layout/AppShell.tsx`: removed `<FilterBar />` import and usage
- [x] Deleted `frontend/src/hooks/useFilters.ts` (no longer needed — all pages use local period state)
- [x] Refactored `frontend/src/pages/Overview.tsx`:
  - `makeOverviewTemplate(period)` produces 4 KPI widgets (run_count, active_users, cost, success_rate) + 1 area chart (run_count usage trend)
  - Template widgets rendered via `<WidgetRenderer>` component
  - Team breakdown table kept as custom component (multi-column, uses `useOverviewMetrics` hook)
  - Added period `<select>` in page header alongside active runs indicator
- [x] Refactored `frontend/src/pages/Usage.tsx`:
  - Template widget: agent type distribution pie (`run_count` + `agent_type` breakdown)
  - Kept custom: adoption rate card (composite metric), active users trend (DAU/WAU/MAU multi-series), top users table, project breakdown table
  - Added period `<select>` in page header
- [x] Refactored `frontend/src/pages/Cost.tsx`:
  - Template widgets: cost trend (area) and cost per run trend (line)
  - Kept custom: budget card (composite with utilization bar), cost breakdown with group-by switcher, token usage table
  - Added period `<select>` in page header
- [x] Refactored `frontend/src/pages/Performance.tsx`:
  - All charts kept as custom (multi-series or composite display): availability KPI, success/failure/error rate trend, latency p50/p95/p99, error distribution pie, queue wait avg/p95
  - Replaced `useFilters()` with local period state + period `<select>` in header
- [x] Run `docker-compose exec frontend npm run lint` — 0 errors, 3 pre-existing warnings
- [x] Run full test suite: `./scripts/test.sh` — all 118 tests pass (simulator 30, ingestion 19, aggregation-worker 26, analytics-api 51)

---

### [x] Step: Integration Testing and Polish
<!-- chat-id: 20faaf21-9398-4e19-aed1-c7c985039f54 -->

End-to-end verification of the complete system.

- [x] `docker-compose up --build -d` — verify all services start (9/9 services healthy)
- [x] Navigate to `/` — verify empty dashboard, global time picker, "Add Widget" button
- [x] Create widgets: one of each chart type (line, area, bar, pie, kpi, table) — all 6 verified
- [x] Verify per-widget time range override works (tested 90d override while global was 7d)
- [x] Verify per-widget filters work (tested Frontend team filter with team/project/agent_type multi-selects)
- [x] Navigate to template pages — verify they display correctly (Overview, Usage, Cost, Performance all working)
- [x] Run `./scripts/test.sh` — all 118 tests pass (simulator 30, ingestion 19, aggregation-worker 26, analytics-api 51)
- [x] Run `docker-compose exec frontend npm run lint` — 0 errors, 3 pre-existing warnings
- [x] Write report to `.zenflow/tasks/custom-charts-9024/report.md`
