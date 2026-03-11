import { expect } from "@playwright/test";
import { test as authTest, browserTest } from "./auth.setup";

/**
 * E2E-05: Custom Pages
 *
 * Verifies the full custom pages feature:
 * 1. Seeded pages appear in sidebar after login
 * 2. Pages API CRUD operations work
 * 3. Page creation modal flow
 * 4. Page navigation via sidebar
 * 5. Page deletion
 * 6. Layout persistence
 */

/* ── API-level: pages CRUD ── */

authTest.describe("E2E-05a: Pages API", () => {
  authTest("GET /api/pages returns seeded pages", async ({ authRequest }) => {
    const resp = await authRequest.get("/api/pages");
    expect(resp.ok()).toBeTruthy();

    const pages = await resp.json();
    expect(pages.length).toBeGreaterThanOrEqual(4);

    const slugs = pages.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain("overview");
    expect(slugs).toContain("usage-adoption");
    expect(slugs).toContain("cost-efficiency");
    expect(slugs).toContain("performance-reliability");
  });

  authTest(
    "GET /api/pages/templates returns 4 templates",
    async ({ authRequest }) => {
      const resp = await authRequest.get("/api/pages/templates");
      expect(resp.ok()).toBeTruthy();

      const templates = await resp.json();
      expect(templates).toHaveLength(4);
      for (const t of templates) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.icon).toBeTruthy();
        expect(t.description).toBeTruthy();
      }
    },
  );

  authTest(
    "POST /api/pages creates a blank page",
    async ({ authRequest }) => {
      const resp = await authRequest.post("/api/pages", {
        data: { name: "E2E Test Page", icon: "star" },
      });
      expect(resp.ok()).toBeTruthy();

      const page = await resp.json();
      expect(page.name).toBe("E2E Test Page");
      expect(page.slug).toBe("e2e-test-page");
      expect(page.icon).toBe("star");
      expect(page.layout).toEqual([]);

      // Cleanup
      const del = await authRequest.delete(`/api/pages/${page.slug}`);
      expect(del.status()).toBe(204);
    },
  );

  authTest(
    "POST /api/pages creates page from template",
    async ({ authRequest }) => {
      const resp = await authRequest.post("/api/pages", {
        data: { name: "From Template", icon: "chart-bar", template: "overview" },
      });
      expect(resp.ok()).toBeTruthy();

      const page = await resp.json();
      expect(page.name).toBe("From Template");
      expect(page.layout.length).toBeGreaterThan(0);

      // Cleanup
      await authRequest.delete(`/api/pages/${page.slug}`);
    },
  );

  authTest(
    "PUT /api/pages/:slug updates page name",
    async ({ authRequest }) => {
      // Create
      const create = await authRequest.post("/api/pages", {
        data: { name: "Before Rename", icon: "bolt" },
      });
      const created = await create.json();

      // Update
      const resp = await authRequest.put(`/api/pages/${created.slug}`, {
        data: { name: "After Rename" },
      });
      expect(resp.ok()).toBeTruthy();

      const updated = await resp.json();
      expect(updated.name).toBe("After Rename");
      expect(updated.slug).toBe("after-rename");

      // Cleanup
      await authRequest.delete(`/api/pages/${updated.slug}`);
    },
  );

  authTest(
    "DELETE /api/pages/:slug removes the page",
    async ({ authRequest }) => {
      // Create
      const create = await authRequest.post("/api/pages", {
        data: { name: "To Delete", icon: "star" },
      });
      const page = await create.json();

      // Delete
      const resp = await authRequest.delete(`/api/pages/${page.slug}`);
      expect(resp.status()).toBe(204);

      // Verify gone
      const check = await authRequest.get(`/api/pages/${page.slug}`);
      expect(check.status()).toBe(404);
    },
  );

  authTest(
    "GET /api/pages/:slug returns page with layout",
    async ({ authRequest }) => {
      const resp = await authRequest.get("/api/pages/overview");
      expect(resp.ok()).toBeTruthy();

      const page = await resp.json();
      expect(page.name).toBe("Overview");
      expect(page.slug).toBe("overview");
      expect(page.layout).toBeDefined();
      expect(page.layout.length).toBeGreaterThan(0);
    },
  );

  authTest(
    "GET /api/pages returns 401 without auth",
    async ({ playwright }) => {
      const ctx = await playwright.request.newContext({
        baseURL: process.env.BASE_URL ?? "http://localhost:8080",
      });
      const resp = await ctx.get("/api/pages");
      expect(resp.status()).toBe(401);
      await ctx.dispose();
    },
  );
});

/* ── Browser-level: page navigation and sidebar ── */

