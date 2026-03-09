import { useOverviewMetrics } from "@/api/hooks";
import { useFilters } from "@/hooks/useFilters";
import { KpiCardComponent } from "@/components/cards/KpiCardComponent";
import {
  CardSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatNumber,
  formatCurrency,
  formatPercent,
} from "@/lib/formatters";
import { useMemo } from "react";
import {
  AreaChart,
  BarList,
} from "@tremor/react";
import { PartialDayTooltip } from "@/components/charts/PartialDayTooltip";
import { splitPartialData } from "@/components/charts/splitPartialData";

export function OverviewPage() {
  const { filters } = useFilters();
  const { data, isLoading, error, refetch } = useOverviewMetrics(filters);

  const usageTrend = useMemo(
    () => data ? splitPartialData(data.usage_trend, ["runs"], ["indigo"], ["gray"]) : null,
    [data],
  );

  if (error) {
    return <ErrorState message="Failed to load overview" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Overview</h1>
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
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCardComponent
            title="Total Runs"
            data={data.kpi_cards.total_runs}
            formatter={formatNumber}
          />
          <KpiCardComponent
            title="Active Users"
            data={data.kpi_cards.active_users}
            formatter={formatNumber}
          />
          <KpiCardComponent
            title="Total Cost"
            data={data.kpi_cards.total_cost}
            formatter={formatCurrency}
          />
          <KpiCardComponent
            title="Success Rate"
            data={data.kpi_cards.success_rate}
            formatter={formatPercent}
          />
        </div>
      ) : null}

      {/* Usage Trend Chart */}
      {isLoading ? (
        <ChartSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-medium text-gray-900">
            Usage Trend
          </h2>
          <AreaChart
            className="h-72"
            data={usageTrend!.data}
            index="date"
            categories={usageTrend!.categories}
            colors={usageTrend!.colors}
            connectNulls
            showLegend={false}
            valueFormatter={formatNumber}
            showAnimation
            customTooltip={(props) => (
              <PartialDayTooltip {...props} valueFormatter={formatNumber} />
            )}
          />
        </div>
      ) : null}

      {/* Team Breakdown */}
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
