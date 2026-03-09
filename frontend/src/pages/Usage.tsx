import { useState } from "react";
import { useUsageMetrics } from "@/api/hooks";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
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
import { PERIOD_OPTIONS } from "@/lib/constants";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import type { ChartConfig } from "@/components/ui/chart";
import type { Period } from "@/types/api";
import type { WidgetConfig } from "@/types/widget";

const activeUsersConfig = {
  dau: { label: "DAU", color: "#6366f1" },
  wau: { label: "WAU", color: "#06b6d4" },
  mau: { label: "MAU", color: "#f59e0b" },
} satisfies ChartConfig;

// ── Template widgets ────────────────────────────────────────────────────────

function makeUsageTemplate(period: Period): WidgetConfig[] {
  const timeRange = { useGlobal: false as const, period };
  return [
    {
      id: "usage-agent-type-pie",
      title: "Agent Type Distribution",
      chartType: "pie",
      metric: "run_count",
      breakdownDimension: "agent_type",
      timeRange,
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function UsagePage() {
  const [period, setPeriod] = useState<Period>("30d");
  const { data, isLoading, error, refetch } = useUsageMetrics({ period });
  const template = makeUsageTemplate(period);
  const agentTypePieWidget = template[0];

  if (error) {
    return <ErrorState message="Failed to load usage data" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Usage & Adoption
        </h1>
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

      {/* Adoption Rate KPI — custom (composite metric) */}
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
        {/* Active Users Trend — custom (DAU/WAU/MAU multi-series) */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Active Users Trend
            </h2>
            <TimeSeriesChart
              data={data.active_users_trend}
              config={activeUsersConfig}
              yFormatter={formatNumber}
              valueFormatter={formatNumber}
            />
          </div>
        ) : null}

        {/* Agent Type Distribution — template widget */}
        <WidgetRenderer widget={agentTypePieWidget} globalPeriod={period} />
      </div>

      {/* Top Users — custom (multi-column table) */}
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
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Project Breakdown — custom (multi-column table) */}
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
