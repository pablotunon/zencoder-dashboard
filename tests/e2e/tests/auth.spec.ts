import { test as base, expect } from "@playwright/test";
import { test as authTest, browserTest } from "./auth.setup";

/**
 * E2E-04: Authentication & Authorization
 *
 * Verifies that:
 * 1. Unauthenticated API requests are rejected with 401.
 * 2. Authenticated API requests succeed for every protected endpoint.
 * 3. The widget POST endpoint (the one that broke) works after login.
 * 4. Browser-level login seeds the session so all charts load.
 */

/* ── API-level: unauthenticated requests get 401 ── */

base.describe("E2E-04a: Unauthenticated requests are rejected", () => {
  const protectedEndpoints = [
    { method: "GET" as const, path: "/api/metrics/overview?period=7d" },
    { method: "GET" as const, path: "/api/metrics/usage?period=7d" },
    { method: "GET" as const, path: "/api/metrics/cost?period=7d" },
    { method: "GET" as const, path: "/api/metrics/performance?period=7d" },
    { method: "GET" as const, path: "/api/orgs/current" },
    { method: "GET" as const, path: "/api/auth/me" },
    { method: "POST" as const, path: "/api/metrics/widget" },
  ];

  for (const { method, path } of protectedEndpoints) {
    base(`${method} ${path} returns 401 without token`, async ({ request }) => {
      const resp =
        method === "POST"
          ? await request.post(path, {
              data: { metric: "run_count", period: "7d" },
            })
          : await request.get(path);
      expect(resp.status()).toBe(401);
    });
  }
});

/* ── API-level: authenticated requests succeed ── */

authTest.describe("E2E-04b: Authenticated API requests succeed", () => {
  authTest(
    "GET /api/metrics/overview returns 200",
    async ({ authRequest }) => {
      const resp = await authRequest.get("/api/metrics/overview?period=7d");
      expect(resp.ok()).toBeTruthy();
    },
  );

  authTest("GET /api/metrics/usage returns 200", async ({ authRequest }) => {
    const resp = await authRequest.get("/api/metrics/usage?period=7d");
    expect(resp.ok()).toBeTruthy();
  });

  authTest("GET /api/metrics/cost returns 200", async ({ authRequest }) => {
    const resp = await authRequest.get("/api/metrics/cost?period=7d");
    expect(resp.ok()).toBeTruthy();
  });

  authTest(
    "GET /api/metrics/performance returns 200",
    async ({ authRequest }) => {
      const resp = await authRequest.get(
        "/api/metrics/performance?period=7d",
      );
      expect(resp.ok()).toBeTruthy();
    },
  );

  authTest("GET /api/orgs/current returns 200", async ({ authRequest }) => {
    const resp = await authRequest.get("/api/orgs/current");
    expect(resp.ok()).toBeTruthy();
  });

  authTest("GET /api/auth/me returns 200", async ({ authRequest }) => {
    const resp = await authRequest.get("/api/auth/me");
    expect(resp.ok()).toBeTruthy();
  });

  authTest(
    "POST /api/metrics/widget returns 200",
    async ({ authRequest }) => {
      const resp = await authRequest.post("/api/metrics/widget", {
        data: { metric: "run_count", period: "7d" },
      });
      expect(resp.ok()).toBeTruthy();
      const body = await resp.json();
      expect(body.type).toBe("timeseries");
    },
  );

  authTest(
    "POST /api/metrics/widget with breakdown returns 200",
    async ({ authRequest }) => {
      const resp = await authRequest.post("/api/metrics/widget", {
        data: { metric: "run_count", period: "7d", breakdown: "team" },
      });
      expect(resp.ok()).toBeTruthy();
      const body = await resp.json();
      expect(body.type).toBe("breakdown");
    },
  );
});

/* ── Browser-level: logged-in user sees charts, not errors ── */

browserTest.describe("E2E-04c: Dashboard loads after login", () => {
  browserTest(
    "dashboard page shows widget charts without errors",
    async ({ authedPage }) => {
      await authedPage.goto("/");

      // Wait for at least one chart or KPI to render
      await expect(
        authedPage.getByText(/total runs/i).or(authedPage.locator(".recharts-responsive-container").first()),
      ).toBeVisible({ timeout: 15_000 });

      // Verify no "Failed to load" error messages
      const errorMessages = authedPage.getByText(/failed to load/i);
      await expect(errorMessages).toHaveCount(0);
    },
  );

  browserTest(
    "no 401 network errors after login",
    async ({ authedPage }) => {
      const unauthorized: string[] = [];
      authedPage.on("response", (resp) => {
        if (resp.status() === 401 && resp.url().includes("/api/")) {
          unauthorized.push(resp.url());
        }
      });

      await authedPage.goto("/");
      // Wait for page to settle
      await authedPage.waitForTimeout(3000);

      expect(
        unauthorized,
        `Got 401 on: ${unauthorized.join(", ")}`,
      ).toHaveLength(0);
    },
  );
});
