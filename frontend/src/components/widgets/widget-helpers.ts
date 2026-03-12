import {
  formatNumber,
  formatCurrency,
  formatPercent,
  formatDuration,
} from "@/lib/formatters";
import type { DateRange } from "@/types/api";
import type { WidgetConfig, ValueFormat, MetricKey } from "@/types/widget";

export const FORMAT_FN: Record<ValueFormat, (v: number) => string> = {
  number: formatNumber,
  currency: formatCurrency,
  percent: formatPercent,
  duration: formatDuration,
};

export const PIE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#f43f5e",
  "#14b8a6",
  "#059669",
  "#0d9488",
];

export function resolveEffectiveDateRange(
  widget: WidgetConfig,
  globalDateRange: DateRange,
): DateRange {
  if (widget.timeRange.useGlobal) return globalDateRange;
  return { start: widget.timeRange.start, end: widget.timeRange.end };
}

export function primaryMetric(widget: WidgetConfig): MetricKey {
  return widget.metrics[0] ?? "run_count";
}
