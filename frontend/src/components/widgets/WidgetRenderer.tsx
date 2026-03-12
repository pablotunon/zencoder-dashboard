import { METRIC_REGISTRY } from "@/lib/widget-registry";
import { formatNumber } from "@/lib/formatters";
import { useWidgetData } from "@/api/widget";
import { ErrorState } from "@/components/ui/ErrorState";
import { FORMAT_FN, resolveEffectiveDateRange, primaryMetric } from "./widget-helpers";
import { WidgetCard, WidgetSkeleton } from "./WidgetCard";
import { SingleChartDispatch } from "./ChartWidgets";
import { ActiveUsersTrendWidget, TopUsersWidget } from "./SealedWidgets";
import { MultiMetricLoader } from "./MultiMetricWidgets";
import { GaugeWidgetLoader, StatWidgetLoader } from "./OrgMetricWidgets";
import type { DateRange } from "@/types/api";
import type { WidgetConfig } from "@/types/widget";

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
      <WidgetCard title={widget.title} filters={widget.filters} onRemove={onRemove}>
        <GaugeWidgetLoader widget={widget} dateRange={dateRange} />
      </WidgetCard>
    );
  }
  if (widget.chartType === "stat") {
    return (
      <WidgetCard title={widget.title} filters={widget.filters} onRemove={onRemove}>
        <StatWidgetLoader widget={widget} dateRange={dateRange} />
      </WidgetCard>
    );
  }

  // Multi-metric path
  if (widget.metrics.length > 1) {
    return (
      <WidgetCard title={widget.title} filters={widget.filters} onRemove={onRemove}>
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
