import { METRIC_REGISTRY } from "@/lib/widget-registry";
import { formatNumber, formatPercent } from "@/lib/formatters";
import { useOrg } from "@/api/hooks";
import { useWidgetData } from "@/api/widget";
import { ErrorState } from "@/components/ui/ErrorState";
import { FORMAT_FN, primaryMetric } from "./widget-helpers";
import { WidgetSkeleton } from "./WidgetCard";
import type { DateRange } from "@/types/api";
import type { WidgetConfig } from "@/types/widget";

// ── Gauge widget (progress bar toward org metric) ───────────────────────

export function GaugeWidgetLoader({
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

export function StatWidgetLoader({
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
