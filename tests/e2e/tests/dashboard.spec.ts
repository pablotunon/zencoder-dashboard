import { test, expect } from "@playwright/test";
import { browserTest } from "./auth.setup";

browserTest.describe("E2E-03: Dashboard Accessibility", () => {
  browserTest("overview page loads with charts and KPI cards", async ({ authedPage }) => {
    await authedPage.goto("/");
    await expect(authedPage.getByRole("heading", { name: /overview/i })).toBeVisible();
    await expect(authedPage.getByText(/total runs/i)).toBeVisible();
    await expect(authedPage.getByRole("paragraph").filter({ hasText: "Active Users" })).toBeVisible();
  });

  browserTest("usage page loads with adoption rate and charts", async ({ authedPage }) => {
    await authedPage.goto("/usage");
    await expect(authedPage.getByRole("heading", { name: /usage & adoption/i })).toBeVisible();
    await expect(authedPage.getByText(/adoption rate/i)).toBeVisible();
    await expect(authedPage.getByText(/agent type distribution/i)).toBeVisible();
  });

  browserTest("cost page loads with cost data", async ({ authedPage }) => {
    await authedPage.goto("/cost");
    await expect(authedPage.getByRole("heading", { name: /cost & efficiency/i })).toBeVisible();
  });

  browserTest("performance page loads with reliability data", async ({ authedPage }) => {
    await authedPage.goto("/performance");
    await expect(authedPage.getByRole("heading", { name: /performance & reliability/i })).toBeVisible();
  });

  browserTest("sidebar navigation works between pages", async ({ authedPage }) => {
    await authedPage.goto("/");
    await expect(authedPage.getByRole("heading", { name: /overview/i })).toBeVisible();

    await authedPage.getByRole("link", { name: /usage/i }).click();
    await expect(authedPage.getByRole("heading", { name: /usage & adoption/i })).toBeVisible();

    await authedPage.getByRole("link", { name: /cost/i }).click();
    await expect(authedPage.getByRole("heading", { name: /cost & efficiency/i })).toBeVisible();

    await authedPage.getByRole("link", { name: /performance/i }).click();
    await expect(authedPage.getByRole("heading", { name: /performance & reliability/i })).toBeVisible();
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
