import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { METRIC_REGISTRY } from "@/lib/widget-registry";
import { useWidgetData, useMultiMetricWidgetData } from "@/api/widget";
import { useUsageMetrics, useOrg } from "@/api/hooks";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatNumber,
  formatCurrency,
  formatPercent,
  formatDuration,
  formatChangePct,
  formatTimestamp,
} from "@/lib/formatters";
import type { DateRange, Granularity } from "@/types/api";
import type {
  WidgetConfig,
  ValueFormat,
  MetricKey,
  WidgetTimeseriesResponse,
  WidgetBreakdownResponse,
} from "@/types/widget";
import type { MergedTimeseriesData, MergedBreakdownData } from "@/api/widget";

// ── Helpers ─────────────────────────────────────────────────────────────────

const FORMAT_FN: Record<ValueFormat, (v: number) => string> = {
  number: formatNumber,
  currency: formatCurrency,
  percent: formatPercent,
  duration: formatDuration,
};

const PIE_COLORS = [
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

function resolveEffectiveDateRange(
  widget: WidgetConfig,
  globalDateRange: DateRange,
): DateRange {
  if (widget.timeRange.useGlobal) return globalDateRange;
  return { start: widget.timeRange.start, end: widget.timeRange.end };
}

function primaryMetric(widget: WidgetConfig): MetricKey {
  return widget.metrics[0] ?? "run_count";
}

// ── Public API ──────────────────────────────────────────────────────────────

interface WidgetRendererProps {
  widget: WidgetConfig;
  globalDateRange: DateRange;
  onRemove?: () => void;
}

export function WidgetRenderer({
  widget,
  globalDateRange,
  onRemove,
}: WidgetRendererProps) {
  const dateRange = resolveEffectiveDateRange(widget, globalDateRange);

  // Sealed widget types — use their own data sources
  if (widget.chartType === "active_users_trend") {
    return (
      <WidgetCard title={widget.title} onRemove={onRemove}>
        <ActiveUsersTrendWidget dateRange={dateRange} />
      </WidgetCard>
    );
  }
  if (widget.chartType === "top_users") {
    return (
      <WidgetCard title={widget.title} onRemove={onRemove}>
        <TopUsersWidget dateRange={dateRange} />
      </WidgetCard>
    );
  }

  // Gauge and stat — need org data + single metric
  if (widget.chartType === "gauge") {
    return (
      <WidgetCard title={widget.title} onRemove={onRemove}>
        <GaugeWidgetLoader widget={widget} dateRange={dateRange} />
      </WidgetCard>
    );
  }
  if (widget.chartType === "stat") {
    return (
      <WidgetCard title={widget.title} onRemove={onRemove}>
        <StatWidgetLoader widget={widget} dateRange={dateRange} />
      </WidgetCard>
    );
  }

  // Multi-metric path
  if (widget.metrics.length > 1) {
    return (
      <WidgetCard title={widget.title} onRemove={onRemove}>
        <MultiMetricLoader widget={widget} dateRange={dateRange} />
      </WidgetCard>
    );
  }

  // Single-metric path (original behavior)
  return (
    <SingleMetricWidget
      widget={widget}
      globalDateRange={globalDateRange}
      onRemove={onRemove}
    />
  );
}

// ── Single-metric widget (original path) ─────────────────────────────────

function SingleMetricWidget({
  widget,
  globalDateRange,
  onRemove,
}: WidgetRendererProps) {
  const metric = primaryMetric(widget);
  const meta = METRIC_REGISTRY[metric];
  const dateRange = resolveEffectiveDateRange(widget, globalDateRange);
  const formatter = meta ? FORMAT_FN[meta.format] : formatNumber;

  const { data, isLoading, error, refetch } = useWidgetData({
    metric,
    start: dateRange.start,
    end: dateRange.end,
    breakdown: widget.breakdownDimension,
    filters: widget.filters,
  });

  return (
    <WidgetCard title={widget.title} onRemove={onRemove}>
      {isLoading ? (
        <WidgetSkeleton chartType={widget.chartType} />
      ) : error ? (
        <ErrorState
          message="Failed to load widget data"
          onRetry={() => refetch()}
        />
      ) : data ? (
        <SingleChartDispatch
          widget={widget}
          data={data}
          formatter={formatter}
          color={meta?.color ?? "#6366f1"}
        />
      ) : null}
    </WidgetCard>
  );
}

// ── Multi-metric loader ──────────────────────────────────────────────────

function MultiMetricLoader({
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

  if (
    data.type === "merged_timeseries" &&
    (widget.chartType === "line" || widget.chartType === "area")
  ) {
    return <MultiTimeSeriesWidget data={data} variant={widget.chartType} />;
  }
  if (data.type === "merged_breakdown" && widget.chartType === "table") {
    return <MultiTableWidget data={data} />;
  }

  return null;
}

// ── Multi-metric time-series ─────────────────────────────────────────────

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

// ── Multi-metric table ───────────────────────────────────────────────────

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

// ── Gauge widget (progress bar toward org metric) ────────────────────────

function GaugeWidgetLoader({
  widget,
  dateRange,
}: {
  widget: WidgetConfig;
  dateRange: DateRange;
}) {
  const metric = primaryMetric(widget);
  const { data: orgData } = useOrg();
  const { data, isLoading, error, refetch } = useWidgetData({
    metric,
    start: dateRange.start,
    end: dateRange.end,
    breakdown: widget.breakdownDimension,
    filters: widget.filters,
  });

  if (isLoading) return <WidgetSkeleton chartType="gauge" />;
  if (error)
    return (
      <ErrorState message="Failed to load widget data" onRetry={refetch} />
    );
  if (!data || data.type !== "timeseries") return null;

  const currentValue = data.summary.value;
  const meta = METRIC_REGISTRY[metric];
  const formatter = meta ? FORMAT_FN[meta.format] : formatNumber;

  let target: number | null = null;
  if (widget.orgMetric === "monthly_budget" && orgData?.monthly_budget) {
    target = orgData.monthly_budget;
  } else if (widget.orgMetric === "licensed_users" && orgData?.licensed_users) {
    target = orgData.licensed_users;
  }

  const pct = target ? (currentValue / target) * 100 : null;
  const daysInMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  ).getDate();
  const dayOfMonth = Math.max(new Date().getDate(), 1);
  const projected = currentValue * (daysInMonth / dayOfMonth);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-semibold text-gray-900">
            {formatter(currentValue)}
          </p>
          {target !== null && (
            <p className="mt-1 text-sm text-gray-500">
              of {formatter(target)}{" "}
              {widget.orgMetric === "monthly_budget"
                ? "monthly budget"
                : "licensed users"}
            </p>
          )}
        </div>
        {target !== null && (
          <div className="text-right">
            <p className="text-sm text-gray-500">Projected</p>
            <p className="text-lg font-medium text-gray-700">
              {formatter(projected)}
            </p>
          </div>
        )}
      </div>
      {pct !== null && (
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full ${
                pct > 90
                  ? "bg-red-500"
                  : pct > 75
                    ? "bg-yellow-500"
                    : "bg-green-500"
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {pct.toFixed(1)}% utilized
          </p>
        </div>
      )}
    </div>
  );
}

// ── Stat widget (value / denominator) ────────────────────────────────────

function StatWidgetLoader({
  widget,
  dateRange,
}: {
  widget: WidgetConfig;
  dateRange: DateRange;
}) {
  const metric = primaryMetric(widget);
  const { data: orgData } = useOrg();
  const { data, isLoading, error, refetch } = useWidgetData({
    metric,
    start: dateRange.start,
    end: dateRange.end,
    breakdown: widget.breakdownDimension,
    filters: widget.filters,
  });

  if (isLoading) return <WidgetSkeleton chartType="stat" />;
  if (error)
    return (
      <ErrorState message="Failed to load widget data" onRetry={refetch} />
    );
  if (!data || data.type !== "timeseries") return null;

  const currentValue = data.summary.value;
  const meta = METRIC_REGISTRY[metric];
  const formatter = meta ? FORMAT_FN[meta.format] : formatNumber;

  let denominator: number | null = null;
  if (widget.orgMetric === "licensed_users" && orgData?.licensed_users) {
    denominator = orgData.licensed_users;
  } else if (widget.orgMetric === "monthly_budget" && orgData?.monthly_budget) {
    denominator = orgData.monthly_budget;
  }

  const rawPct = denominator ? (currentValue / denominator) * 100 : null;
  const pct = rawPct !== null ? Math.min(rawPct, 100) : null;

  return (
    <div>
      <p className="text-3xl font-semibold text-gray-900">
        {pct !== null ? formatPercent(pct) : formatter(currentValue)}
      </p>
      {denominator !== null && (
        <p className="mt-1 text-sm text-gray-500">
          {formatter(currentValue)} of {formatter(denominator)}{" "}
          {widget.orgMetric === "licensed_users" ? "licensed users active" : ""}
        </p>
      )}
    </div>
  );
}

// ── Sealed: Active Users Trend (DAU/WAU/MAU) ─────────────────────────────

const ACTIVE_USERS_CONFIG: ChartConfig = {
  dau: { label: "DAU", color: "#6366f1" },
  wau: { label: "WAU", color: "#06b6d4" },
  mau: { label: "MAU", color: "#f59e0b" },
};

function ActiveUsersTrendWidget({ dateRange }: { dateRange: DateRange }) {
  const { data, isLoading, error, refetch } = useUsageMetrics({ start: dateRange.start, end: dateRange.end });

  if (isLoading) return <WidgetSkeleton chartType="active_users_trend" />;
  if (error)
    return (
      <ErrorState
        message="Failed to load active users data"
        onRetry={refetch}
      />
    );
  if (!data) return null;

  return (
    <TimeSeriesChart
      data={data.active_users_trend}
      config={ACTIVE_USERS_CONFIG}
      yFormatter={formatNumber}
      valueFormatter={formatNumber}
    />
  );
}

// ── Sealed: Top Users ────────────────────────────────────────────────────

function TopUsersWidget({ dateRange }: { dateRange: DateRange }) {
  const { data, isLoading, error, refetch } = useUsageMetrics({ start: dateRange.start, end: dateRange.end });

  if (isLoading) return <WidgetSkeleton chartType="top_users" />;
  if (error)
    return <ErrorState message="Failed to load top users" onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="pb-3 font-medium">User</th>
            <th className="pb-3 font-medium">Team</th>
            <th className="pb-3 font-medium text-right">Runs</th>
            <th className="pb-3 font-medium text-right">Last Active</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.top_users.map((user) => (
            <tr key={user.user_id}>
              <td className="py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <span className="font-medium text-gray-900">{user.name}</span>
                </div>
              </td>
              <td className="py-3 text-gray-600">{user.team_name}</td>
              <td className="py-3 text-right text-gray-600">
                {formatNumber(user.runs)}
              </td>
              <td className="py-3 text-right text-gray-500">
                {user.last_active
                  ? new Date(user.last_active).toLocaleDateString()
                  : "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Card wrapper ────────────────────────────────────────────────────────

function WidgetCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-900">{title}</h2>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Remove widget"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Loading skeleton per chart type ─────────────────────────────────────

function WidgetSkeleton({ chartType }: { chartType: string }) {
  if (chartType === "kpi" || chartType === "gauge" || chartType === "stat") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }
  if (chartType === "table" || chartType === "top_users") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  return <Skeleton className="h-64 w-full" />;
}

// ── Single-metric chart dispatch ────────────────────────────────────────

function SingleChartDispatch({
  widget,
  data,
  formatter,
  color,
}: {
  widget: WidgetConfig;
  data: WidgetTimeseriesResponse | WidgetBreakdownResponse;
  formatter: (v: number) => string;
  color: string;
}) {
  const metric = primaryMetric(widget);

  switch (widget.chartType) {
    case "kpi":
      return data.type === "timeseries" ? (
        <KpiWidget data={data} formatter={formatter} />
      ) : null;

    case "line":
    case "area":
      return data.type === "timeseries" ? (
        <TimeSeriesWidget
          data={data}
          variant={widget.chartType}
          formatter={formatter}
          color={color}
          metricKey={metric}
          metricLabel={METRIC_REGISTRY[metric]?.label ?? metric}
          granularity={data.granularity}
        />
      ) : null;

    case "bar":
      if (data.type === "breakdown") {
        return (
          <BreakdownBarWidget data={data} formatter={formatter} color={color} />
        );
      }
      return (
        <TimeSeriesWidget
          data={data as WidgetTimeseriesResponse}
          variant="bar"
          formatter={formatter}
          color={color}
          metricKey={metric}
          metricLabel={METRIC_REGISTRY[metric]?.label ?? metric}
          granularity={(data as WidgetTimeseriesResponse).granularity}
        />
      );

    case "pie":
      return data.type === "breakdown" ? (
        <PieWidget data={data} formatter={formatter} />
      ) : null;

    case "table":
      return data.type === "breakdown" ? (
        <SingleTableWidget data={data} formatter={formatter} />
      ) : null;

    default:
      return null;
  }
}

// ── KPI widget ──────────────────────────────────────────────────────────

function KpiWidget({
  data,
  formatter,
}: {
  data: WidgetTimeseriesResponse;
  formatter: (v: number) => string;
}) {
  const changePositive =
    data.summary.change_pct !== null ? data.summary.change_pct >= 0 : null;

  return (
    <div>
      <p className="text-3xl font-semibold text-gray-900">
        {formatter(data.summary.value)}
      </p>
      {data.summary.change_pct !== null && (
        <p
          className={`mt-1 text-sm font-medium ${
            changePositive ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatChangePct(data.summary.change_pct)}{" "}
          <span className="font-normal text-gray-500">vs prev period</span>
        </p>
      )}
    </div>
  );
}

// ── Time-series widget (line / area / bar) ──────────────────────────────

function TimeSeriesWidget({
  data,
  variant,
  formatter,
  color,
  metricKey,
  metricLabel,
  granularity,
}: {
  data: WidgetTimeseriesResponse;
  variant: "line" | "area" | "bar";
  formatter: (v: number) => string;
  color: string;
  metricKey: string;
  metricLabel: string;
  granularity?: Granularity;
}) {
  const chartData = useMemo(
    () =>
      data.data.map((p) => ({
        timestamp: p.timestamp,
        [metricKey]: p.value,
        is_partial: p.is_partial,
      })),
    [data.data, metricKey],
  );

  const config: ChartConfig = useMemo(
    () => ({ [metricKey]: { label: metricLabel, color } }),
    [metricKey, metricLabel, color],
  );

  if (variant === "bar") {
    return (
      <ChartContainer config={config} className="h-64 w-full">
        <BarChart data={chartData} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickFormatter={granularity ? (v: string) => formatTimestamp(v, granularity) : undefined}
          />
          <YAxis tickLine={false} axisLine={false} tickFormatter={formatter} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg">
                  <p className="mb-1 font-medium text-gray-900">
                    {String(label)}
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-gray-600">{metricLabel}</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      {formatter(Number(payload[0]?.value ?? 0))}
                    </span>
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey={metricKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    );
  }

  return (
    <TimeSeriesChart
      variant={variant}
      data={chartData}
      config={config}
      yFormatter={formatter}
      valueFormatter={formatter}
      granularity={granularity}
    />
  );
}

// ── Breakdown bar widget ────────────────────────────────────────────────

function BreakdownBarWidget({
  data,
  formatter,
  color,
}: {
  data: WidgetBreakdownResponse;
  formatter: (v: number) => string;
  color: string;
}) {
  const config: ChartConfig = useMemo(
    () => ({ value: { label: data.metric, color } }),
    [data.metric, color],
  );

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data.data} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={formatter} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg">
                <p className="mb-1 font-medium text-gray-900">
                  {String(label)}
                </p>
                <span className="font-medium text-gray-900">
                  {formatter(Number(payload[0]?.value ?? 0))}
                </span>
              </div>
            );
          }}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

// ── Pie widget (donut) ──────────────────────────────────────────────────

function PieWidget({
  data,
  formatter,
}: {
  data: WidgetBreakdownResponse;
  formatter: (v: number) => string;
}) {
  const config: ChartConfig = useMemo(
    () =>
      Object.fromEntries(
        data.data.map((item, i) => [
          item.label,
          { label: item.label, color: PIE_COLORS[i % PIE_COLORS.length] },
        ]),
      ),
    [data.data],
  );

  return (
    <div className="flex items-center justify-center gap-6">
      <ChartContainer config={config} className="h-64 w-64">
        <PieChart accessibilityLayer>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              if (!item) return null;
              return (
                <div className="rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: String(
                            (item.payload as Record<string, unknown>)?.fill ??
                              "#888",
                          ),
                        }}
                      />
                      <span className="text-gray-600">{String(item.name)}</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      {formatter(Number(item.value))}
                    </span>
                  </div>
                </div>
              );
            }}
          />
          <Pie
            data={data.data.map((item, i) => ({
              name: item.label,
              value: item.value,
              fill: PIE_COLORS[i % PIE_COLORS.length],
            }))}
            dataKey="value"
            nameKey="name"
            innerRadius="50%"
            outerRadius="80%"
            paddingAngle={2}
          >
            {data.data.map((item, i) => (
              <Cell key={item.label} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="flex flex-col gap-1.5">
        {data.data.map((item, i) => (
          <li key={item.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="text-xs text-gray-600">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Single-metric table widget ──────────────────────────────────────────

function SingleTableWidget({
  data,
  formatter,
}: {
  data: WidgetBreakdownResponse;
  formatter: (v: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="pb-3 font-medium">
              {data.dimension.charAt(0).toUpperCase() + data.dimension.slice(1)}
            </th>
            <th className="pb-3 font-medium text-right">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.data.map((item) => (
            <tr key={item.label}>
              <td className="py-2.5 text-gray-900">{item.label}</td>
              <td className="py-2.5 text-right text-gray-600">
                {formatter(item.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
