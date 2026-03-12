import type { MetricFilters } from "@/types/api";
import type { AuthUser, AuthOrg } from "@/types/auth";

const BASE_URL = "/api";

let _token: string | null = null;
let _refreshToken: string | null = null;
let _onUnauthorized: (() => void) | null = null;
let _onTokenRefreshed: ((token: string, refreshToken: string) => void) | null =
  null;
let _refreshPromise: Promise<boolean> | null = null;

export function setAuthToken(token: string | null): void {
  _token = token;
}

export function setRefreshToken(token: string | null): void {
  _refreshToken = token;
}

export function setOnUnauthorized(callback: (() => void) | null): void {
  _onUnauthorized = callback;
}

export function setOnTokenRefreshed(
  callback: ((token: string, refreshToken: string) => void) | null,
): void {
  _onTokenRefreshed = callback;
}

function buildQueryString(filters: MetricFilters): string {
  const params = new URLSearchParams();
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
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

async function tryRefreshToken(): Promise<boolean> {
  if (!_refreshToken) return false;

  // Deduplicate concurrent refresh attempts
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: _refreshToken }),
      });
      if (!res.ok) return false;

      const body = (await res.json()) as {
        token: string;
        refresh_token: string;
      };
      _token = body.token;
      _refreshToken = body.refresh_token;
      _onTokenRefreshed?.(body.token, body.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    // Attempt a silent token refresh before giving up
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry the original request with the new token
      const retryHeaders = { ...(init?.headers ?? {}), ...authHeaders() };
      const retry = await fetch(url, { ...init, headers: retryHeaders });
      if (retry.ok) return retry;
    }
    _onUnauthorized?.();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await request(url, { headers: authHeaders() });
  return res.json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export async function deleteJson(url: string): Promise<void> {
  await request(url, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

// --- Auth API ---

interface LoginResponse {
  token: string;
  refresh_token: string;
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

export async function apiGetMe(): Promise<AuthUser> {
  return fetchJson(`${BASE_URL}/auth/me`);
}

export async function fetchUsage(
  filters: MetricFilters,
): Promise<import("@/types/api").UsageResponse> {
  return fetchJson(`${BASE_URL}/metrics/usage${buildQueryString(filters)}`);
}

export async function fetchOrg(): Promise<import("@/types/api").OrgResponse> {
  return fetchJson(`${BASE_URL}/orgs/current`);
}
