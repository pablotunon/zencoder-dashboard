import type {
  MetricKey,
  MetricMeta,
  BreakdownDimension,
  ChartType,
} from "@/types/widget";

/**
 * Central registry of all chartable metrics.
 *
 * Each entry describes a metric the widget system can display:
 * label, category (for modal grouping), compatible chart types,
 * valid breakdown dimensions, formatter, and default color.
 *
 * Adding a metric = one entry here + one entry in the backend METRIC_REGISTRY.
 */
export const METRIC_REGISTRY: Record<MetricKey, MetricMeta> = {
  // ── Usage ──────────────────────────────────────────────
  run_count: {
    key: "run_count",
    label: "Run Count",
    category: "Usage",
    defaultChartType: "area",
    compatibleChartTypes: ["line", "area", "bar", "kpi", "table"],
    format: "number",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#6366f1",
  },
  active_users: {
    key: "active_users",
    label: "Active Users",
    category: "Usage",
    defaultChartType: "area",
    compatibleChartTypes: ["line", "area", "bar", "kpi", "table"],
    format: "number",
    validBreakdowns: ["team", "project"],
    color: "#8b5cf6",
  },

  // ── Cost ───────────────────────────────────────────────
  cost: {
    key: "cost",
    label: "Cost (USD)",
    category: "Cost",
    defaultChartType: "area",
    compatibleChartTypes: ["line", "area", "bar", "kpi", "pie", "table"],
    format: "currency",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#10b981",
  },
  cost_per_run: {
    key: "cost_per_run",
    label: "Cost Per Run",
    category: "Cost",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "bar", "kpi"],
    format: "currency",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#059669",
  },
  tokens_input: {
    key: "tokens_input",
    label: "Input Tokens",
    category: "Cost",
    defaultChartType: "area",
    compatibleChartTypes: ["line", "area", "bar", "kpi", "table"],
    format: "number",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#14b8a6",
  },
  tokens_output: {
    key: "tokens_output",
    label: "Output Tokens",
    category: "Cost",
    defaultChartType: "area",
    compatibleChartTypes: ["line", "area", "bar", "kpi", "table"],
    format: "number",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#0d9488",
  },

  // ── Performance ────────────────────────────────────────
  success_rate: {
    key: "success_rate",
    label: "Success Rate",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "kpi"],
    format: "percent",
    validBreakdowns: ["team", "project", "agent_type"],
    color: "#10b981",
  },
  failure_rate: {
    key: "failure_rate",
    label: "Failure Rate",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "kpi"],
    format: "percent",
    validBreakdowns: ["team", "project", "agent_type"],
    color: "#ef4444",
  },
  error_rate: {
    key: "error_rate",
    label: "Error Rate",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "bar", "kpi", "pie", "table"],
    format: "percent",
    validBreakdowns: ["team", "project", "agent_type", "error_category"],
    color: "#f59e0b",
  },
  latency_p50: {
    key: "latency_p50",
    label: "Latency P50",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "kpi"],
    format: "duration",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#6366f1",
  },
  latency_p95: {
    key: "latency_p95",
    label: "Latency P95",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "kpi"],
    format: "duration",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#f59e0b",
  },
  latency_p99: {
    key: "latency_p99",
    label: "Latency P99",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "kpi"],
    format: "duration",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#ef4444",
  },
  queue_wait_avg: {
    key: "queue_wait_avg",
    label: "Avg Queue Wait",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "kpi", "table"],
    format: "duration",
    validBreakdowns: ["team", "project", "agent_type"],
    color: "#06b6d4",
  },
  queue_wait_p95: {
    key: "queue_wait_p95",
    label: "Queue Wait P95",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "kpi"],
    format: "duration",
    validBreakdowns: ["team", "project", "agent_type"],
    color: "#f43f5e",
  },
};

/** All metrics as a flat array, useful for iteration. */
export const METRIC_OPTIONS: MetricMeta[] = Object.values(METRIC_REGISTRY);

/** Metrics grouped by category, for the modal grouped dropdown. */
export const METRIC_BY_CATEGORY = METRIC_OPTIONS.reduce(
  (acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  },
  {} as Record<string, MetricMeta[]>,
);

/** Breakdown dimension labels for display. */
export const BREAKDOWN_LABELS: Record<BreakdownDimension, string> = {
  team: "Team",
  project: "Project",
  agent_type: "Agent Type",
  error_category: "Error Category",
  model: "Model",
};

/**
 * Whether a chart type requires, supports, or disallows a breakdown dimension.
 * - "required": must have a breakdown (pie)
 * - "optional": breakdown is allowed but not required (bar, table)
 * - "none": no breakdown dimension (line, area, kpi)
 */
export function breakdownModeForChartType(
  chartType: ChartType,
): "required" | "optional" | "none" {
  switch (chartType) {
    case "pie":
      return "required";
    case "bar":
    case "table":
      return "optional";
    default:
      return "none";
  }
}
