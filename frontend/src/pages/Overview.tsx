import { useState } from "react";
import { useOverviewMetrics } from "@/api/hooks";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatNumber,
  formatCurrency,
  formatPercent,
} from "@/lib/formatters";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Period } from "@/types/api";
import type { WidgetConfig } from "@/types/widget";

// ── Template widgets ────────────────────────────────────────────────────────

function makeOverviewTemplate(period: Period): WidgetConfig[] {
  const timeRange = { useGlobal: false as const, period };
  return [
    {
      id: "overview-kpi-runs",
      title: "Total Runs",
      chartType: "kpi",
      metric: "run_count",
      timeRange,
    },
    {
      id: "overview-kpi-users",
      title: "Active Users",
      chartType: "kpi",
      metric: "active_users",
      timeRange,
    },
    {
      id: "overview-kpi-cost",
      title: "Total Cost",
      chartType: "kpi",
      metric: "cost",
      timeRange,
    },
    {
      id: "overview-kpi-success",
      title: "Success Rate",
      chartType: "kpi",
      metric: "success_rate",
      timeRange,
    },
    {
      id: "overview-usage-trend",
      title: "Usage Trend",
      chartType: "area",
      metric: "run_count",
      timeRange,
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const { data, isLoading, error, refetch } = useOverviewMetrics({ period });
  const template = makeOverviewTemplate(period);

  if (error) {
    return <ErrorState message="Failed to load overview" onRetry={refetch} />;
  }

  const kpiWidgets = template.filter((w) => w.chartType === "kpi");
  const trendWidget = template.find((w) => w.id === "overview-usage-trend")!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Overview</h1>
        <div className="flex items-center gap-3">
          {data && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
              </span>
              <span className="text-sm text-gray-600">
                {data.active_runs_count} active runs
              </span>
            </div>
          )}
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
      </div>

      {/* KPI Cards — template widgets */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiWidgets.map((widget) => (
          <WidgetRenderer
            key={widget.id}
            widget={widget}
            globalPeriod={period}
          />
        ))}
      </div>

      {/* Usage Trend — template widget */}
      <WidgetRenderer widget={trendWidget} globalPeriod={period} />

      {/* Team Breakdown — custom component (multi-column table) */}
      {isLoading ? (
        <TableSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-medium text-gray-900">
            Team Breakdown
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="pb-3 font-medium">Team</th>
                  <th className="pb-3 font-medium text-right">Runs</th>
                  <th className="pb-3 font-medium text-right">Active Users</th>
                  <th className="pb-3 font-medium text-right">Cost</th>
                  <th className="pb-3 font-medium text-right">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.team_breakdown.map((team) => (
                  <tr key={team.team_id}>
                    <td className="py-3 font-medium text-gray-900">
                      {team.team_name}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {formatNumber(team.runs)}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {team.active_users}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {formatCurrency(team.cost)}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={
                          team.success_rate >= 90
                            ? "text-green-600"
                            : team.success_rate >= 80
                              ? "text-yellow-600"
                              : "text-red-600"
                        }
                      >
                        {formatPercent(team.success_rate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
