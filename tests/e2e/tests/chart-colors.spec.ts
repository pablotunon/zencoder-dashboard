import { expect } from "@playwright/test";
import { browserTest } from "./auth.setup";

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
browserTest.describe("Chart colors are not black", () => {
  browserTest("overview page chart gradient stops have color", async ({ authedPage }) => {
    await authedPage.goto("/p/overview");
    // Wait for page heading to confirm page loaded
    await expect(authedPage.locator("h1")).toBeVisible({ timeout: 15_000 });

    // Wait for chart to render
    const chart = authedPage.locator(".recharts-responsive-container").first();
    await expect(chart).toBeVisible({ timeout: 15_000 });

    const stopColors = await authedPage.evaluate(() => {
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

  browserTest("performance page charts have non-black gradient colors", async ({
    authedPage,
  }) => {
    await authedPage.goto("/p/performance-reliability");
    await expect(authedPage.locator("h1")).toBeVisible({ timeout: 15_000 });

    const chart = authedPage.locator(".recharts-responsive-container").first();
    await expect(chart).toBeVisible({ timeout: 15_000 });

    const colors = await authedPage.evaluate(() => {
      const result: { stopColors: string[]; strokeColors: string[] } = {
        stopColors: [],
        strokeColors: [],
      };

      const stops = document.querySelectorAll("linearGradient stop");
      for (const s of stops) {
        result.stopColors.push(getComputedStyle(s).stopColor);
      }

      const lines = document.querySelectorAll(".recharts-line-curve");
      for (const l of lines) {
        result.strokeColors.push(getComputedStyle(l).stroke);
      }

      return result;
    });

    expect(colors.stopColors.length + colors.strokeColors.length).toBeGreaterThan(0);

    for (const color of [...colors.stopColors, ...colors.strokeColors]) {
      expect(
        color,
        `Chart color is "${color}" — likely black due to purged Tailwind CSS`
      ).not.toMatch(/^rgb\(0,\s*0,\s*0\)$/);
    }
  });

  browserTest("cost page charts have non-black gradient colors", async ({ authedPage }) => {
    await authedPage.goto("/p/cost-efficiency");
    await expect(authedPage.locator("h1")).toBeVisible({ timeout: 15_000 });

    const chart = authedPage.locator(".recharts-responsive-container").first();
    await expect(chart).toBeVisible({ timeout: 15_000 });

    const stopColors = await authedPage.evaluate(() => {
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
