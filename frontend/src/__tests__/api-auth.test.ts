import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./msw-server";
import {
  setAuthToken,
  fetchUsage,
  fetchOrg,
  apiGetMe,
  apiLogout,
} from "@/api/client";
import { postWidgetQuery, postBatchWidgetQuery } from "@/api/widget";

const TEST_TOKEN = "test-jwt-token-abc123";

// Minimal valid response stubs — just enough to avoid parse errors.
const STUB_OVERVIEW = { kpi_cards: {}, usage_trend: [], team_breakdown: [] };
const STUB_USAGE = {
  adoption_rate: { value: 0, licensed_users: 0, active_users: 0 },
  active_users_trend: [],
  agent_type_breakdown: [],
  top_users: [],
  project_breakdown: [],
};
const STUB_COST = {
  cost_trend: [],
  cost_breakdown: [],
  cost_per_run_trend: [],
  token_breakdown: { input_tokens: 0, output_tokens: 0, by_model: [] },
  budget: { monthly_budget: null, current_spend: 0, projected_spend: 0, utilization_pct: null },
};
const STUB_PERFORMANCE = {
  success_rate_trend: [],
  latency_trend: [],
  error_breakdown: [],
  availability: { uptime_pct: 100, period: "7d" },
  queue_wait_trend: [],
};
const STUB_ORG = { org_id: "org_test", name: "Test Org" };
const STUB_USER = { id: "u1", email: "test@test.com", name: "Test", role: "admin" };
const STUB_WIDGET_TS = {
  type: "timeseries",
  metric: "total_runs",
  summary: { value: 100, change_pct: 5 },
  data: [{ timestamp: "2025-01-01T00:00:00", value: 10, is_partial: false }],
};

/**
 * For each protected endpoint, register an MSW handler that:
 * 1. Asserts the Authorization header is present and correct.
 * 2. Returns a valid stub response.
 *
 * If the Authorization header is missing, respond with 401 — exactly
 * what the real backend does. This way the test fails with a clear
 * "Unauthorized" error if auth is ever dropped.
 */
function registerAuthAssertingHandlers() {
  const assertAuth = (request: Request) => {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${TEST_TOKEN}`) {
      return HttpResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }
    return null; // header OK
  };

  server.use(
    http.get("*/api/metrics/overview*", ({ request }) => {
      return assertAuth(request) ?? HttpResponse.json(STUB_OVERVIEW);
    }),
    http.get("*/api/metrics/usage*", ({ request }) => {
      return assertAuth(request) ?? HttpResponse.json(STUB_USAGE);
    }),
    http.get("*/api/metrics/cost*", ({ request }) => {
      return assertAuth(request) ?? HttpResponse.json(STUB_COST);
    }),
    http.get("*/api/metrics/performance*", ({ request }) => {
      return assertAuth(request) ?? HttpResponse.json(STUB_PERFORMANCE);
    }),
    http.get("*/api/orgs/current", ({ request }) => {
      return assertAuth(request) ?? HttpResponse.json(STUB_ORG);
    }),
    http.get("*/api/auth/me", ({ request }) => {
      return assertAuth(request) ?? HttpResponse.json(STUB_USER);
    }),
    http.post("*/api/auth/logout", ({ request }) => {
      // Logout is fire-and-forget; just check the header arrives.
      return assertAuth(request) ?? HttpResponse.json({ ok: true });
    }),
    http.post("*/api/metrics/widget", ({ request }) => {
      return assertAuth(request) ?? HttpResponse.json(STUB_WIDGET_TS);
    }),
    http.post("*/api/metrics/widget/batch", ({ request }) => {
      return assertAuth(request) ?? HttpResponse.json({
        results: { run_count: STUB_WIDGET_TS, cost: STUB_WIDGET_TS },
      });
    }),
  );
}

describe("API auth headers", () => {
  beforeEach(() => {
    setAuthToken(TEST_TOKEN);
    registerAuthAssertingHandlers();
  });

  it("fetchUsage sends Authorization header", async () => {
    await expect(fetchUsage({ start: "2025-01-01T00:00:00Z", end: "2025-01-08T00:00:00Z" })).resolves.toBeDefined();
  });

  it("fetchOrg sends Authorization header", async () => {
    await expect(fetchOrg()).resolves.toBeDefined();
  });

  it("apiGetMe sends Authorization header", async () => {
    await expect(apiGetMe()).resolves.toBeDefined();
  });

  it("apiLogout sends Authorization header", async () => {
    await expect(apiLogout()).resolves.toBeUndefined();
  });

  it("postWidgetQuery sends Authorization header", async () => {
    await expect(
      postWidgetQuery({ metric: "total_runs", start: "2025-01-01T00:00:00Z", end: "2025-01-08T00:00:00Z" }),
    ).resolves.toBeDefined();
  });

  it("postWidgetQuery with breakdown sends Authorization header", async () => {
    await expect(
      postWidgetQuery({ metric: "total_runs", start: "2025-01-01T00:00:00Z", end: "2025-01-31T00:00:00Z", breakdown: "team" }),
    ).resolves.toBeDefined();
  });

  it("postBatchWidgetQuery sends Authorization header", async () => {
    await expect(
      postBatchWidgetQuery({ metrics: ["run_count", "cost"], start: "2025-01-01T00:00:00Z", end: "2025-01-08T00:00:00Z" }),
    ).resolves.toBeDefined();
  });
});

describe("API without token returns 401", () => {
  beforeEach(() => {
    setAuthToken(null);
    registerAuthAssertingHandlers();
  });

  it("postWidgetQuery rejects when no token is set", async () => {
    await expect(
      postWidgetQuery({ metric: "total_runs", start: "2025-01-01T00:00:00Z", end: "2025-01-08T00:00:00Z" }),
    ).rejects.toThrow("Unauthorized");
  });

  it("postBatchWidgetQuery rejects when no token is set", async () => {
    await expect(
      postBatchWidgetQuery({ metrics: ["run_count", "cost"], start: "2025-01-01T00:00:00Z", end: "2025-01-08T00:00:00Z" }),
    ).rejects.toThrow("Unauthorized");
  });
});
