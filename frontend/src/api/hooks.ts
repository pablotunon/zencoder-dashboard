import { useQuery } from "@tanstack/react-query";
import type { MetricFilters } from "@/types/api";
import { fetchUsage, fetchOrg } from "./client";

export function useUsageMetrics(filters: MetricFilters) {
  return useQuery({
    queryKey: ["metrics", "usage", filters],
    queryFn: () => fetchUsage(filters),
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
