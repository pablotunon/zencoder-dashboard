import { test, expect } from "@playwright/test";
import { browserTest } from "./auth.setup";

browserTest.describe("E2E-03: Dashboard Accessibility", () => {
  browserTest("root redirects to first seeded page", async ({ authedPage }) => {
    await authedPage.goto("/");
    await authedPage.waitForURL(/\/p\/overview/, { timeout: 15_000 });
    await expect(authedPage.getByRole("heading", { name: /overview/i })).toBeVisible({ timeout: 15_000 });
  });

  browserTest("overview page loads with charts and KPI cards", async ({ authedPage }) => {
    await authedPage.goto("/p/overview");
    await expect(authedPage.getByRole("heading", { name: /overview/i })).toBeVisible({ timeout: 15_000 });
    await expect(authedPage.getByRole("heading", { name: /total runs/i })).toBeVisible({ timeout: 15_000 });
  });

  browserTest("usage page loads with adoption data", async ({ authedPage }) => {
    await authedPage.goto("/p/usage-adoption");
    await expect(authedPage.getByRole("heading", { name: /usage & adoption/i })).toBeVisible({ timeout: 15_000 });
  });

  browserTest("cost page loads with cost data", async ({ authedPage }) => {
    await authedPage.goto("/p/cost-efficiency");
    await expect(authedPage.getByRole("heading", { name: /cost & efficiency/i })).toBeVisible({ timeout: 15_000 });
  });

  browserTest("performance page loads with reliability data", async ({ authedPage }) => {
    await authedPage.goto("/p/performance-reliability");
    await expect(authedPage.getByRole("heading", { name: /performance & reliability/i })).toBeVisible({ timeout: 15_000 });
  });

  browserTest("sidebar navigation works between pages", async ({ authedPage }) => {
    await authedPage.goto("/p/overview");
    await expect(authedPage.getByRole("heading", { name: /overview/i })).toBeVisible({ timeout: 15_000 });

    await authedPage.getByRole("link", { name: /usage/i }).click();
    await expect(authedPage.getByRole("heading", { name: /usage & adoption/i })).toBeVisible({ timeout: 15_000 });

    await authedPage.getByRole("link", { name: /cost/i }).click();
    await expect(authedPage.getByRole("heading", { name: /cost & efficiency/i })).toBeVisible({ timeout: 15_000 });

    await authedPage.getByRole("link", { name: /performance/i }).click();
    await expect(authedPage.getByRole("heading", { name: /performance & reliability/i })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("E2E-03: Frontend HTML", () => {
  test("frontend HTML references script modules", async ({ request }) => {
    const resp = await request.get("/");
    const html = await resp.text();
    expect(html).toMatch(/type="module"/);
    expect(html).toMatch(/src="[^"]*\.(js|ts|tsx)"/);
  });
});
