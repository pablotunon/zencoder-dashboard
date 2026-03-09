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
import { AGENT_TYPE_LABELS, AGENT_TYPE_COLORS } from "@/lib/constants";
import {
  Cell,
  Pie,
  PieChart,
  Tooltip,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";

const activeUsersConfig = {
  dau: { label: "DAU", color: "#6366f1" },
  wau: { label: "WAU", color: "#06b6d4" },
  mau: { label: "MAU", color: "#f59e0b" },
} satisfies ChartConfig;

export function UsagePage() {
  const { filters } = useFilters();
  const { data, isLoading, error, refetch } = useUsageMetrics(filters);

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
            <TimeSeriesChart
              data={data.active_users_trend}
              config={activeUsersConfig}
              yFormatter={formatNumber}
              valueFormatter={formatNumber}
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
                              style={{ backgroundColor: String((item.payload as Record<string, unknown>)?.fill || "#888") }}
                            />
                            <span className="text-gray-600">{String(item.name)}</span>
                          </div>
                          <span className="font-medium text-gray-900">
                            {formatNumber(Number(item.value))}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Pie
                  data={data.agent_type_breakdown.map((item) => ({
                    name: AGENT_TYPE_LABELS[item.agent_type] ?? item.agent_type,
                    value: item.runs,
                    fill: AGENT_TYPE_COLORS[item.agent_type] ?? "#64748b",
                  }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="50%"
                  outerRadius="80%"
                  paddingAngle={2}
                >
                  {data.agent_type_breakdown.map((item) => (
                    <Cell
                      key={item.agent_type}
                      fill={AGENT_TYPE_COLORS[item.agent_type] ?? "#64748b"}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
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
