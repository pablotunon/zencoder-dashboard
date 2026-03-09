import { useState } from "react";
import { useCostMetrics } from "@/api/hooks";
import { useFilters } from "@/hooks/useFilters";
import {
  CardSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { PartialDayTooltip } from "@/components/charts/PartialDayTooltip";

type GroupBy = "team" | "project" | "agent_type";

const costTrendConfig = {
  cost: { label: "Cost", color: "#10b981" },
} satisfies ChartConfig;

const costPerRunConfig = {
  avg_cost_per_run: { label: "Avg Cost/Run", color: "#8b5cf6" },
} satisfies ChartConfig;

const costBreakdownConfig = {
  Cost: { label: "Cost", color: "#10b981" },
} satisfies ChartConfig;

export function CostPage() {
  const { filters } = useFilters();
  const [groupBy, setGroupBy] = useState<GroupBy>("team");
  const { data, isLoading, error, refetch } = useCostMetrics({
    ...filters,
    group_by: groupBy,
  });

  if (error) {
    return <ErrorState message="Failed to load cost data" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">
        Cost & Efficiency
      </h1>

      {/* Budget Overview */}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cost Trend */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Cost Trend
            </h2>
            <ChartContainer config={costTrendConfig} className="h-64 w-full">
              <AreaChart data={data.cost_trend} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
                <Tooltip
                  content={(props) => (
                    <PartialDayTooltip
                      {...props}
                      config={costTrendConfig}
                      valueFormatter={formatCurrency}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--color-cost)"
                  fill="var(--color-cost)"
                  fillOpacity={0.15}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (!payload?.is_partial) return <circle key={`dot-${cx}`} r={0} />;
                    return (
                      <circle
                        key={`dot-${cx}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill="var(--color-cost)"
                        fillOpacity={0.4}
                        stroke="var(--color-cost)"
                        strokeOpacity={0.4}
                        strokeWidth={2}
                      />
                    );
                  }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : null}

        {/* Cost Per Run Trend */}
        {isLoading ? (
          <ChartSkeleton />
        ) : data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-medium text-gray-900">
              Cost Per Run
            </h2>
            <ChartContainer config={costPerRunConfig} className="h-64 w-full">
              <AreaChart data={data.cost_per_run_trend} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
                <Tooltip
                  content={(props) => (
                    <PartialDayTooltip
                      {...props}
                      config={costPerRunConfig}
                      valueFormatter={formatCurrency}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="avg_cost_per_run"
                  stroke="var(--color-avg_cost_per_run)"
                  fill="var(--color-avg_cost_per_run)"
                  fillOpacity={0.15}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (!payload?.is_partial) return <circle key={`dot-${cx}`} r={0} />;
                    return (
                      <circle
                        key={`dot-${cx}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill="var(--color-avg_cost_per_run)"
                        fillOpacity={0.4}
                        stroke="var(--color-avg_cost_per_run)"
                        strokeOpacity={0.4}
                        strokeWidth={2}
                      />
                    );
                  }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : null}
      </div>

      {/* Cost Breakdown */}
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

      {/* Token Breakdown */}
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
