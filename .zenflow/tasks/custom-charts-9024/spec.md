# Technical Specification: Custom Charts / Widget System

## Difficulty: Hard

Multi-service change touching frontend architecture (new page, component system, modal), backend (new endpoint + dynamic query builder), and refactoring all 4 existing dashboard pages.

---

## 1. Technical Context

| Layer | Technology | Relevant Files |
|---|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS 4, Recharts 2, TanStack React Query 5, React Router 7 | `frontend/src/` |
| Analytics API | Python 3.12, FastAPI, Pydantic | `analytics-api/app/` |
| Data Store | ClickHouse (agent_runs table) | `init-scripts/clickhouse/001-tables.sql` |
| Build | Docker Compose, all tests/lint run in containers | `docker-compose.yml` |

### Existing Architecture

- **4 dashboard pages** (Overview, Usage, Cost, Performance) with hardcoded charts
- **Global FilterBar** in AppShell applies period/team/agent_type filters to all pages via URL search params
- **4 API endpoints** (`/api/metrics/{overview,usage,cost,performance}`) each return composite response objects
- **ClickHouse queries** in `analytics-api/app/services/clickhouse.py` all query `agent_runs` directly (rollup tables exist but are unused by the API)
- **Existing widget scaffolding** in `frontend/src/types/widget.ts`, `frontend/src/lib/widget-registry.ts`, `frontend/src/components/widgets/WidgetRenderer.tsx`, and `frontend/src/api/hooks.ts` (useWidgetData) — follows Approach 2 (endpoint mapping). This will be replaced with Approach 1 (new backend endpoint).

---

## 2. Implementation Approach

### Core Decisions

1. **New `POST /api/metrics/widget` endpoint** — accepts a declarative query (metric, breakdown, period, filters) and returns generic time-series or breakdown data. Queries `agent_runs` directly using a metric registry + dynamic SQL builder.

2. **Global time range + per-widget override** — the custom dashboard has a global time picker. Each widget defaults to "use global" but can override with a custom period.

3. **Per-widget filters** — each widget can optionally filter by team, project, agent_type. No global filters beyond time range.

4. **Single-metric widgets** — each widget shows one metric (possibly multi-series like p50/p95/p99). Multi-series template charts (like DAU/WAU/MAU) stay as custom components in template pages.

5. **Template pages** — existing 4 pages refactored to use `WidgetConfig[]` arrays rendered by the shared `<Widget>` component. Charts that need multi-series or custom rendering stay as template-specific components.

6. **In-memory state only** — widget definitions stored in React state, no persistence (per requirements, pending future auth system).

---

## 3. Data Model

### WidgetConfig (Frontend)

```typescript
type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'kpi' | 'table';
type MetricKey = 'run_count' | 'active_users' | 'cost' | 'cost_per_run'
  | 'success_rate' | 'failure_rate' | 'error_rate'
  | 'latency_p50' | 'latency_p95' | 'latency_p99'
  | 'tokens_input' | 'tokens_output'
  | 'queue_wait_avg' | 'queue_wait_p95';
type BreakdownDimension = 'team' | 'project' | 'agent_type' | 'error_category' | 'model';

interface WidgetConfig {
  id: string;
  title: string;
  chartType: ChartType;
  metric: MetricKey;
  breakdownDimension?: BreakdownDimension;  // required for bar/pie/table, hidden for line/area/kpi
  timeRange: { useGlobal: true } | { useGlobal: false; period: Period };
  filters?: {
    teams?: string[];
    projects?: string[];
    agent_types?: string[];
  };
}
```

### Metric Registry (Backend)

Maps metric keys to ClickHouse SQL expressions. Adding a new metric = one dict entry.

```python
METRIC_REGISTRY = {
    "run_count":      {"expr": "count()",                                              "label": "Run Count"},
    "active_users":   {"expr": "uniq(user_id)",                                        "label": "Active Users"},
    "cost":           {"expr": "sum(cost_usd)",                                        "label": "Cost (USD)"},
    "cost_per_run":   {"expr": "sum(cost_usd) / greatest(count(), 1)",                 "label": "Cost Per Run"},
    "success_rate":   {"expr": "countIf(status = 'completed') * 100.0 / greatest(count(), 1)", "label": "Success Rate"},
    "failure_rate":   {"expr": "countIf(status = 'failed') * 100.0 / greatest(count(), 1)",    "label": "Failure Rate"},
    "error_rate":     {"expr": "countIf(status = 'failed' AND error_category IS NOT NULL) * 100.0 / greatest(count(), 1)", "label": "Error Rate"},
    "latency_p50":    {"expr": "quantile(0.5)(duration_ms)",                           "label": "Latency P50"},
    "latency_p95":    {"expr": "quantile(0.95)(duration_ms)",                          "label": "Latency P95"},
    "latency_p99":    {"expr": "quantile(0.99)(duration_ms)",                          "label": "Latency P99"},
    "tokens_input":   {"expr": "sum(tokens_input)",                                    "label": "Input Tokens"},
    "tokens_output":  {"expr": "sum(tokens_output)",                                   "label": "Output Tokens"},
    "queue_wait_avg": {"expr": "avg(queue_wait_ms)",                                   "label": "Avg Queue Wait"},
    "queue_wait_p95": {"expr": "quantile(0.95)(queue_wait_ms)",                        "label": "Queue Wait P95"},
}
```

