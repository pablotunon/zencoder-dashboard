import { useState } from "react";
import { RowLayout } from "@/components/widgets/RowLayout";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Period } from "@/types/api";
import type { DashboardRow } from "@/types/widget";

function makeUsageRows(period: Period): DashboardRow[] {
  const timeRange = { useGlobal: false as const, period };
  return [
    // Row 1: Adoption stat + agent type pie
    {
      id: "usage-top",
      columns: 2,
      widgets: [
        {
          id: "usage-adoption-stat",
          title: "Adoption Rate",
          chartType: "stat",
          metrics: ["active_users"],
          orgMetric: "licensed_users",
          timeRange,
        },
        {
          id: "usage-agent-type-pie",
          title: "Agent Type Distribution",
          chartType: "pie",
          metrics: ["run_count"],
          breakdownDimension: "agent_type",
          timeRange,
        },
      ],
    },
    // Row 2: Active users trend (sealed)
    {
      id: "usage-trend",
      columns: 1,
      widgets: [
        {
          id: "usage-active-users-trend",
          title: "Active Users Trend",
          chartType: "active_users_trend",
          metrics: [],
          timeRange,
        },
      ],
    },
    // Row 3: Top users (sealed) + project breakdown table
    {
      id: "usage-bottom",
      columns: 2,
      widgets: [
        {
          id: "usage-top-users",
          title: "Top Users",
          chartType: "top_users",
          metrics: [],
          timeRange,
        },
        {
          id: "usage-project-breakdown",
          title: "Project Breakdown",
          chartType: "table",
          metrics: ["run_count", "active_users", "cost"],
          breakdownDimension: "project",
          timeRange,
        },
      ],
    },
  ];
}

export function UsagePage() {
  const [period, setPeriod] = useState<Period>("30d");
  const rows = makeUsageRows(period);

  return (
    <div className="space-y-6">
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
      <RowLayout rows={rows} globalPeriod={period} />
    </div>
  );
}
