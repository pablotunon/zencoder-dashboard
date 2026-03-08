import type { MetricFilters } from "@/types/api";

const BASE_URL = "/api";

function buildQueryString(filters: MetricFilters): string {
  const params = new URLSearchParams();
  if (filters.period) params.set("period", filters.period);
  if (filters.teams?.length) params.set("teams", filters.teams.join(","));
  if (filters.projects?.length)
    params.set("projects", filters.projects.join(","));
  if (filters.agent_types?.length)
    params.set("agent_types", filters.agent_types.join(","));
  if (filters.group_by) params.set("group_by", filters.group_by);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchOverview(
  filters: MetricFilters,
): Promise<import("@/types/api").OverviewResponse> {
  return fetchJson(`${BASE_URL}/metrics/overview${buildQueryString(filters)}`);
}

export async function fetchUsage(
  filters: MetricFilters,
): Promise<import("@/types/api").UsageResponse> {
  return fetchJson(`${BASE_URL}/metrics/usage${buildQueryString(filters)}`);
}

export async function fetchCost(
  filters: MetricFilters,
): Promise<import("@/types/api").CostResponse> {
  return fetchJson(`${BASE_URL}/metrics/cost${buildQueryString(filters)}`);
}

export async function fetchPerformance(
  filters: MetricFilters,
): Promise<import("@/types/api").PerformanceResponse> {
  return fetchJson(
    `${BASE_URL}/metrics/performance${buildQueryString(filters)}`,
  );
}

export async function fetchOrg(): Promise<import("@/types/api").OrgResponse> {
  return fetchJson(`${BASE_URL}/orgs/current`);
}

export async function fetchHealth(): Promise<
  import("@/types/api").HealthResponse
> {
  return fetchJson(`${BASE_URL}/health`);
}
