import { useState } from "react";
import { usePerformanceMetrics } from "@/api/hooks";
import {
  CardSkeleton,
  ChartSkeleton,
} from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatPercent,
  formatDuration,
  formatNumber,
} from "@/lib/formatters";
import { PERIOD_OPTIONS, ERROR_CATEGORY_LABELS } from "@/lib/constants";
import {
  Cell,
  Pie,
  PieChart,
  Tooltip,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import type { Period } from "@/types/api";

const successRateConfig = {
  success_rate: { label: "Success", color: "#10b981" },
  failure_rate: { label: "Failure", color: "#ef4444" },
  error_rate: { label: "Error", color: "#f59e0b" },
} satisfies ChartConfig;

const latencyConfig = {
  p50: { label: "P50", color: "#6366f1" },
  p95: { label: "P95", color: "#f59e0b" },
  p99: { label: "P99", color: "#ef4444" },
} satisfies ChartConfig;

const queueWaitConfig = {
  avg_wait_ms: { label: "Avg Wait", color: "#06b6d4" },
  p95_wait_ms: { label: "P95 Wait", color: "#f43f5e" },
} satisfies ChartConfig;

const ERROR_COLORS = ["#f43f5e", "#f97316", "#f59e0b", "#ef4444", "#ec4899"];

export function PerformancePage() {
  const [period, setPeriod] = useState<Period>("30d");
  const { data, isLoading, error, refetch } = usePerformanceMetrics({ period });

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Performance & Reliability
        </h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Availability KPI — custom (composite with period text) */}
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
        {/* Success Rate Trend — custom (success/failure/error multi-series) */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Success / Failure Rate
            </h2>
            <TimeSeriesChart
              data={data.success_rate_trend}
              config={successRateConfig}
              yFormatter={(v) => formatPercent(v)}
              valueFormatter={(v) => formatPercent(v)}
            />
          </div>
        ) : null}

        {/* Latency Percentiles — custom (p50/p95/p99 multi-series) */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Latency Percentiles
            </h2>
            <TimeSeriesChart
              variant="line"
              data={data.latency_trend}
              config={latencyConfig}
              yFormatter={formatDuration}
              valueFormatter={formatDuration}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Error Distribution — custom (error category labels + specific colors) */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Error Distribution
            </h2>
            {data.error_breakdown.length > 0 ? (
              <ChartContainer config={{}} className="h-64 w-full">
                <PieChart>
                  <Tooltip
                    content={(props) => {
                      const { active, payload } = props;
                      if (!active || !payload?.length) return null;
                      const item = payload[0];
                      if (!item) return null;
                      return (
                        <div className="rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: String((item.payload as Record<string, unknown>)?.fill || "#888") }}
                              />
                              <span className="text-gray-600">{String(item.name)}</span>
                            </div>
                            <span className="font-medium text-gray-900">
                              {formatNumber(Number(item.value))}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Pie
                    data={data.error_breakdown.map((item) => ({
                      name:
                        ERROR_CATEGORY_LABELS[item.error_category] ??
                        item.error_category,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="50%"
                    outerRadius="80%"
                    paddingAngle={2}
                  >
                    {data.error_breakdown.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={ERROR_COLORS[idx % ERROR_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="flex h-64 items-center justify-center text-sm text-gray-500">
                No errors in this period
              </p>
            )}
          </div>
        ) : null}

        {/* Queue Wait Trend — custom (avg/p95 multi-series) */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Queue Wait Time
            </h2>
            <TimeSeriesChart
              variant="line"
              data={data.queue_wait_trend}
              config={queueWaitConfig}
              yFormatter={formatDuration}
              valueFormatter={formatDuration}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
