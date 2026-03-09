import { usePerformanceMetrics } from "@/api/hooks";
import { useFilters } from "@/hooks/useFilters";
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
import { ERROR_CATEGORY_LABELS } from "@/lib/constants";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { PartialDayTooltip } from "@/components/charts/PartialDayTooltip";

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
            <ChartContainer config={successRateConfig} className="h-64 w-full">
              <AreaChart data={data.success_rate_trend} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatPercent(v)} />
                <Tooltip
                  content={(props) => (
                    <PartialDayTooltip
                      {...props}
                      config={successRateConfig}
                      valueFormatter={(v) => formatPercent(v)}
                    />
                  )}
                />
                {(["success_rate", "failure_rate", "error_rate"] as const).map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={`var(--color-${key})`}
                    fill={`var(--color-${key})`}
                    fillOpacity={0.1}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!payload?.is_partial) return <circle key={`dot-${key}-${cx}`} r={0} />;
                      return (
                        <circle
                          key={`dot-${key}-${cx}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={`var(--color-${key})`}
                          fillOpacity={0.4}
                          stroke={`var(--color-${key})`}
                          strokeOpacity={0.4}
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
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
            <ChartContainer config={latencyConfig} className="h-64 w-full">
              <LineChart data={data.latency_trend} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={formatDuration} />
                <Tooltip
                  content={(props) => (
                    <PartialDayTooltip
                      {...props}
                      config={latencyConfig}
                      valueFormatter={formatDuration}
                    />
                  )}
                />
                {(["p50", "p95", "p99"] as const).map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!payload?.is_partial) return <circle key={`dot-${key}-${cx}`} r={0} />;
                      return (
                        <circle
                          key={`dot-${key}-${cx}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={`var(--color-${key})`}
                          fillOpacity={0.4}
                          stroke={`var(--color-${key})`}
                          strokeOpacity={0.4}
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ChartContainer>
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

        {/* Queue Wait Trend */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Queue Wait Time
            </h2>
            <ChartContainer config={queueWaitConfig} className="h-64 w-full">
              <LineChart data={data.queue_wait_trend} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={formatDuration} />
                <Tooltip
                  content={(props) => (
                    <PartialDayTooltip
                      {...props}
                      config={queueWaitConfig}
                      valueFormatter={formatDuration}
                    />
                  )}
                />
                {(["avg_wait_ms", "p95_wait_ms"] as const).map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!payload?.is_partial) return <circle key={`dot-${key}-${cx}`} r={0} />;
                      return (
                        <circle
                          key={`dot-${key}-${cx}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={`var(--color-${key})`}
                          fillOpacity={0.4}
                          stroke={`var(--color-${key})`}
                          strokeOpacity={0.4}
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </div>
        ) : null}
      </div>
    </div>
  );
}
