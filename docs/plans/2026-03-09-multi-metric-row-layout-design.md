# Design: Multi-Metric Widgets, Row-Based Layout, and Declarative Templates

## Problem

The current widget system supports single-metric widgets only. Template pages (Overview, Usage, Cost, Performance) mix declarative `WidgetConfig[]` arrays with custom React components for multi-series charts, composite cards, and breakdown tables. The dashboard uses a CSS auto-flow grid that gives users no control over layout.

## Goals

1. Multi-metric widgets: let users plot up to 3 metrics on one time-series chart, or up to 5 metrics as columns in a breakdown table.
2. Row-based layout: users build dashboards by adding rows of 1-4 fixed-width slots, with explicit control over widget placement.
3. Declarative templates: convert all 4 template pages to `DashboardRow[]` arrays using the widget system, eliminating nearly all custom components.

---

## 1. Multi-Metric Widgets

### Data model change

`WidgetConfig.metric` becomes `WidgetConfig.metrics`:

```typescript
// Before
metric: MetricKey;

// After
metrics: MetricKey[];  // 1-N items, limit depends on chart type
```

Limits by chart type:
- `line`, `area`: up to 3 metrics (multi-series time-series)
- `table`: up to 5 metrics (one column per metric, with breakdown dimension as first column)
- `bar`, `pie`, `kpi`, `gauge`, `stat`: 1 metric only

### Frontend data fetching

`useWidgetData()` fires N parallel `POST /api/metrics/widget` calls (one per metric in the `metrics` array) and merges results:
- For `line`/`area`: merge time-series arrays by date — each metric becomes a series key on the merged data points.
- For `table`: merge breakdown arrays by label — each metric becomes a column value on the merged rows.

No backend changes needed for multi-metric support.

### Modal changes

For compatible chart types (line, area, table), the form shows:
- Metric 1 (required): existing dropdown
- Metric 2 (optional): extra dropdown, defaults blank
- Metric 3 (optional): extra dropdown, defaults blank
- Metric 4, 5 (optional, table only): two more dropdowns

Auto-generated title joins metric labels: "Cost, Run Count (Line)" or "Runs, Users, Cost by Team (Table)".

---

## 2. Row-Based Layout

### Data model

```typescript
interface DashboardRow {
  id: string;
  columns: 1 | 2 | 3 | 4;
  widgets: (WidgetConfig | null)[];  // length === columns, null = empty slot
}
```

Dashboard state changes from `widgets: WidgetConfig[]` to `rows: DashboardRow[]`.

### Interaction flow

1. Dashboard starts empty — shows an "Add Row" area.
2. User clicks "Add Row" and picks column count (1/2/3/4 button group).
3. The row renders with its slots. The first empty slot shows a grayed-out `+` icon.
4. Clicking `+` opens the widget modal. On submit, the widget fills that slot.
5. Once a row has at least one widget, a new "Add Row" area appears below.
6. Removing a widget turns the slot back to an empty `+`.
7. Column count is fixed once the row is created.

### Rendering

Each row is a CSS grid: `grid-cols-1`, `grid-cols-2`, `grid-cols-3`, or `grid-cols-4`. No auto-flow — each slot is explicit.

### Template pages

Templates become `DashboardRow[]` arrays rendered by a shared `<RowLayout>` component. Template pages are read-only (no add/remove).

---

## 3. New Chart Types

### gauge

Progress bar widget combining an agent_runs metric with an org-level target.

- Renders: current value, target value, projected value, color-coded progress bar (green < 70%, yellow 70-90%, red > 90%).
- Config: `metrics: ['cost']`, `orgMetric: 'monthly_budget'`.
- Data: widget endpoint for current value, `useOrg()` for target. Projected value derived from current value + date math.

### stat

Fraction/denominator widget combining an agent_runs metric with an org-level count.

- Renders: "50 of 50 licensed users" with percentage.
- Config: `metrics: ['active_users']`, `orgMetric: 'licensed_users'`.
- Data: widget endpoint for numerator, `useOrg()` for denominator.

### Sealed (template-only) widget types

These render fixed content, have no user-configurable options, and cannot be created from the modal.

**`active_users_trend`**: DAU/WAU/MAU multi-series line chart. Data from `useUsageMetrics()`.

**`top_users`**: User table with avatar initials, name, team, runs, last active date. Data from `useUsageMetrics()`.

