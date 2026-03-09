import { useUsageMetrics } from "@/api/hooks";
import { useFilters } from "@/hooks/useFilters";
import {
  CardSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatNumber,
  formatPercent,
  formatCurrency,
} from "@/lib/formatters";
import { AGENT_TYPE_LABELS, AGENT_TYPE_TREMOR_COLORS } from "@/lib/constants";
import { useMemo } from "react";
import { AreaChart, DonutChart } from "@tremor/react";
import { PartialDayTooltip } from "@/components/charts/PartialDayTooltip";
import { splitPartialData } from "@/components/charts/splitPartialData";

export function UsagePage() {
  const { filters } = useFilters();
  const { data, isLoading, error, refetch } = useUsageMetrics(filters);

  const activeUsersTrend = useMemo(
    () => data ? splitPartialData(data.active_users_trend, ["dau", "wau", "mau"], ["indigo", "cyan", "amber"], ["gray", "gray", "gray"]) : null,
    [data],
  );

  if (error) {
    return <ErrorState message="Failed to load usage data" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">
        Usage & Adoption
      </h1>

      {/* Adoption Rate KPI */}
      {isLoading ? (
        <CardSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Adoption Rate</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {formatPercent(data.adoption_rate.value)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {data.adoption_rate.active_users} of{" "}
            {data.adoption_rate.licensed_users} licensed users active
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Active Users Trend */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Active Users Trend
            </h2>
            <AreaChart
              className="h-64"
              data={activeUsersTrend!.data}
              index="date"
              categories={activeUsersTrend!.categories}
              colors={activeUsersTrend!.colors}
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

        {/* Agent Type Breakdown */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Agent Type Distribution
            </h2>
            <DonutChart
              className="h-64"
              data={data.agent_type_breakdown.map((item) => ({
                name:
                  AGENT_TYPE_LABELS[item.agent_type] ?? item.agent_type,
                value: item.runs,
              }))}
              category="value"
              index="name"
              colors={data.agent_type_breakdown.map(
                (item) =>
                  AGENT_TYPE_TREMOR_COLORS[item.agent_type] ?? "gray",
              )}
              valueFormatter={formatNumber}
              showAnimation
            />
          </div>
        ) : null}
      </div>

      {/* Top Users */}
      {isLoading ? (
        <TableSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-medium text-gray-900">
            Top Users
          </h2>
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
                        <span className="font-medium text-gray-900">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-gray-600">{user.team_name}</td>
                    <td className="py-3 text-right text-gray-600">
                      {formatNumber(user.runs)}
                    </td>
                    <td className="py-3 text-right text-gray-500">
                      {user.last_active
                        ? new Date(user.last_active).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Project Breakdown */}
      {isLoading ? (
        <TableSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-medium text-gray-900">
            Project Breakdown
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="pb-3 font-medium">Project</th>
                  <th className="pb-3 font-medium text-right">Runs</th>
                  <th className="pb-3 font-medium text-right">Active Users</th>
                  <th className="pb-3 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.project_breakdown.map((project) => (
                  <tr key={project.project_id}>
                    <td className="py-3 font-medium text-gray-900">
                      {project.project_name}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {formatNumber(project.runs)}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {project.active_users}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {formatCurrency(project.cost)}
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
