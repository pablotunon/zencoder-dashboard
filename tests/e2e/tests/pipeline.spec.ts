import { test, expect } from "@playwright/test";
import { test as authTest } from "./auth.setup";

const TEST_EVENTS = {
  events: [
    {
      run_id: "a2e00001-0000-4000-8000-000000e2e001",
      org_id: "org_acme",
      team_id: "team_platform",
      user_id: "user_001",
      project_id: "proj_001",
      agent_type: "coding",
      event_type: "run_started",
      timestamp: new Date().toISOString(),
    },
    {
      run_id: "a2e00001-0000-4000-8000-000000e2e001",
      org_id: "org_acme",
      team_id: "team_platform",
      user_id: "user_001",
      project_id: "proj_001",
      agent_type: "coding",
      event_type: "run_completed",
      timestamp: new Date().toISOString(),
      duration_ms: 15000,
      tokens_input: 5000,
      tokens_output: 2000,
      model: "claude-3",
      cost_usd: 0.05,
      tools_used: ["file_edit", "terminal"],
      queue_wait_ms: 200,
    },
  ],
};

test.describe("E2E-02: Write → Aggregate → Read Pipeline", () => {
  // Ingestion is not auth-protected — uses org_id in the payload
  test("ingestion accepts valid events", async ({ request }) => {
    const resp = await request.post("/ingest/events", { data: TEST_EVENTS });
    expect(resp.status()).toBe(202);

    const body = await resp.json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toBe(0);
  });

  // Read endpoints require auth
  authTest("overview endpoint returns data with KPIs", async ({ authRequest }) => {
    const resp = await authRequest.get("/api/metrics/overview?period=90d");
    expect(resp.ok()).toBeTruthy();

    const body = await resp.json();
    expect(body.kpi_cards).toBeDefined();
    expect(body.usage_trend).toBeDefined();
    expect(body.team_breakdown).toBeDefined();
    expect(body.kpi_cards.total_runs.value).toBeGreaterThan(0);
  });

  authTest("overview with team filter returns data", async ({ authRequest }) => {
    const resp = await authRequest.get("/api/metrics/overview?period=90d&teams=platform");
    expect(resp.ok()).toBeTruthy();

    const body = await resp.json();
    expect(body.kpi_cards).toBeDefined();
  });

  for (const endpoint of ["usage", "cost", "performance"]) {
    authTest(`GET /api/metrics/${endpoint}`, async ({ authRequest }) => {
      const resp = await authRequest.get(`/api/metrics/${endpoint}?period=90d`);
      expect(resp.ok()).toBeTruthy();
      const body = await resp.json();
      expect(Object.keys(body).length).toBeGreaterThan(0);
    });
  }

  authTest("org endpoint returns org with teams", async ({ authRequest }) => {
    const resp = await authRequest.get("/api/orgs/current");
    expect(resp.ok()).toBeTruthy();

    const body = await resp.json();
    expect(body.org_id).toBeDefined();
    expect(body.teams).toBeDefined();
    expect(body.teams.length).toBeGreaterThan(0);
  });
});
