import { formatNumber } from "@/lib/formatters";
import { useUsageMetrics } from "@/api/hooks";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { type ChartConfig } from "@/components/ui/chart";
import { ErrorState } from "@/components/ui/ErrorState";
import { WidgetSkeleton } from "./WidgetCard";
import type { DateRange } from "@/types/api";

// ── Sealed: Active Users Trend (DAU/WAU/MAU) ────────────────────────────

const ACTIVE_USERS_CONFIG: ChartConfig = {
  dau: { label: "DAU", color: "#6366f1" },
  wau: { label: "WAU", color: "#06b6d4" },
  mau: { label: "MAU", color: "#f59e0b" },
};

export function ActiveUsersTrendWidget({ dateRange }: { dateRange: DateRange }) {
  const { data, isLoading, error, refetch } = useUsageMetrics({ start: dateRange.start, end: dateRange.end });

  if (isLoading) return <WidgetSkeleton chartType="active_users_trend" />;
  if (error)
    return (
      <ErrorState
        message="Failed to load active users data"
        onRetry={refetch}
      />
    );
  if (!data) return null;

  return (
    <TimeSeriesChart
      data={data.active_users_trend}
      config={ACTIVE_USERS_CONFIG}
      yFormatter={formatNumber}
      valueFormatter={formatNumber}
    />
  );
}

// ── Sealed: Top Users ───────────────────────────────────────────────────

export function TopUsersWidget({ dateRange }: { dateRange: DateRange }) {
  const { data, isLoading, error, refetch } = useUsageMetrics({ start: dateRange.start, end: dateRange.end });

  if (isLoading) return <WidgetSkeleton chartType="top_users" />;
  if (error)
    return <ErrorState message="Failed to load top users" onRetry={refetch} />;
  if (!data) return null;

  return (
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
                  <span className="font-medium text-gray-900">{user.name}</span>
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
  );
}