browserTest.describe("E2E-05b: Custom Pages UI", () => {
  browserTest(
    "seeded pages appear in sidebar",
    async ({ authedPage }) => {
      // authedPage already navigated to /p/... via the fixture
      // Ensure the sidebar loaded with page links
      await expect(authedPage.getByRole("link", { name: /overview/i })).toBeVisible({ timeout: 15_000 });
      await expect(authedPage.getByRole("link", { name: /usage/i })).toBeVisible();
      await expect(authedPage.getByRole("link", { name: /cost/i })).toBeVisible();
      await expect(authedPage.getByRole("link", { name: /performance/i })).toBeVisible();

      // "New Page" button should be visible
      await expect(authedPage.getByRole("button", { name: /new page/i })).toBeVisible();
    },
  );

  browserTest(
    "create new page via modal",
    async ({ authedPage }) => {
      const baseURL = process.env.BASE_URL ?? "http://localhost:8080";
      const token = await authedPage.evaluate(() =>
        localStorage.getItem("agenthub_token"),
      );

      // Cleanup any leftover test pages from previous runs
      const existing = await authedPage.request.get(`${baseURL}/api/pages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pages = await existing.json();
      for (const p of pages) {
        if (/my-test-page/.test(p.slug)) {
          await authedPage.request.delete(`${baseURL}/api/pages/${p.slug}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }

      // Reload so sidebar reflects the cleanup
      await authedPage.goto("/p/overview");
      await expect(authedPage.getByRole("button", { name: /new page/i })).toBeVisible({ timeout: 15_000 });

      // Open create modal
      await authedPage.getByRole("button", { name: /new page/i }).click();

      // Modal should be visible
      await expect(authedPage.getByRole("heading", { name: /new page/i })).toBeVisible();

      // Fill in the name
      await authedPage.getByPlaceholder(/e\.g\./i).fill("My Test Page");

      // Click Create
      await authedPage.getByRole("button", { name: /create page/i }).click();

      // Should navigate to the new page
      await authedPage.waitForURL(/\/p\/my-test-page/, { timeout: 15_000 });

      // Wait for the page heading to appear (API fetch + render)
      await expect(
        authedPage.getByRole("heading", { name: /my test page/i }),
      ).toBeVisible({ timeout: 15_000 });

      // New page should appear in sidebar
      await expect(authedPage.getByRole("link", { name: /my test page/i })).toBeVisible();

      // Cleanup
      await authedPage.request.delete(`${baseURL}/api/pages/my-test-page`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  );

  browserTest(
    "navigate between pages via sidebar",
    async ({ authedPage }) => {
      await authedPage.goto("/p/overview");

      // Wait for page content to load from API
      await expect(
        authedPage.getByRole("heading", { name: /overview/i }),
      ).toBeVisible({ timeout: 15_000 });

      // Click on usage page in sidebar
      await authedPage.getByRole("link", { name: /usage/i }).click();
      await authedPage.waitForURL(/\/p\/usage-adoption/);
      await expect(
        authedPage.getByRole("heading", { name: /usage & adoption/i }),
      ).toBeVisible({ timeout: 15_000 });

      // Click on cost page
      await authedPage.getByRole("link", { name: /cost/i }).click();
      await authedPage.waitForURL(/\/p\/cost-efficiency/);
      await expect(
        authedPage.getByRole("heading", { name: /cost & efficiency/i }),
      ).toBeVisible({ timeout: 15_000 });
    },
  );

  browserTest(
    "page shows empty state for blank page",
    async ({ authedPage }) => {
      // Create a blank page via API
      const baseURL = process.env.BASE_URL ?? "http://localhost:8080";
      const token = await authedPage.evaluate(() =>
        localStorage.getItem("agenthub_token"),
      );

      const resp = await authedPage.request.post(`${baseURL}/api/pages`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { name: "Blank Page Test", icon: "star" },
      });
      const page = await resp.json();

      // Navigate to it
      await authedPage.goto(`/p/${page.slug}`);
      await expect(authedPage.getByText(/no rows yet/i)).toBeVisible({ timeout: 15_000 });

      // Cleanup
      await authedPage.request.delete(`${baseURL}/api/pages/${page.slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  );

  browserTest(
    "delete page from sidebar",
    async ({ authedPage }) => {
      // Create a page to delete via API
      const baseURL = process.env.BASE_URL ?? "http://localhost:8080";
      const token = await authedPage.evaluate(() =>
        localStorage.getItem("agenthub_token"),
      );

      await authedPage.request.post(`${baseURL}/api/pages`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { name: "Delete Me", icon: "star" },
      });

      // Navigate to the page
      await authedPage.goto("/p/delete-me");
      await expect(
        authedPage.getByRole("heading", { name: /delete me/i }),
      ).toBeVisible({ timeout: 15_000 });

      // Find the sidebar link and hover to reveal delete button
      const pageLink = authedPage.getByRole("link", { name: /delete me/i });
      await pageLink.hover();

      // Click the trash icon
      const pageRow = pageLink.locator("..");
      await pageRow.getByTitle("Delete page").click();

      // Confirm deletion
      await pageRow.getByRole("button", { name: /^delete$/i }).click();

      // Page should be removed from sidebar
      await expect(
        authedPage.getByRole("link", { name: /delete me/i }),
      ).toHaveCount(0, { timeout: 10_000 });
    },
  );

  browserTest(
    "old routes redirect to first page",
    async ({ authedPage }) => {
      await authedPage.goto("/overview");
      // /overview is unknown → catches with * → redirects to / → redirects to /p/overview
      await authedPage.waitForURL(/\/p\//, { timeout: 15_000 });
    },
  );

  browserTest(
    "non-existent page shows error state",
    async ({ authedPage }) => {
      await authedPage.goto("/p/this-page-does-not-exist");
      // React Query retries 2 times with backoff, so the error state
      // takes several seconds to appear
      await expect(
        authedPage.getByText(/page not found/i),
      ).toBeVisible({ timeout: 30_000 });
    },
  );
});
