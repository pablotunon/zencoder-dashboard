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
import { AreaChart, DonutChart, LineChart } from "@tremor/react";
import { PartialDayTooltip } from "@/components/charts/PartialDayTooltip";
import { PartialDayNote } from "@/components/charts/PartialDayNote";

export function PerformancePage() {
  const { filters } = useFilters();
  const { data, isLoading, error, refetch } = usePerformanceMetrics(filters);

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
              data={data.success_rate_trend}
              index="date"
              categories={["success_rate", "failure_rate", "error_rate"]}
              colors={["emerald", "red", "amber"]}
              valueFormatter={(v) => formatPercent(v)}
              showAnimation
              customTooltip={(props) => (
                <PartialDayTooltip {...props} valueFormatter={(v) => formatPercent(v)} />
              )}
            />
            <PartialDayNote data={data.success_rate_trend} />
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
              data={data.latency_trend}
              index="date"
              categories={["p50", "p95", "p99"]}
              colors={["indigo", "amber", "red"]}
              valueFormatter={formatDuration}
              showAnimation
              customTooltip={(props) => (
                <PartialDayTooltip {...props} valueFormatter={formatDuration} />
              )}
            />
            <PartialDayNote data={data.latency_trend} />
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
              data={data.queue_wait_trend}
              index="date"
              categories={["avg_wait_ms", "p95_wait_ms"]}
              colors={["cyan", "rose"]}
              valueFormatter={formatDuration}
              showAnimation
              customTooltip={(props) => (
                <PartialDayTooltip {...props} valueFormatter={formatDuration} />
              )}
            />
            <PartialDayNote data={data.queue_wait_trend} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