---

## 4. Org Endpoint Extension

Add `licensed_users` to the existing `/api/orgs/current` response:

```json
{
  "org_id": "...",
  "name": "Acme Corp",
  "monthly_budget": 50000,
  "licensed_users": 50,
  "teams": [...],
  "projects": [...]
}
```

`monthly_budget` is already returned. `licensed_users` is a new field from `pg_service.get_total_licensed_users()`.

---

## 5. Dead Code Removal

Remove `active_runs_count` from the system:
- `OverviewResponse.active_runs_count` field in `analytics-api/app/models/responses.py`
- Redis active_runs counter read in `analytics-api/app/routers/overview.py`
- Any aggregation worker code writing active_runs counters to Redis
- `OverviewResponse.active_runs_count` in `frontend/src/types/api.ts`
- Green dot + count rendering in `frontend/src/pages/Overview.tsx`
- Related test assertions

---

## 6. Template Pages (Fully Declarative)

### Overview

```
Row (4): [KPI: run_count] [KPI: active_users] [KPI: cost] [KPI: success_rate]
Row (1): [Area: run_count]
Row (1): [Table: run_count, active_users, cost, success_rate x team]
```

### Usage

```
Row (2): [Stat: active_users / licensed_users] [Pie: run_count x agent_type]
Row (1): [active_users_trend (sealed)]
Row (2): [top_users (sealed)] [Table: run_count, active_users, cost x project]
```

### Cost

```
Row (1): [Gauge: cost / monthly_budget]
Row (2): [Area: cost] [Line: cost_per_run]
Row (3): [Bar: cost x team] [Bar: cost x project] [Bar: cost x agent_type]
Row (1): [Table: tokens_input, tokens_output x model]
```

### Performance

```
Row (1): [KPI: success_rate]
Row (2): [Area: success_rate, failure_rate, error_rate] [Line: latency_p50, latency_p95, latency_p99]
Row (2): [Pie: run_count x error_category] [Line: queue_wait_avg, queue_wait_p95]
```

---

## 7. WidgetConfig (Updated)

```typescript
type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'kpi' | 'table'
  | 'gauge' | 'stat' | 'active_users_trend' | 'top_users';

type OrgMetricKey = 'monthly_budget' | 'licensed_users';

interface WidgetConfig {
  id: string;
  title: string;
  chartType: ChartType;
  metrics: MetricKey[];               // 1-5 items depending on chart type
  breakdownDimension?: BreakdownDimension;
  timeRange: { useGlobal: true } | { useGlobal: false; period: Period };
  filters?: { teams?: string[]; projects?: string[]; agent_types?: string[] };
  orgMetric?: OrgMetricKey;           // for gauge and stat types
}
```

---

## 8. Summary of Changes

### Backend
- `/api/orgs/current`: add `licensed_users` field
- `/api/metrics/overview`: remove `active_runs_count` + Redis counter code
- `POST /api/metrics/widget`: no changes

### Frontend — types and registry
- `WidgetConfig.metric` → `WidgetConfig.metrics` (array)
- Add `gauge`, `stat`, `active_users_trend`, `top_users` chart types
- Add `OrgMetricKey` type and `orgMetric` field
- Update widget registry with new chart type metadata

### Frontend — data fetching
- `useWidgetData()`: support multi-metric parallel queries + result merging
- Gauge/stat renderers: combine widget data with `useOrg()` data

### Frontend — components
- `WidgetRenderer`: add renderers for gauge, stat, active_users_trend, top_users
- `WidgetModal`: add extra metric dropdowns (2-5) for compatible chart types; add gauge/stat options with org metric picker
- New `<RowLayout>` component for rendering `DashboardRow[]`
- New `<AddRowPicker>` for creating rows with column count selection

### Frontend — pages
- `Dashboard.tsx`: replace flat grid with row-based layout using `useDashboard()` returning `DashboardRow[]`
- `useDashboard.ts`: state becomes `rows: DashboardRow[]` with addRow/removeRow/addWidgetToSlot/removeWidgetFromSlot
- All 4 template pages: replace mix of widgets + custom components with pure `DashboardRow[]` template arrays rendered by `<RowLayout>`
- Delete custom components that are replaced by widgets

### Dead code removal
- `active_runs_count` across backend (model, router, Redis, tests) and frontend (types, rendering)
