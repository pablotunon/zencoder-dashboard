import type { MetricMeta } from "@/types/widget";

/**
 * Central registry of all chartable metrics.
 *
 * Each entry maps a MetricId to everything the widget renderer needs:
 * which endpoint to fetch, which keys to plot, colors, labels, formatters.
 */
export const METRIC_REGISTRY: Record<string, MetricMeta> = {
  usage_trend: {
    id: "usage_trend",
    label: "Usage Trend (Runs)",
    dataSource: "overview",
    seriesKeys: ["runs"],
    defaultChartType: "area",
    compatibleChartTypes: ["area", "line", "bar"],
    chartConfig: {
      runs: { label: "Runs", color: "#6366f1" },
    },
    yFormat: "number",
    indexKey: "date",
  },

  active_users_trend: {
    id: "active_users_trend",
    label: "Active Users (DAU / WAU / MAU)",
    dataSource: "usage",
    seriesKeys: ["dau", "wau", "mau"],
    defaultChartType: "area",
    compatibleChartTypes: ["area", "line"],
    chartConfig: {
      dau: { label: "DAU", color: "#6366f1" },
      wau: { label: "WAU", color: "#06b6d4" },
      mau: { label: "MAU", color: "#f59e0b" },
    },
    yFormat: "number",
    indexKey: "date",
  },

  agent_type_breakdown: {
    id: "agent_type_breakdown",
    label: "Agent Type Distribution",
    dataSource: "usage",
    seriesKeys: ["runs"],
    defaultChartType: "pie",
    compatibleChartTypes: ["pie", "bar"],
    chartConfig: {},
    yFormat: "number",
    indexKey: "agent_type",
  },

  cost_trend: {
    id: "cost_trend",
    label: "Cost Trend",
    dataSource: "cost",
    seriesKeys: ["cost"],
    defaultChartType: "area",
    compatibleChartTypes: ["area", "line", "bar"],
    chartConfig: {
      cost: { label: "Cost", color: "#10b981" },
    },
    yFormat: "currency",
    indexKey: "date",
  },

  cost_per_run_trend: {
    id: "cost_per_run_trend",
    label: "Cost Per Run",
    dataSource: "cost",
    seriesKeys: ["avg_cost_per_run"],
    defaultChartType: "line",
    compatibleChartTypes: ["area", "line", "bar"],
    chartConfig: {
      avg_cost_per_run: { label: "Avg Cost/Run", color: "#8b5cf6" },
    },
    yFormat: "currency",
    indexKey: "date",
  },

  cost_breakdown: {
    id: "cost_breakdown",
    label: "Cost Breakdown",
    dataSource: "cost",
    seriesKeys: ["cost"],
    defaultChartType: "bar",
    compatibleChartTypes: ["bar", "pie"],
    chartConfig: {
      cost: { label: "Cost", color: "#10b981" },
    },
    yFormat: "currency",
    indexKey: "dimension_value",
  },

  success_rate_trend: {
    id: "success_rate_trend",
    label: "Success / Failure Rate",
    dataSource: "performance",
    seriesKeys: ["success_rate", "failure_rate", "error_rate"],
    defaultChartType: "area",
    compatibleChartTypes: ["area", "line"],
    chartConfig: {
      success_rate: { label: "Success", color: "#10b981" },
      failure_rate: { label: "Failure", color: "#ef4444" },
      error_rate: { label: "Error", color: "#f59e0b" },
    },
    yFormat: "percent",
    indexKey: "date",
  },

  latency_trend: {
    id: "latency_trend",
    label: "Latency Percentiles",
    dataSource: "performance",
    seriesKeys: ["p50", "p95", "p99"],
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area"],
    chartConfig: {
      p50: { label: "P50", color: "#6366f1" },
      p95: { label: "P95", color: "#f59e0b" },
      p99: { label: "P99", color: "#ef4444" },
    },
    yFormat: "duration",
    indexKey: "date",
  },

  error_breakdown: {
    id: "error_breakdown",
    label: "Error Distribution",
    dataSource: "performance",
    seriesKeys: ["count"],
    defaultChartType: "pie",
    compatibleChartTypes: ["pie", "bar"],
    chartConfig: {},
    yFormat: "number",
    indexKey: "error_category",
  },

  queue_wait_trend: {
    id: "queue_wait_trend",
    label: "Queue Wait Time",
    dataSource: "performance",
    seriesKeys: ["avg_wait_ms", "p95_wait_ms"],
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area"],
    chartConfig: {
      avg_wait_ms: { label: "Avg Wait", color: "#06b6d4" },
      p95_wait_ms: { label: "P95 Wait", color: "#f43f5e" },
    },
    yFormat: "duration",
    indexKey: "date",
  },
};

export const METRIC_OPTIONS = Object.values(METRIC_REGISTRY);
