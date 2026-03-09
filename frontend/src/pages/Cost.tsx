import { useState } from "react";
import { useCostMetrics } from "@/api/hooks";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import {
  CardSkeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { PERIOD_OPTIONS } from "@/lib/constants";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { Period } from "@/types/api";
import type { WidgetConfig } from "@/types/widget";

type GroupBy = "team" | "project" | "agent_type";

const costBreakdownConfig = {
  Cost: { label: "Cost", color: "#10b981" },
} satisfies ChartConfig;

// ── Template widgets ────────────────────────────────────────────────────────

function makeCostTemplate(period: Period): WidgetConfig[] {
  const timeRange = { useGlobal: false as const, period };
  return [
    {
      id: "cost-trend",
      title: "Cost Trend",
      chartType: "area",
      metric: "cost",
      timeRange,
    },
    {
      id: "cost-per-run-trend",
      title: "Cost Per Run",
      chartType: "line",
      metric: "cost_per_run",
      timeRange,
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function CostPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [groupBy, setGroupBy] = useState<GroupBy>("team");
  const { data, isLoading, error, refetch } = useCostMetrics({
    period,
    group_by: groupBy,
  });
  const template = makeCostTemplate(period);

  if (error) {
    return <ErrorState message="Failed to load cost data" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Budget Overview — custom (composite card with utilization bar) */}
      {isLoading ? (
        <CardSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Budget Utilization
              </p>
              <p className="mt-1 text-3xl font-semibold text-gray-900">
                {formatCurrency(data.budget.current_spend)}
              </p>
              {data.budget.monthly_budget && (
                <p className="mt-1 text-sm text-gray-500">
                  of {formatCurrency(data.budget.monthly_budget)} monthly
                  budget
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Projected</p>
              <p className="text-lg font-medium text-gray-700">
                {formatCurrency(data.budget.projected_spend)}
              </p>
            </div>
          </div>
          {data.budget.utilization_pct !== null && (
            <div className="mt-4">
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className={`h-2 rounded-full ${
                    data.budget.utilization_pct > 90
                      ? "bg-red-500"
                      : data.budget.utilization_pct > 75
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{
                    width: `${Math.min(data.budget.utilization_pct, 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {data.budget.utilization_pct.toFixed(1)}% utilized
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Cost Trend + Cost Per Run — template widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {template.map((widget) => (
          <WidgetRenderer
            key={widget.id}
            widget={widget}
            globalPeriod={period}
          />
        ))}
      </div>

      {/* Cost Breakdown — custom (group-by switcher) */}
      {isLoading ? (
        <TableSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium text-gray-900">
              Cost Breakdown
            </h2>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {(["team", "project", "agent_type"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    groupBy === g
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {g === "agent_type" ? "Agent Type" : g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <ChartContainer config={costBreakdownConfig} className="h-64 w-full">
            <BarChart
              data={data.cost_breakdown.map((item) => ({
                name: item.dimension_value,
                Cost: item.cost,
              }))}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
              <Tooltip
                content={(props) => {
                  const { active, payload, label } = props;
                  if (!active || !payload?.length || !payload[0]) return null;
                  return (
                    <div className="rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg">
                      <p className="mb-1 font-medium text-gray-900">{label}</p>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-600">Cost</span>
                        <span className="font-medium text-gray-900">
                          {formatCurrency(Number(payload[0].value))}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="Cost" fill="var(--color-Cost)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      ) : null}

      {/* Token Breakdown — custom (multi-section with model breakdown) */}
      {isLoading ? (
        <TableSkeleton />
      ) : data ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-medium text-gray-900">
            Token Usage
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Input Tokens</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatNumber(data.token_breakdown.input_tokens)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Output Tokens</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatNumber(data.token_breakdown.output_tokens)}
              </p>
            </div>
          </div>
          {data.token_breakdown.by_model.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="pb-3 font-medium">Model</th>
                    <th className="pb-3 font-medium text-right">
                      Input Tokens
                    </th>
                    <th className="pb-3 font-medium text-right">
                      Output Tokens
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.token_breakdown.by_model.map((model) => (
                    <tr key={model.model}>
                      <td className="py-3 font-medium text-gray-900">
                        {model.model}
                      </td>
                      <td className="py-3 text-right text-gray-600">
                        {formatNumber(model.input_tokens)}
                      </td>
                      <td className="py-3 text-right text-gray-600">
                        {formatNumber(model.output_tokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
