import { useWidgetData } from "@/api/hooks";
import { METRIC_REGISTRY } from "@/lib/widget-registry";
import {
  formatNumber,
  formatCurrency,
  formatPercent,
  formatDuration,
} from "@/lib/formatters";
import { AGENT_TYPE_LABELS, ERROR_CATEGORY_LABELS } from "@/lib/constants";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ChartSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import type { WidgetDefinition } from "@/types/widget";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer } from "@/components/ui/chart";
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

const FORMAT_FNS = {
  number: formatNumber,
  currency: formatCurrency,
  percent: (v: number) => formatPercent(v),
  duration: formatDuration,
} as const;

const PIE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#f43f5e",
  "#64748b",
];

const LABEL_MAPS: Record<string, Record<string, string>> = {
  agent_type: AGENT_TYPE_LABELS,
  error_category: ERROR_CATEGORY_LABELS,
};

interface WidgetRendererProps {
  widget: WidgetDefinition;
  onRemove?: () => void;
}

export function WidgetRenderer({ widget, onRemove }: WidgetRendererProps) {
  const meta = METRIC_REGISTRY[widget.metricId];
  const { data, isLoading, error, refetch } = useWidgetData(widget.metricId, {
    period: widget.period,
  });

  const fmt = FORMAT_FNS[meta.yFormat];

  if (error) {
    return (
      <WidgetCard title={widget.title} onRemove={onRemove}>
        <ErrorState message="Failed to load data" onRetry={refetch} />
      </WidgetCard>
    );
  }

  if (isLoading || !data) {
    return <ChartSkeleton />;
  }

  const chartType = widget.chartType;

  // Pie chart
  if (chartType === "pie") {
    const labelMap = LABEL_MAPS[meta.indexKey] ?? {};
    const valueKey = meta.seriesKeys[0] ?? "value";
    const pieData = (data as Record<string, unknown>[]).map(
      (item, idx) => ({
        name: labelMap[String(item[meta.indexKey])] ?? String(item[meta.indexKey]),
        value: Number(item[valueKey]),
        fill: PIE_COLORS[idx % PIE_COLORS.length],
      }),
    );

    return (
      <WidgetCard title={widget.title} onRemove={onRemove}>
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
                          style={{
                            backgroundColor: String(
                              (item.payload as Record<string, unknown>)
                                ?.fill || "#888",
                            ),
                          }}
                        />
                        <span className="text-gray-600">
                          {String(item.name)}
                        </span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {fmt(Number(item.value))}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius="50%"
              outerRadius="80%"
              paddingAngle={2}
            >
              {pieData.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </WidgetCard>
    );
  }

  // Bar chart (non-timeseries)
  if (chartType === "bar" && meta.indexKey !== "date") {
    const labelMap = LABEL_MAPS[meta.indexKey] ?? {};
    const valueKey = meta.seriesKeys[0] ?? "value";
    const barConfig = {
      [valueKey]: meta.chartConfig[valueKey] ?? {
        label: valueKey,
        color: "#6366f1",
      },
    } satisfies ChartConfig;

    const barData = (data as Record<string, unknown>[]).map((item) => ({
      name:
        labelMap[String(item[meta.indexKey])] ?? String(item[meta.indexKey]),
      [valueKey]: Number(item[valueKey]),
    }));

    return (
      <WidgetCard title={widget.title} onRemove={onRemove}>
        <ChartContainer config={barConfig} className="h-64 w-full">
          <BarChart data={barData} accessibilityLayer>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={fmt} />
            <Tooltip
              content={(props) => {
                const { active, payload, label } = props;
                if (!active || !payload?.length || !payload[0]) return null;
                return (
                  <div className="rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg">
                    <p className="mb-1 font-medium text-gray-900">{label}</p>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-600">
                        {barConfig[valueKey]?.label ?? valueKey}
                      </span>
                      <span className="font-medium text-gray-900">
                        {fmt(Number(payload[0].value))}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey={valueKey}
              fill={`var(--color-${valueKey})`}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </WidgetCard>
    );
  }

  // Time-series charts: area, line, bar (with date index)
  const variant = chartType === "bar" ? "area" : chartType === "area" ? "area" : "line";

  return (
    <WidgetCard title={widget.title} onRemove={onRemove}>
      <TimeSeriesChart
        variant={variant}
        data={data as Record<string, unknown>[]}
        config={meta.chartConfig}
        yFormatter={fmt}
        valueFormatter={fmt}
        className="h-64 w-full"
      />
    </WidgetCard>
  );
}

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
