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
import { useMemo } from "react";
import { AreaChart, BarChart } from "@tremor/react";
import { PartialDayTooltip } from "@/components/charts/PartialDayTooltip";
import { splitPartialData } from "@/components/charts/splitPartialData";

type GroupBy = "team" | "project" | "agent_type";

export function CostPage() {
  const { filters } = useFilters();
  const [groupBy, setGroupBy] = useState<GroupBy>("team");
  const { data, isLoading, error, refetch } = useCostMetrics({
    ...filters,
    group_by: groupBy,
  });

  const costTrend = useMemo(
    () => data ? splitPartialData(data.cost_trend, ["cost"], ["emerald"], ["gray"]) : null,
    [data],
  );
  const costPerRunTrend = useMemo(
    () => data ? splitPartialData(data.cost_per_run_trend, ["avg_cost_per_run"], ["violet"], ["gray"]) : null,
    [data],
  );

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
            <AreaChart
              className="h-64"
              data={costTrend!.data}
              index="date"
              categories={costTrend!.categories}
              colors={costTrend!.colors}
              connectNulls
              showLegend={false}
              valueFormatter={formatCurrency}
              showAnimation
              customTooltip={(props) => (
                <PartialDayTooltip {...props} valueFormatter={formatCurrency} />
              )}
            />
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
            <AreaChart
              className="h-64"
              data={costPerRunTrend!.data}
              index="date"
              categories={costPerRunTrend!.categories}
              colors={costPerRunTrend!.colors}
              connectNulls
              showLegend={false}
              valueFormatter={formatCurrency}
              showAnimation
              customTooltip={(props) => (
                <PartialDayTooltip {...props} valueFormatter={formatCurrency} />
              )}
            />
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
          <BarChart
            className="h-64"
            data={data.cost_breakdown.map((item) => ({
              name: item.dimension_value,
              Cost: item.cost,
              Runs: item.runs,
            }))}
            index="name"
            categories={["Cost"]}
            colors={["emerald"]}
            valueFormatter={formatCurrency}
            showAnimation
          />
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
