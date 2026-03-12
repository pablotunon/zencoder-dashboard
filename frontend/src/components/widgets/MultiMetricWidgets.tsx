import { useMemo } from "react";
import { METRIC_REGISTRY } from "@/lib/widget-registry";
import { formatNumber, formatTimestamp } from "@/lib/formatters";
import { useMultiMetricWidgetData } from "@/api/widget";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { type ChartConfig } from "@/components/ui/chart";
import { ErrorState } from "@/components/ui/ErrorState";
import { FORMAT_FN } from "./widget-helpers";
import { WidgetSkeleton } from "./WidgetCard";
import type { DateRange } from "@/types/api";
import type { WidgetConfig } from "@/types/widget";
import type { MergedTimeseriesData, MergedBreakdownData } from "@/api/widget";

// ── Multi-metric loader ─────────────────────────────────────────────────

export function MultiMetricLoader({
  widget,
  dateRange,
}: {
  widget: WidgetConfig;
  dateRange: DateRange;
}) {
  const { data, isLoading, error, refetch } = useMultiMetricWidgetData({
    metrics: widget.metrics,
    start: dateRange.start,
    end: dateRange.end,
    breakdown: widget.breakdownDimension,
    filters: widget.filters,
  });

  if (isLoading) return <WidgetSkeleton chartType={widget.chartType} />;
  if (error)
    return (
      <ErrorState message="Failed to load widget data" onRetry={refetch} />
    );
  if (!data) return null;

  if (data.type === "merged_timeseries") {
    if (widget.chartType === "line" || widget.chartType === "area") {
      return <MultiTimeSeriesWidget data={data} variant={widget.chartType} />;
    }
    if (widget.chartType === "table") {
      return <MultiTimeseriesTableWidget data={data} />;
    }
  }
  if (data.type === "merged_breakdown" && widget.chartType === "table") {
    return <MultiTableWidget data={data} />;
  }

  return null;
}

// ── Multi-metric time-series ────────────────────────────────────────────

function MultiTimeSeriesWidget({
  data,
  variant,
}: {
  data: MergedTimeseriesData;
  variant: "line" | "area";
}) {
  const config: ChartConfig = useMemo(
    () =>
      Object.fromEntries(
        data.metrics.map((m) => {
          const meta = METRIC_REGISTRY[m];
          return [
            m,
            { label: meta?.label ?? m, color: meta?.color ?? "#6366f1" },
          ];
        }),
      ),
    [data.metrics],
  );

  const formatter = useMemo(() => {
    const firstMeta = METRIC_REGISTRY[data.metrics[0]!];
    return firstMeta ? FORMAT_FN[firstMeta.format] : formatNumber;
  }, [data.metrics]);

  return (
    <TimeSeriesChart
      variant={variant}
      data={data.data}
      config={config}
      yFormatter={formatter}
      valueFormatter={formatter}
      granularity={data.granularity}
    />
  );
}

// ── Multi-metric breakdown table ─────────────────────────────────────────

function MultiTableWidget({ data }: { data: MergedBreakdownData }) {
  const formatters = useMemo(
    () =>
      data.metrics.map((m) => {
        const meta = METRIC_REGISTRY[m];
        return meta ? FORMAT_FN[meta.format] : formatNumber;
      }),
    [data.metrics],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="pb-3 font-medium">
              {data.dimension.charAt(0).toUpperCase() + data.dimension.slice(1)}
            </th>
            {data.metrics.map((m) => (
              <th key={m} className="pb-3 font-medium text-right">
                {METRIC_REGISTRY[m]?.label ?? m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.data.map((row) => (
            <tr key={String(row.label)}>
              <td className="py-2.5 text-gray-900">{String(row.label)}</td>
              {data.metrics.map((m, i) => (
                <td key={m} className="py-2.5 text-right text-gray-600">
                  {(formatters[i] ?? formatNumber)(Number(row[m] ?? 0))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Multi-metric timeseries table ────────────────────────────────────

function MultiTimeseriesTableWidget({ data }: { data: MergedTimeseriesData }) {
  const formatters = useMemo(
    () =>
      data.metrics.map((m) => {
        const meta = METRIC_REGISTRY[m];
        return meta ? FORMAT_FN[meta.format] : formatNumber;
      }),
    [data.metrics],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="pb-3 font-medium">Date</th>
            {data.metrics.map((m) => (
              <th key={m} className="pb-3 font-medium text-right">
                {METRIC_REGISTRY[m]?.label ?? m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.data
            .filter((row) => !row.is_partial)
            .map((row) => (
              <tr key={String(row.timestamp)}>
                <td className="py-2.5 text-gray-900">
                  {formatTimestamp(String(row.timestamp), data.granularity)}
                </td>
                {data.metrics.map((m, i) => (
                  <td key={m} className="py-2.5 text-right text-gray-600">
                    {(formatters[i] ?? formatNumber)(Number(row[m] ?? 0))}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
