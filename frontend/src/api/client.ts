import type { MetricFilters } from "@/types/api";
import type { AuthUser, AuthOrg } from "@/types/auth";

const BASE_URL = "/api";

let _token: string | null = null;
let _onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  _token = token;
}

export function getAuthToken(): string | null {
  return _token;
}

export function setOnUnauthorized(callback: (() => void) | null): void {
  _onUnauthorized = callback;
}

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

function authHeaders(): Record<string, string> {
  if (_token) {
    return { Authorization: `Bearer ${_token}` };
  }
  return {};
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401) {
    _onUnauthorized?.();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- Auth API ---

export interface LoginResponse {
  token: string;
  user: AuthUser;
  org: AuthOrg;
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Invalid email or password");
  }
  return res.json() as Promise<LoginResponse>;
}

export async function apiLogout(): Promise<void> {
  await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  }).catch(() => {});
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
