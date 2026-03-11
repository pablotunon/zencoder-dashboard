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

/** Build ISO date-range query string for the last N days. */
function dateRangeQS(days: number): string {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return `start=${start.toISOString()}&end=${end.toISOString()}`;
}

/** Build ISO start/end body fields for the last N days. */
function dateRangeBody(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/* ── API-level: unauthenticated requests get 401 ── */

base.describe("E2E-04a: Unauthenticated requests are rejected", () => {
  const protectedEndpoints = [
    { method: "GET" as const, path: "/api/metrics/overview", withDateRange: true },
    { method: "GET" as const, path: "/api/metrics/usage", withDateRange: true },
    { method: "GET" as const, path: "/api/metrics/cost", withDateRange: true },
    { method: "GET" as const, path: "/api/metrics/performance", withDateRange: true },
    { method: "GET" as const, path: "/api/orgs/current", withDateRange: false },
    { method: "GET" as const, path: "/api/auth/me", withDateRange: false },
    { method: "POST" as const, path: "/api/metrics/widget", withDateRange: false },
  ];

  for (const { method, path, withDateRange } of protectedEndpoints) {
    base(`${method} ${path} returns 401 without token`, async ({ request }) => {
      const url = withDateRange ? `${path}?${dateRangeQS(7)}` : path;
      const resp =
        method === "POST"
          ? await request.post(url, {
              data: { metric: "run_count", ...dateRangeBody(7) },
            })
          : await request.get(url);
      expect(resp.status()).toBe(401);
    });
  }
});

/* ── API-level: authenticated requests succeed ── */

authTest.describe("E2E-04b: Authenticated API requests succeed", () => {
  authTest(
    "GET /api/metrics/overview returns 200",
    async ({ authRequest }) => {
      const resp = await authRequest.get(`/api/metrics/overview?${dateRangeQS(7)}`);
      expect(resp.ok()).toBeTruthy();
    },
  );

  authTest("GET /api/metrics/usage returns 200", async ({ authRequest }) => {
    const resp = await authRequest.get(`/api/metrics/usage?${dateRangeQS(7)}`);
    expect(resp.ok()).toBeTruthy();
  });

  authTest("GET /api/metrics/cost returns 200", async ({ authRequest }) => {
    const resp = await authRequest.get(`/api/metrics/cost?${dateRangeQS(7)}`);
    expect(resp.ok()).toBeTruthy();
  });

  authTest(
    "GET /api/metrics/performance returns 200",
    async ({ authRequest }) => {
      const resp = await authRequest.get(
        `/api/metrics/performance?${dateRangeQS(7)}`,
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
        data: { metric: "run_count", ...dateRangeBody(7) },
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
        data: { metric: "run_count", ...dateRangeBody(7), breakdown: "team" },
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
      // The authedPage fixture already navigated to /p/:slug
      // Verify we're on a page and content loaded
      await expect(authedPage).toHaveURL(/\/p\//);

      // Wait for the page heading to confirm the page rendered
      await expect(
        authedPage.locator("h1").first(),
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

      // Navigate to a page and wait for it to settle
      await authedPage.goto("/p/overview");
      await expect(
        authedPage.getByRole("heading", { name: /overview/i }),
      ).toBeVisible({ timeout: 15_000 });

      // Wait for any remaining API calls to complete
      await authedPage.waitForTimeout(3000);

      expect(
        unauthorized,
        `Got 401 on: ${unauthorized.join(", ")}`,
      ).toHaveLength(0);
    },
  );
});