### Dimension Registry (Backend)

Maps breakdown dimension keys to ClickHouse column names.

```python
DIMENSION_REGISTRY = {
    "team":           {"column": "team_id",        "label": "Team"},
    "project":        {"column": "project_id",     "label": "Project"},
    "agent_type":     {"column": "agent_type",     "label": "Agent Type"},
    "error_category": {"column": "error_category", "label": "Error Category"},
    "model":          {"column": "model",          "label": "Model"},
}
```

---

## 4. API Design

### `POST /api/metrics/widget`

**Request body:**
```json
{
  "metric": "cost",
  "breakdown": "team",
  "period": "30d",
  "filters": {
    "teams": ["platform"],
    "projects": [],
    "agent_types": ["coding"]
  }
}
```

- `metric` (required): one of the MetricKey values
- `breakdown` (optional): one of the BreakdownDimension values. If omitted, returns time-series data.
- `period` (required): "7d" | "30d" | "90d"
- `filters` (optional): per-widget filtering

**Response — time-series (no breakdown):**
```json
{
  "type": "timeseries",
  "metric": "cost",
  "data": [
    {"date": "2026-03-01", "value": 142.50, "is_partial": false},
    {"date": "2026-03-02", "value": 158.20, "is_partial": true}
  ]
}
```

**Response — breakdown (with dimension):**
```json
{
  "type": "breakdown",
  "metric": "cost",
  "dimension": "team",
  "data": [
    {"label": "platform", "value": 850.00},
    {"label": "backend", "value": 620.00}
  ]
}
```

### Dynamic Query Builder

The endpoint constructs ClickHouse SQL dynamically:

**Time-series query (no breakdown):**
```sql
SELECT
    toDate(started_at) AS date,
    {metric_expr} AS value
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
  {extra_where}
GROUP BY date
ORDER BY date
```

**Breakdown query (with dimension):**
```sql
SELECT
    {dimension_column} AS label,
    {metric_expr} AS value
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
  {extra_where}
GROUP BY label
ORDER BY value DESC
```

The `metric_expr` and `dimension_column` are looked up from the registries. The `extra_where` clause is built using the existing `build_team_filter()` function.

### KPI Support

For KPI chart types, the frontend calls the same endpoint without a breakdown. It receives time-series data and computes:
- **Current value**: sum/avg of all data points (depending on metric type — counts are summed, rates are averaged)
- **Change %**: compare current period total vs previous period (requires a second backend query or client-side calculation)

To support change %, the backend will also return a `summary` field:
```json
{
  "type": "timeseries",
  "metric": "cost",
  "summary": {"value": 4250.00, "change_pct": -5.2},
  "data": [...]
}
```

This is computed using the existing `previous_period_dates()` function pattern.

---

## 5. Frontend Architecture

### New Files

| File | Purpose |
|---|---|
| `types/widget.ts` | `WidgetConfig`, `MetricKey`, `BreakdownDimension`, `ChartType` types (replace existing) |
| `lib/widget-registry.ts` | Metric metadata: label, category, valid chart types, formatter, valid breakdowns (replace existing) |
| `pages/Dashboard.tsx` | Custom dashboard at `/` — grid layout, global time picker, "Add Widget" button |
| `components/widgets/Widget.tsx` | Single widget renderer — fetches data via `useWidgetData`, dispatches to chart component (replace existing `WidgetRenderer.tsx`) |
| `components/widgets/WidgetModal.tsx` | Widget creation/edit modal — single form with contextual show/hide |
| `hooks/useDashboard.ts` | In-memory widget list state (add/remove/update widgets) |
| `api/widget.ts` | `postWidgetQuery()` fetch function + `useWidgetData()` React Query hook |

### Modified Files

