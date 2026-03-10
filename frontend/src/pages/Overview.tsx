import { useState } from "react";
import { RowLayout } from "@/components/widgets/RowLayout";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Period } from "@/types/api";
import type { DashboardRow } from "@/types/widget";

function makeOverviewRows(period: Period): DashboardRow[] {
  const timeRange = { useGlobal: false as const, period };
  return [
    // Row 1: 4 KPI cards
    {
      id: "overview-kpis",
      columns: 4,
      widgets: [
        {
          id: "overview-kpi-runs",
          title: "Total Runs",
          chartType: "kpi",
          metrics: ["run_count"],
          timeRange,
        },
        {
          id: "overview-kpi-users",
          title: "Active Users",
          chartType: "kpi",
          metrics: ["active_users"],
          timeRange,
        },
        {
          id: "overview-kpi-cost",
          title: "Total Cost",
          chartType: "kpi",
          metrics: ["cost"],
          timeRange,
        },
        {
          id: "overview-kpi-success",
          title: "Success Rate",
          chartType: "kpi",
          metrics: ["success_rate"],
          timeRange,
        },
      ],
    },
    // Row 2: Usage trend (full width area chart)
    {
      id: "overview-trend",
      columns: 1,
      widgets: [
        {
          id: "overview-usage-trend",
          title: "Usage Trend",
          chartType: "area",
          metrics: ["run_count"],
          timeRange,
        },
      ],
    },
    // Row 3: Team breakdown (multi-metric table)
    {
      id: "overview-team",
      columns: 1,
      widgets: [
        {
          id: "overview-team-breakdown",
          title: "Team Breakdown",
          chartType: "table",
          metrics: ["run_count", "active_users", "cost", "success_rate"],
          breakdownDimension: "team",
          timeRange,
        },
      ],
    },
  ];
}

export function OverviewPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const rows = makeOverviewRows(period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Overview</h1>
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
