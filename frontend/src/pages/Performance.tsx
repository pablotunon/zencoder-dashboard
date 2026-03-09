import { usePerformanceMetrics } from "@/api/hooks";
import { useFilters } from "@/hooks/useFilters";
import {
  CardSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatPercent,
  formatDuration,
  formatNumber,
} from "@/lib/formatters";
import { ERROR_CATEGORY_LABELS } from "@/lib/constants";
import { useMemo } from "react";
import { AreaChart, DonutChart, LineChart } from "@tremor/react";
import { PartialDayTooltip } from "@/components/charts/PartialDayTooltip";
import { splitPartialData } from "@/components/charts/splitPartialData";

export function PerformancePage() {
  const { filters } = useFilters();
  const { data, isLoading, error, refetch } = usePerformanceMetrics(filters);

  const successRateTrend = useMemo(
    () => data ? splitPartialData(data.success_rate_trend, ["success_rate", "failure_rate", "error_rate"], ["emerald", "red", "amber"], ["gray", "gray", "gray"]) : null,
    [data],
  );
  const latencyTrend = useMemo(
    () => data ? splitPartialData(data.latency_trend, ["p50", "p95", "p99"], ["indigo", "amber", "red"], ["gray", "gray", "gray"]) : null,
    [data],
  );
  const queueWaitTrend = useMemo(
    () => data ? splitPartialData(data.queue_wait_trend, ["avg_wait_ms", "p95_wait_ms"], ["cyan", "rose"], ["gray", "gray"]) : null,
    [data],
  );

  if (error) {
    return (
      <ErrorState
        message="Failed to load performance data"
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">
        Performance & Reliability
      </h1>

      {/* Availability KPI */}
      {isLoading ? (
        <CardSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Availability</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {formatPercent(data.availability.uptime_pct)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            over {data.availability.period}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Success Rate Trend */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Success / Failure Rate
            </h2>
            <AreaChart
              className="h-64"
              data={successRateTrend!.data}
              index="date"
              categories={successRateTrend!.categories}
              colors={successRateTrend!.colors}
              connectNulls
              showLegend={false}
              valueFormatter={(v) => formatPercent(v)}
              showAnimation
              customTooltip={(props) => (
                <PartialDayTooltip {...props} valueFormatter={(v) => formatPercent(v)} />
              )}
            />
          </div>
        ) : null}

        {/* Latency Percentiles */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Latency Percentiles
            </h2>
            <LineChart
              className="h-64"
              data={latencyTrend!.data}
              index="date"
              categories={latencyTrend!.categories}
              colors={latencyTrend!.colors}
              connectNulls
              showLegend={false}
              valueFormatter={formatDuration}
              showAnimation
              customTooltip={(props) => (
                <PartialDayTooltip {...props} valueFormatter={formatDuration} />
              )}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Error Breakdown */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Error Distribution
            </h2>
            {data.error_breakdown.length > 0 ? (
              <DonutChart
                className="h-64"
                data={data.error_breakdown.map((item) => ({
                  name:
                    ERROR_CATEGORY_LABELS[item.error_category] ??
                    item.error_category,
                  value: item.count,
                }))}
                category="value"
                index="name"
                colors={["rose", "orange", "amber", "red", "pink"]}
                valueFormatter={formatNumber}
                showAnimation
              />
            ) : (
              <p className="flex h-64 items-center justify-center text-sm text-gray-500">
                No errors in this period
              </p>
            )}
          </div>
        ) : null}

        {/* Queue Wait Trend */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Queue Wait Time
            </h2>
            <LineChart
              className="h-64"
              data={queueWaitTrend!.data}
              index="date"
              categories={queueWaitTrend!.categories}
              colors={queueWaitTrend!.colors}
              connectNulls
              showLegend={false}
              valueFormatter={formatDuration}
              showAnimation
              customTooltip={(props) => (
                <PartialDayTooltip {...props} valueFormatter={formatDuration} />
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
