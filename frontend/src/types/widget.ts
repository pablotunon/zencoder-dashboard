import type { Granularity } from "./api";

// 10 chart types: 6 original + gauge, stat, and 2 sealed template-only types
export type ChartType =
  | "line"
  | "area"
  | "bar"
  | "pie"
  | "kpi"
  | "table"
  | "gauge"
  | "stat"
  | "active_users_trend"
  | "top_users";

// 14 metrics matching the backend METRIC_REGISTRY
export type MetricKey =
  | "run_count"
  | "active_users"
  | "cost"
  | "cost_per_run"
  | "success_rate"
  | "failure_rate"
  | "error_rate"
  | "latency_p50"
  | "latency_p95"
  | "latency_p99"
  | "tokens_input"
  | "tokens_output"
  | "queue_wait_avg"
  | "queue_wait_p95";

// Org-level metrics served from /api/orgs/current (not from agent_runs)
export type OrgMetricKey = "monthly_budget" | "licensed_users";

// 5 breakdown dimensions matching the backend DIMENSION_REGISTRY
export type BreakdownDimension =
  | "team"
  | "project"
  | "agent_type"
  | "error_category"
  | "model";

// Y-axis formatter type
export type ValueFormat = "number" | "currency" | "percent" | "duration";

// Metric category for grouping in the modal dropdown
export type MetricCategory = "Usage" | "Cost" | "Performance";

// A widget definition — what the user configures
export interface WidgetConfig {
  id: string;
  title: string;
  chartType: ChartType;
  metrics: MetricKey[];
  orgMetric?: OrgMetricKey;
  breakdownDimension?: BreakdownDimension;
  timeRange: { useGlobal: true } | { useGlobal: false; start: string; end: string };
  filters?: {
    teams?: string[];
    projects?: string[];
    agent_types?: string[];
  };
}

// A row in the dashboard layout — fixed number of column slots
export interface DashboardRow {
  id: string;
  columns: 1 | 2 | 3 | 4;
  widgets: (WidgetConfig | null)[];
}

// Metric metadata used by the widget registry
export interface MetricMeta {
  key: MetricKey;
  label: string;
  description: string;
  tooltip: string;
  category: MetricCategory;
  defaultChartType: ChartType;
  compatibleChartTypes: ChartType[];
  format: ValueFormat;
  validBreakdowns: BreakdownDimension[];
  color: string;
}

// Backend response types for POST /api/metrics/widget

export interface WidgetTimeseriesPoint {
  timestamp: string;
  value: number;
  is_partial: boolean;
}

export interface WidgetTimeseriesResponse {
  type: "timeseries";
  metric: string;
  granularity: Granularity;
  summary: { value: number; change_pct: number | null };
  data: WidgetTimeseriesPoint[];
}

export interface WidgetBreakdownItem {
  label: string;
  value: number;
}

export interface WidgetBreakdownResponse {
  type: "breakdown";
  metric: string;
  dimension: string;
  data: WidgetBreakdownItem[];
}

export type WidgetQueryResponse =
  | WidgetTimeseriesResponse
  | WidgetBreakdownResponse;
