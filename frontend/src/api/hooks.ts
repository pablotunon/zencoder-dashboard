import { useQuery } from "@tanstack/react-query";
import type { MetricFilters } from "@/types/api";
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
