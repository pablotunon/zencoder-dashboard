import { useQuery } from "@tanstack/react-query";
import type { MetricFilters } from "@/types/api";
import type { DataSource, MetricId } from "@/types/widget";
import { METRIC_REGISTRY } from "@/lib/widget-registry";
import {
  fetchOverview,
  fetchUsage,
  fetchCost,
  fetchPerformance,
  fetchOrg,
} from "./client";

export function useOverviewMetrics(filters: MetricFilters) {
  return useQuery({
    queryKey: ["metrics", "overview", filters],
    queryFn: () => fetchOverview(filters),
    staleTime: 30_000,
  });
}

export function useUsageMetrics(filters: MetricFilters) {
  return useQuery({
    queryKey: ["metrics", "usage", filters],
    queryFn: () => fetchUsage(filters),
    staleTime: 5 * 60_000,
  });
}

export function useCostMetrics(
  filters: MetricFilters & { group_by?: string },
) {
  return useQuery({
    queryKey: ["metrics", "cost", filters],
    queryFn: () => fetchCost(filters),
    staleTime: 5 * 60_000,
  });
}

export function usePerformanceMetrics(filters: MetricFilters) {
  return useQuery({
    queryKey: ["metrics", "performance", filters],
    queryFn: () => fetchPerformance(filters),
    staleTime: 5 * 60_000,
  });
}

export function useOrg() {
  return useQuery({
    queryKey: ["org", "current"],
    queryFn: fetchOrg,
    staleTime: 10 * 60_000,
  });
}

// --- Widget data hook ---

const DATA_SOURCE_FETCHERS: Record<
  DataSource,
  (filters: MetricFilters) => Promise<Record<string, unknown>>
> = {
  overview: fetchOverview as (f: MetricFilters) => Promise<Record<string, unknown>>,
  usage: fetchUsage as (f: MetricFilters) => Promise<Record<string, unknown>>,
  cost: fetchCost as (f: MetricFilters) => Promise<Record<string, unknown>>,
  performance: fetchPerformance as (f: MetricFilters) => Promise<Record<string, unknown>>,
};

const METRIC_TO_RESPONSE_KEY: Record<MetricId, string> = {
  usage_trend: "usage_trend",
  active_users_trend: "active_users_trend",
  agent_type_breakdown: "agent_type_breakdown",
  cost_trend: "cost_trend",
  cost_per_run_trend: "cost_per_run_trend",
  cost_breakdown: "cost_breakdown",
  success_rate_trend: "success_rate_trend",
  latency_trend: "latency_trend",
  error_breakdown: "error_breakdown",
  queue_wait_trend: "queue_wait_trend",
};

/**
 * Generic hook that fetches data for any widget metric.
 * Reuses the existing endpoint fetchers and extracts the relevant slice.
 */
export function useWidgetData(metricId: MetricId, filters: MetricFilters) {
  const meta = METRIC_REGISTRY[metricId];
  const dataSource = meta.dataSource;
  const fetcher = DATA_SOURCE_FETCHERS[dataSource];
  const responseKey = METRIC_TO_RESPONSE_KEY[metricId];

  return useQuery({
    queryKey: ["metrics", dataSource, filters],
    queryFn: () => fetcher(filters),
    staleTime: dataSource === "overview" ? 30_000 : 5 * 60_000,
    select: (response) => response[responseKey] as Record<string, unknown>[],
  });
}
