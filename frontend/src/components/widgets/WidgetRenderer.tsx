import { useMemo } from "react";
import { METRIC_REGISTRY } from "@/lib/widget-registry";
import { formatNumber, formatPercent, formatTimestamp } from "@/lib/formatters";
import { useWidgetData, useMultiMetricWidgetData } from "@/api/widget";
import { useUsageMetrics, useOrg } from "@/api/hooks";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { type ChartConfig } from "@/components/ui/chart";
import { ErrorState } from "@/components/ui/ErrorState";
import { FORMAT_FN, resolveEffectiveDateRange, primaryMetric } from "./widget-helpers";
import { WidgetCard, WidgetSkeleton } from "./WidgetCard";
import { SingleChartDispatch } from "./ChartWidgets";
import type { DateRange } from "@/types/api";
import type { WidgetConfig } from "@/types/widget";
import type { MergedTimeseriesData, MergedBreakdownData } from "@/api/widget";

// ── Public API ──────────────────────────────────────────────────────────

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
      <WidgetCard title={widget.title} timeRange={widget.timeRange} onRemove={onRemove}>
        <ActiveUsersTrendWidget dateRange={dateRange} />
      </WidgetCard>
    );
  }
  if (widget.chartType === "top_users") {
    return (
      <WidgetCard title={widget.title} timeRange={widget.timeRange} onRemove={onRemove}>
        <TopUsersWidget dateRange={dateRange} />
      </WidgetCard>
    );
  }

  // Gauge and stat — need org data + single metric
  if (widget.chartType === "gauge") {
    return (
      <WidgetCard title={widget.title} filters={widget.filters} timeRange={widget.timeRange} onRemove={onRemove}>
        <GaugeWidgetLoader widget={widget} dateRange={dateRange} />
      </WidgetCard>
    );
  }
  if (widget.chartType === "stat") {
    return (
      <WidgetCard title={widget.title} filters={widget.filters} timeRange={widget.timeRange} onRemove={onRemove}>
        <StatWidgetLoader widget={widget} dateRange={dateRange} />
      </WidgetCard>
    );
  }

  // Multi-metric path
  if (widget.metrics.length > 1) {
    return (
      <WidgetCard title={widget.title} filters={widget.filters} timeRange={widget.timeRange} onRemove={onRemove}>
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

// ── Single-metric widget ────────────────────────────────────────────────

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
    <WidgetCard
      title={widget.title}
      subtitle={meta?.description}
      tooltip={meta?.tooltip}
      filters={widget.filters}
      timeRange={widget.timeRange}
      onRemove={onRemove}
    >
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

// ── Multi-metric loader ─────────────────────────────────────────────────

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

// ── Multi-metric table ──────────────────────────────────────────────────

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

// ── Gauge widget (progress bar toward org metric) ───────────────────────

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

// ── Stat widget (value / denominator) ───────────────────────────────────

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

// ── Sealed: Active Users Trend (DAU/WAU/MAU) ────────────────────────────

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

// ── Sealed: Top Users ───────────────────────────────────────────────────

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
