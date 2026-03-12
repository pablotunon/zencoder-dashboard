import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { METRIC_REGISTRY } from "@/lib/widget-registry";
import { formatChangePct, formatTimestamp } from "@/lib/formatters";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { PIE_COLORS, primaryMetric } from "./widget-helpers";
import type { Granularity } from "@/types/api";
import type {
  WidgetConfig,
  MetricMeta,
  WidgetTimeseriesResponse,
  WidgetBreakdownResponse,
} from "@/types/widget";

// ── Single-metric chart dispatch ────────────────────────────────────────

export function SingleChartDispatch({
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
        <KpiWidget
          data={data}
          formatter={formatter}
          metricMeta={METRIC_REGISTRY[metric]}
        />
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
      if (data.type === "breakdown") {
        return <SingleTableWidget data={data} formatter={formatter} />;
      }
      return (
        <TimeseriesTableWidget
          data={data as WidgetTimeseriesResponse}
          formatter={formatter}
          metricLabel={METRIC_REGISTRY[metric]?.label ?? metric}
        />
      );

    default:
      return null;
  }
}

// ── KPI widget ──────────────────────────────────────────────────────────

function KpiWidget({
  data,
  formatter,
  metricMeta,
}: {
  data: WidgetTimeseriesResponse;
  formatter: (v: number) => string;
  metricMeta?: MetricMeta;
}) {
  const { value, change_pct } = data.summary;
  const changePositive = change_pct !== null ? change_pct >= 0 : null;

  const prevValue = useMemo(() => {
    if (change_pct === null || change_pct === -100) return null;
    return value / (1 + change_pct / 100);
  }, [value, change_pct]);

  const sparklineData = useMemo(
    () => data.data.filter((p) => !p.is_partial),
    [data.data],
  );

  const { low, high } = useMemo(() => {
    if (sparklineData.length === 0) return { low: null, high: null };
    let lo = sparklineData[0]!.value;
    let hi = sparklineData[0]!.value;
    for (const p of sparklineData) {
      if (p.value < lo) lo = p.value;
      if (p.value > hi) hi = p.value;
    }
    return { low: lo, high: hi };
  }, [sparklineData]);

  const sparklineColor = metricMeta?.color ?? "#6366f1";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-3xl font-semibold text-gray-900">
            {formatter(value)}
          </p>
          {change_pct !== null && (
            <p
              className={`mt-1 text-sm font-medium ${
                change_pct === 0
                  ? "text-gray-500"
                  : changePositive
                    ? "text-green-600"
                    : "text-red-600"
              }`}
            >
              {formatChangePct(change_pct)}{" "}
              <span className="font-normal text-gray-500">vs prev period</span>
            </p>
          )}
          {prevValue !== null && (
            <p className="mt-0.5 text-xs text-gray-400">
              was {formatter(prevValue)}
            </p>
          )}
        </div>
        {sparklineData.length > 1 && (
          <div className="h-12 w-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id={`kpi-fill-${metricMeta?.key ?? "default"}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparklineColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={sparklineColor} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={sparklineColor}
                  strokeWidth={1.5}
                  fill={`url(#kpi-fill-${metricMeta?.key ?? "default"})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {low !== null && high !== null && (
        <>
          <div className="mt-3 border-t border-dashed border-gray-200" />
          <p className="mt-2 text-xs text-gray-400">
            {low === high ? (
              <>Constant {formatter(low)}</>
            ) : (
              <>
                Low {formatter(low)}{" "}
                <span className="mx-1 text-gray-300">&middot;</span> High{" "}
                {formatter(high)}
              </>
            )}
          </p>
        </>
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

// ── Timeseries table widget (table without breakdown) ────────────────────

function TimeseriesTableWidget({
  data,
  formatter,
  metricLabel,
}: {
  data: WidgetTimeseriesResponse;
  formatter: (v: number) => string;
  metricLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="pb-3 font-medium">Date</th>
            <th className="pb-3 font-medium text-right">{metricLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.data
            .filter((p) => !p.is_partial)
            .map((point) => (
              <tr key={point.timestamp}>
                <td className="py-2.5 text-gray-900">
                  {formatTimestamp(point.timestamp, data.granularity)}
                </td>
                <td className="py-2.5 text-right text-gray-600">
                  {formatter(point.value)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
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
