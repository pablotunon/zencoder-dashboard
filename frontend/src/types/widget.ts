import type { Period } from "./api";

// 6 chart types supported by the widget system
export type ChartType = "line" | "area" | "bar" | "pie" | "kpi" | "table";

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
  metric: MetricKey;
  breakdownDimension?: BreakdownDimension;
  timeRange: { useGlobal: true } | { useGlobal: false; period: Period };
  filters?: {
    teams?: string[];
    projects?: string[];
    agent_types?: string[];
  };
}

// Metric metadata used by the widget registry
export interface MetricMeta {
  key: MetricKey;
  label: string;
  category: MetricCategory;
  defaultChartType: ChartType;
  compatibleChartTypes: ChartType[];
  format: ValueFormat;
  validBreakdowns: BreakdownDimension[];
  color: string;
}

// Backend response types for POST /api/metrics/widget

export interface WidgetTimeseriesPoint {
  date: string;
  value: number;
  is_partial: boolean;
}

export interface WidgetTimeseriesResponse {
  type: "timeseries";
  metric: string;
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
