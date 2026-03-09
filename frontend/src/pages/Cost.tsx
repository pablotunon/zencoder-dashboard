import { useState } from "react";
import { RowLayout } from "@/components/widgets/RowLayout";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Period } from "@/types/api";
import type { DashboardRow } from "@/types/widget";

function makeCostRows(period: Period): DashboardRow[] {
  const timeRange = { useGlobal: false as const, period };
  return [
    // Row 1: Budget gauge (full width)
    {
      id: "cost-budget",
      columns: 1,
      widgets: [
        {
          id: "cost-budget-gauge",
          title: "Budget Utilization",
          chartType: "gauge",
          metrics: ["cost"],
          orgMetric: "monthly_budget",
          timeRange,
        },
      ],
    },
    // Row 2: Cost trend + cost per run
    {
      id: "cost-trends",
      columns: 2,
      widgets: [
        {
          id: "cost-trend",
          title: "Cost Trend",
          chartType: "area",
          metrics: ["cost"],
          timeRange,
        },
        {
          id: "cost-per-run-trend",
          title: "Cost Per Run",
          chartType: "line",
          metrics: ["cost_per_run"],
          timeRange,
        },
      ],
    },
    // Row 3: Cost breakdown — 3 bar charts, one per dimension
    {
      id: "cost-breakdowns",
      columns: 3,
      widgets: [
        {
          id: "cost-by-team",
          title: "Cost by Team",
          chartType: "bar",
          metrics: ["cost"],
          breakdownDimension: "team",
          timeRange,
        },
        {
          id: "cost-by-project",
          title: "Cost by Project",
          chartType: "bar",
          metrics: ["cost"],
          breakdownDimension: "project",
          timeRange,
        },
        {
          id: "cost-by-agent-type",
          title: "Cost by Agent Type",
          chartType: "bar",
          metrics: ["cost"],
          breakdownDimension: "agent_type",
          timeRange,
        },
      ],
    },
    // Row 4: Token usage table (multi-metric by model)
    {
      id: "cost-tokens",
      columns: 1,
      widgets: [
        {
          id: "cost-token-table",
          title: "Token Usage by Model",
          chartType: "table",
          metrics: ["tokens_input", "tokens_output"],
          breakdownDimension: "model",
          timeRange,
        },
      ],
    },
  ];
}

export function CostPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const rows = makeCostRows(period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Cost & Efficiency
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
