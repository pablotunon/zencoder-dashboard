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

### [ ] Step: Frontend — Widget Types, Registry, and Data Hook

Redesign the widget type system and data fetching to use the new backend endpoint.

- [ ] Rewrite `frontend/src/types/widget.ts`:
  - `WidgetConfig` with `metric: MetricKey`, `chartType` (6 types incl. kpi + table), `breakdownDimension?`, `timeRange` (useGlobal toggle), `filters?`
  - `MetricKey` type (14 values), `BreakdownDimension` type (5 values), `ChartType` type (6 values)
- [ ] Rewrite `frontend/src/lib/widget-registry.ts`:
  - Metric metadata: label, category (Usage/Cost/Performance), valid chart types, formatter, valid breakdown dimensions
  - Organized for the widget creation modal's grouped dropdown
- [ ] Create `frontend/src/api/widget.ts`:
  - `postWidgetQuery()` function calling `POST /api/metrics/widget`
  - `useWidgetData()` React Query hook
- [ ] Update `frontend/src/api/hooks.ts`: remove the current `useWidgetData` mapping approach and related code (`DATA_SOURCE_FETCHERS`, `METRIC_TO_RESPONSE_KEY`). Keep existing endpoint hooks for template pages.
- [ ] Run `docker-compose exec frontend npm run lint` and fix any issues

---

### [ ] Step: Frontend — Widget Renderer Component

Build the shared widget renderer that fetches data and dispatches to chart components.

- [ ] Replace `frontend/src/components/widgets/WidgetRenderer.tsx` with new `Widget.tsx`:
  - Takes `WidgetConfig` + global period as props
  - Resolves effective period (global vs custom)
  - Calls `useWidgetData()` with metric + breakdown + period + filters
  - Dispatches to chart sub-component based on `chartType`:
    - `line` / `area`: `<TimeSeriesChart>` (existing component)
    - `bar` (time-series): `<TimeSeriesChart>` with bar variant or `<BarChart>`
    - `bar` (breakdown): `<BarChart>` with categorical X-axis
    - `pie`: `<PieChart>` donut
    - `kpi`: KPI card showing summary value + change %
    - `table`: simple `<table>` showing breakdown rows
  - Loading skeleton and error state per-widget
  - Remove button in card header
- [ ] Run `docker-compose exec frontend npm run lint`

---

### [ ] Step: Frontend — Dashboard Page and Widget Modal

Build the custom dashboard page at `/` and the widget creation modal.

- [ ] Create `frontend/src/hooks/useDashboard.ts`:
  - In-memory state: `widgets: WidgetConfig[]`
  - Functions: `addWidget()`, `removeWidget()`, `updateWidget()`
  - Generates UUID for new widget IDs
- [ ] Create `frontend/src/components/widgets/WidgetModal.tsx`:
  - Single form with all fields visible, contextual show/hide based on chart type:
    - Chart type: 6 icon cards
    - Metric: grouped dropdown (Usage / Cost / Performance)
    - Breakdown dimension: dropdown — hidden/disabled for line/area/kpi, required for pie, optional for bar/table
    - Time range: "Use global" toggle + period picker when unchecked
    - Filters: expandable section with team/project/agent_type multi-selects (uses `useOrg()` for team/project lists)
    - Title: auto-generated, editable
  - Validation: metric + chart type compatibility, breakdown required for pie
  - Submit adds widget via `useDashboard.addWidget()`
- [ ] Create `frontend/src/pages/Dashboard.tsx`:
  - Page header: "Dashboard" title + global period `<select>` + "Add Widget" button
  - Widget grid: responsive CSS grid (1/2/3 cols)
  - Maps over `widgets` from `useDashboard()`, renders `<Widget>` for each
  - Empty state when no widgets
- [ ] Update `frontend/src/App.tsx`: add `/` route for `<DashboardPage>`, change catch-all to `/`
- [ ] Update `frontend/src/components/layout/Sidebar.tsx`: add "Dashboard" nav item at top (with Squares2X2Icon or similar)
- [ ] Run `docker-compose exec frontend npm run lint`

---

### [ ] Step: Frontend — Remove Global FilterBar and Refactor Template Pages

Remove the global FilterBar and refactor existing pages to use the widget system.

- [ ] Delete `frontend/src/components/layout/FilterBar.tsx`
- [ ] Update `frontend/src/components/layout/AppShell.tsx`: remove `<FilterBar />` import and usage
- [ ] Simplify `frontend/src/hooks/useFilters.ts` or remove if no longer needed
- [ ] Refactor `frontend/src/pages/Overview.tsx`:
  - Define `OVERVIEW_TEMPLATE: WidgetConfig[]` for simple widgets (KPI cards, usage trend)
  - Render template widgets via `<Widget>` component
  - Keep team breakdown table as a custom component (uses existing `useOverviewMetrics` hook)
  - Add a lightweight period `<select>` in the page header
- [ ] Refactor `frontend/src/pages/Usage.tsx`:
  - Template widgets where single-metric fits
  - Keep custom: adoption rate card, active users trend (DAU/WAU/MAU multi-series), top users table, project breakdown table
- [ ] Refactor `frontend/src/pages/Cost.tsx`:
  - Template widgets where single-metric fits (cost trend, cost per run trend)
  - Keep custom: budget card, cost breakdown with group-by switcher, token usage table
- [ ] Refactor `frontend/src/pages/Performance.tsx`:
  - Template widgets where single-metric fits
  - Keep custom: availability KPI, success/failure/error rate multi-series, latency p50/p95/p99 multi-series, queue wait multi-series
- [ ] Run `docker-compose exec frontend npm run lint`
- [ ] Run full test suite: `./scripts/test.sh`

---

### [ ] Step: Integration Testing and Polish

End-to-end verification of the complete system.

- [ ] `docker-compose up --build -d` — verify all services start
- [ ] Navigate to `/` — verify empty dashboard, global time picker, "Add Widget" button
- [ ] Create widgets: one of each chart type (line, area, bar, pie, kpi, table)
- [ ] Verify per-widget time range override works
- [ ] Verify per-widget filters work
- [ ] Navigate to template pages — verify they display correctly
- [ ] Run `./scripts/test.sh` — all tests pass
- [ ] Run `docker-compose exec frontend npm run lint` — clean
- [ ] Write report to `.zenflow/tasks/custom-charts-9024/report.md`
