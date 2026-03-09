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
import { useWidgetData } from "@/api/widget";
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
} from "@/lib/formatters";
import type { Period } from "@/types/api";
import type {
  WidgetConfig,
  ValueFormat,
  WidgetTimeseriesResponse,
  WidgetBreakdownResponse,
} from "@/types/widget";

// ── Helpers ─────────────────────────────────────────────────────────────────

const FORMAT_FN: Record<ValueFormat, (v: number) => string> = {
  number: formatNumber,
  currency: formatCurrency,
  percent: formatPercent,
  duration: formatDuration,
};

const PIE_COLORS = [
  "#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444",
  "#06b6d4", "#f43f5e", "#14b8a6", "#059669", "#0d9488",
];

function resolveEffectivePeriod(
  widget: WidgetConfig,
  globalPeriod: Period,
): Period {
  if (widget.timeRange.useGlobal) return globalPeriod;
  return widget.timeRange.period;
}

// ── Public API ──────────────────────────────────────────────────────────────

interface WidgetRendererProps {
  widget: WidgetConfig;
  globalPeriod: Period;
  onRemove?: () => void;
}

export function WidgetRenderer({
  widget,
  globalPeriod,
  onRemove,
}: WidgetRendererProps) {
  const meta = METRIC_REGISTRY[widget.metric];
  const period = resolveEffectivePeriod(widget, globalPeriod);
  const formatter = meta ? FORMAT_FN[meta.format] : formatNumber;

  const { data, isLoading, error, refetch } = useWidgetData({
    metric: widget.metric,
    period,
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
        <ChartDispatch
          widget={widget}
          data={data}
          formatter={formatter}
          color={meta?.color ?? "#6366f1"}
        />
      ) : null}
    </WidgetCard>
  );
}

// ── Card wrapper ────────────────────────────────────────────────────────────

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

// ── Loading skeleton per chart type ─────────────────────────────────────────

function WidgetSkeleton({ chartType }: { chartType: string }) {
  if (chartType === "kpi") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }
  if (chartType === "table") {
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

// ── Chart dispatch ──────────────────────────────────────────────────────────

function ChartDispatch({
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
          metricKey={widget.metric}
          metricLabel={METRIC_REGISTRY[widget.metric]?.label ?? widget.metric}
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
          metricKey={widget.metric}
          metricLabel={METRIC_REGISTRY[widget.metric]?.label ?? widget.metric}
        />
      );

    case "pie":
      return data.type === "breakdown" ? (
        <PieWidget data={data} formatter={formatter} />
      ) : null;

    case "table":
      return data.type === "breakdown" ? (
        <TableWidget data={data} formatter={formatter} />
      ) : null;

    default:
      return null;
  }
}

// ── KPI widget ──────────────────────────────────────────────────────────────

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

// ── Time-series widget (line / area / bar) ──────────────────────────────────

function TimeSeriesWidget({
  data,
  variant,
  formatter,
  color,
  metricKey,
  metricLabel,
}: {
  data: WidgetTimeseriesResponse;
  variant: "line" | "area" | "bar";
  formatter: (v: number) => string;
  color: string;
  metricKey: string;
  metricLabel: string;
}) {
  const chartData = useMemo(
    () =>
      data.data.map((p) => ({
        date: p.date,
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
          <XAxis dataKey="date" tickLine={false} axisLine={false} />
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
    />
  );
}

// ── Breakdown bar widget ────────────────────────────────────────────────────

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

// ── Pie widget (donut) ──────────────────────────────────────────────────────

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
    <ChartContainer config={config} className="h-64 w-full">
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
            <Cell
              key={item.label}
              fill={PIE_COLORS[i % PIE_COLORS.length]}
            />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

// ── Table widget ────────────────────────────────────────────────────────────

function TableWidget({
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