| File | Change |
|---|---|
| `App.tsx` | Add `/` route for Dashboard, change catch-all redirect from `/overview` to `/` |
| `components/layout/Sidebar.tsx` | Add "Dashboard" nav item at top |
| `components/layout/AppShell.tsx` | Remove `<FilterBar />` |
| `components/layout/FilterBar.tsx` | Delete this file |
| `hooks/useFilters.ts` | Remove or simplify — template pages use a simple period prop, no longer needed for global filtering |
| `pages/Overview.tsx` | Refactor to declarative `WidgetConfig[]` template + `<Widget>` renderer. Keep page-level period selector. |
| `pages/Usage.tsx` | Same refactoring. Multi-series charts (DAU/WAU/MAU) stay as custom components. |
| `pages/Cost.tsx` | Same refactoring. Budget card and token breakdown stay custom. Cost breakdown group-by switcher stays custom. |
| `pages/Performance.tsx` | Same refactoring. Multi-series charts (success/failure/error rates, latency p50/p95/p99, queue wait) stay custom. |
| `api/hooks.ts` | Replace `useWidgetData` mapping approach with new `POST /api/metrics/widget` call. Keep existing endpoint hooks for template page custom components. |

### Widget Creation Modal

Single form (not multi-step). All fields visible, with contextual hide/gray-out:

- **Chart type**: 6 icon cards (line, area, bar, pie, kpi, table)
- **Metric**: dropdown grouped by category:
  - Usage: run_count, active_users
  - Cost: cost, cost_per_run, tokens_input, tokens_output
  - Performance: success_rate, failure_rate, error_rate, latency_p50, latency_p95, latency_p99, queue_wait_avg, queue_wait_p95
- **Breakdown dimension**: dropdown (team, project, agent_type, error_category, model)
  - Hidden/disabled for line, area, kpi chart types
  - Required for pie chart type
  - Optional for bar, table chart types
- **Time range**: toggle "Use global" (default checked) / custom period picker
- **Filters**: expandable section with team, project, agent_type multi-selects
- **Title**: auto-generated from metric + chart type, editable

### Dashboard Page Layout

- Top bar: page title "Dashboard" + global time period selector + "Add Widget" button
- Widget grid: responsive CSS grid (1 col on mobile, 2 cols on tablet, 3 cols on desktop)
- Each widget: `<Widget>` card with title, chart, remove button
- Empty state: illustration/message prompting user to add their first widget

### Template Pages (Refactored)

Each template page becomes:
1. A `const TEMPLATE: WidgetConfig[]` array defining simple widgets
2. The page component maps over the template, rendering `<Widget>` for each
3. Complex/multi-series charts that don't fit the single-metric model stay as inline custom components (using existing hooks like `useUsageMetrics`, `usePerformanceMetrics`)
4. Each template page has a lightweight period selector (a simple `<select>` in the page header)

---

## 6. Backend Changes

### New Files

| File | Purpose |
|---|---|
| `analytics-api/app/routers/widget.py` | POST `/api/metrics/widget` endpoint |
| `analytics-api/app/services/widget_query.py` | Metric/dimension registries + dynamic query builder |

### Modified Files

| File | Change |
|---|---|
| `analytics-api/app/main.py` | Import and include `widget.router` |
| `analytics-api/app/models/requests.py` | Add `WidgetQueryRequest` Pydantic model |

### No Changes To

- Aggregation worker (no new rollup tables)
- Ingestion service
- Simulator
- ClickHouse schema (queries run against existing `agent_runs` table)

---

## 7. Verification Approach

### Automated Testing
- **Analytics API**: `docker-compose exec analytics-api pytest` — add tests for the new widget endpoint (valid requests, invalid metric/dimension combos, filter building)
- **Frontend**: `docker-compose exec frontend npm run test` (if tests exist) — or manual verification

### Manual Testing
1. Start stack with `docker-compose up --build -d`
2. Navigate to `/` — verify empty dashboard state, global time picker, "Add Widget" button
3. Create widgets with different chart types and verify data renders
4. Test per-widget time range override
5. Test per-widget filters
6. Navigate to template pages (Overview, Usage, Cost, Performance) — verify they still display correctly using the refactored template system
7. Verify template page custom components (multi-series charts) still work

### Linting
- `docker-compose exec frontend npm run lint`
- `docker-compose exec analytics-api pytest` (for Python validation)

---

## 8. Key Extensibility Points

- **Adding a metric**: Add one entry to `METRIC_REGISTRY` (backend) + one entry to frontend metric registry
- **Adding a breakdown dimension**: Add one entry to `DIMENSION_REGISTRY` (backend) + one entry to frontend dimension list
- **Adding a chart type**: Add renderer case in `Widget.tsx` + chart type option in modal
- **Persistence**: When auth system arrives, `WidgetConfig[]` can be stored per-user via a new API endpoint — the data model is already serializable
