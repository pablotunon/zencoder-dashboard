import { test, expect } from "@playwright/test";

/**
 * Regression test for the "black graphs" bug.
 *
 * Tremor chart components use Tailwind CSS utility classes (text-indigo-500,
 * stroke-emerald-500, etc.) for chart colors. Tailwind v4 purges these
 * because they are generated dynamically inside node_modules/@tremor/react.
 * Without the @source inline() safelist in index.css, all charts render
 * as black/gray because SVG gradient stops inherit `currentColor` from
 * a `text-*` class that was purged.
 *
 * This test verifies that chart gradient stops resolve to actual colors
 * (not black fallbacks).
 */
test.describe("Chart colors are not black", () => {
  test("overview page chart gradient stops have color", async ({ page }) => {
    await page.goto("/");

    // Wait for chart to render
    const chart = page.locator(".recharts-responsive-container").first();
    await expect(chart).toBeVisible({ timeout: 15_000 });

    // Tremor AreaChart uses <linearGradient> with class="text-{color}-500"
    // and <stop stop-color="currentColor">. If the text-* class is purged,
    // currentColor falls back to black.
    const stopColors = await page.evaluate(() => {
      const stops = document.querySelectorAll("linearGradient stop");
      return Array.from(stops).map((s) => getComputedStyle(s).stopColor);
    });

    expect(stopColors.length).toBeGreaterThan(0);
    for (const color of stopColors) {
      expect(
        color,
        `Gradient stop color is "${color}" — likely black due to purged Tailwind CSS`
      ).not.toMatch(/^rgb\(0,\s*0,\s*0\)$/);
    }
  });

  test("performance page charts have non-black gradient colors", async ({
    page,
  }) => {
    await page.goto("/performance");

    // Wait for at least one chart to render
    const chart = page.locator(".recharts-responsive-container").first();
    await expect(chart).toBeVisible({ timeout: 15_000 });

    // Collect all gradient stop colors and line stroke colors
    const colors = await page.evaluate(() => {
      const result: { stopColors: string[]; strokeColors: string[] } = {
        stopColors: [],
        strokeColors: [],
      };

      // Check gradient stops
      const stops = document.querySelectorAll("linearGradient stop");
      for (const s of stops) {
        result.stopColors.push(getComputedStyle(s).stopColor);
      }

      // Check line strokes (Tremor applies stroke-* classes to recharts groups)
      const lines = document.querySelectorAll(".recharts-line-curve");
      for (const l of lines) {
        result.strokeColors.push(getComputedStyle(l).stroke);
      }

      return result;
    });

    // At least some gradient stops should exist
    expect(colors.stopColors.length + colors.strokeColors.length).toBeGreaterThan(0);

    for (const color of [...colors.stopColors, ...colors.strokeColors]) {
      expect(
        color,
        `Chart color is "${color}" — likely black due to purged Tailwind CSS`
      ).not.toMatch(/^rgb\(0,\s*0,\s*0\)$/);
    }
  });

  test("cost page charts have non-black gradient colors", async ({ page }) => {
    await page.goto("/cost");

    const chart = page.locator(".recharts-responsive-container").first();
    await expect(chart).toBeVisible({ timeout: 15_000 });

    const stopColors = await page.evaluate(() => {
      const stops = document.querySelectorAll("linearGradient stop");
      return Array.from(stops).map((s) => getComputedStyle(s).stopColor);
    });

    expect(stopColors.length).toBeGreaterThan(0);
    for (const color of stopColors) {
      expect(
        color,
        `Gradient stop color is "${color}" — likely black due to purged Tailwind CSS`
      ).not.toMatch(/^rgb\(0,\s*0,\s*0\)$/);
    }
  });
});
