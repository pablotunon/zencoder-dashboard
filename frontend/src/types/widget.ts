import type { ChartConfig } from "@/components/ui/chart";
import type { Period } from "./api";

// Which chart visualization to use
export type ChartType = "area" | "line" | "bar" | "pie";

// Which backend endpoint supplies the data
export type DataSource = "overview" | "usage" | "cost" | "performance";

// Available metrics users can chart, grouped by data source
export type MetricId =
  // overview
  | "usage_trend"
  // usage
  | "active_users_trend"
  | "agent_type_breakdown"
  // cost
  | "cost_trend"
  | "cost_per_run_trend"
  | "cost_breakdown"
  // performance
  | "success_rate_trend"
  | "latency_trend"
  | "error_breakdown"
  | "queue_wait_trend";

// Series configuration for a metric — which keys to plot
export interface MetricMeta {
  id: MetricId;
  label: string;
  dataSource: DataSource;
  /** Keys in the data rows to plot as series */
  seriesKeys: string[];
  /** Default chart type for this metric */
  defaultChartType: ChartType;
  /** Compatible chart types */
  compatibleChartTypes: ChartType[];
  /** Chart config (labels + colors) for the series */
  chartConfig: ChartConfig;
  /** Formatter name for Y axis */
  yFormat: "number" | "currency" | "percent" | "duration";
  /** Data key for X axis (usually "date" for time series) */
  indexKey: string;
}

// A widget definition — what the user configures
export interface WidgetDefinition {
  id: string;
  title: string;
  metricId: MetricId;
  chartType: ChartType;
  period: Period;
}

// A page template — a named collection of widget definitions
export interface DashboardTemplate {
  id: string;
  name: string;
  widgets: WidgetDefinition[];
}
