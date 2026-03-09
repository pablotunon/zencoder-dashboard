import { useState } from "react";
import { RowLayout } from "@/components/widgets/RowLayout";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Period } from "@/types/api";
import type { DashboardRow } from "@/types/widget";

function makePerformanceRows(period: Period): DashboardRow[] {
  const timeRange = { useGlobal: false as const, period };
  return [
    // Row 1: Success rate KPI (full width)
    {
      id: "perf-kpi",
      columns: 1,
      widgets: [
        {
          id: "perf-success-kpi",
          title: "Success Rate",
          chartType: "kpi",
          metrics: ["success_rate"],
          timeRange,
        },
      ],
    },
    // Row 2: Success/failure/error area + latency percentiles line
    {
      id: "perf-rates-latency",
      columns: 2,
      widgets: [
        {
          id: "perf-rate-trend",
          title: "Success / Failure / Error Rate",
          chartType: "area",
          metrics: ["success_rate", "failure_rate", "error_rate"],
          timeRange,
        },
        {
          id: "perf-latency-trend",
          title: "Latency Percentiles",
          chartType: "line",
          metrics: ["latency_p50", "latency_p95", "latency_p99"],
          timeRange,
        },
      ],
    },
    // Row 3: Error distribution pie + queue wait line
    {
      id: "perf-errors-queue",
      columns: 2,
      widgets: [
        {
          id: "perf-error-pie",
          title: "Error Distribution",
          chartType: "pie",
          metrics: ["error_rate"],
          breakdownDimension: "error_category",
          timeRange,
        },
        {
          id: "perf-queue-wait",
          title: "Queue Wait Time",
          chartType: "line",
          metrics: ["queue_wait_avg", "queue_wait_p95"],
          timeRange,
        },
      ],
    },
  ];
}

export function PerformancePage() {
  const [period, setPeriod] = useState<Period>("30d");
  const rows = makePerformanceRows(period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Performance & Reliability
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
