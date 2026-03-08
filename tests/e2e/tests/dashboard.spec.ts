import { test, expect } from "@playwright/test";

test.describe("E2E-03: Dashboard Accessibility", () => {
  test("overview page loads with charts and KPI cards", async ({ page }) => {
    await page.goto("/");
    // Should show the Overview page by default
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
    // KPI cards should be present
    await expect(page.getByText(/total runs/i)).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: "Active Users" })).toBeVisible();
  });

  test("usage page loads with adoption rate and charts", async ({ page }) => {
    await page.goto("/usage");
    await expect(page.getByRole("heading", { name: /usage & adoption/i })).toBeVisible();
    await expect(page.getByText(/adoption rate/i)).toBeVisible();
    await expect(page.getByText(/agent type distribution/i)).toBeVisible();
  });

  test("cost page loads with cost data", async ({ page }) => {
    await page.goto("/cost");
    await expect(page.getByRole("heading", { name: /cost & efficiency/i })).toBeVisible();
  });

  test("performance page loads with reliability data", async ({ page }) => {
    await page.goto("/performance");
    await expect(page.getByRole("heading", { name: /performance & reliability/i })).toBeVisible();
  });

  test("sidebar navigation works between pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();

    await page.getByRole("link", { name: /usage/i }).click();
    await expect(page.getByRole("heading", { name: /usage & adoption/i })).toBeVisible();

    await page.getByRole("link", { name: /cost/i }).click();
    await expect(page.getByRole("heading", { name: /cost & efficiency/i })).toBeVisible();

    await page.getByRole("link", { name: /performance/i }).click();
    await expect(page.getByRole("heading", { name: /performance & reliability/i })).toBeVisible();
  });

  test("frontend HTML references script modules", async ({ request }) => {
    const resp = await request.get("/");
    const html = await resp.text();
    // Dev mode serves .ts/.tsx modules; prod serves .js bundles — both are valid
    expect(html).toMatch(/type="module"/);
    expect(html).toMatch(/src="[^"]*\.(js|ts|tsx)"/);
  });
});
