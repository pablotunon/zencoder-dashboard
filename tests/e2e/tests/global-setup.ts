import { request } from "@playwright/test";

/**
 * Global setup: warm up the Vite dev server so first browser tests
 * don't time out waiting for module compilation.
 */
async function globalSetup() {
  const baseURL = process.env.BASE_URL ?? "http://localhost:8080";

  // 1. Warm up the frontend — triggers Vite module compilation
  const ctx = await request.newContext({ baseURL });
  try {
    const resp = await ctx.get("/");
    if (!resp.ok()) {
      console.warn(`[global-setup] Frontend warmup returned ${resp.status()}`);
    } else {
      // Fetch the main JS module referenced in the HTML to trigger compilation
      const html = await resp.text();
      const srcMatch = html.match(/src="([^"]*\.(js|ts|tsx))"/);
      if (srcMatch) {
        await ctx.get(srcMatch[1]).catch(() => {});
      }
    }
  } catch (e) {
    console.warn(`[global-setup] Frontend warmup failed:`, e);
  }

  // 2. Wait for the API to be reachable through nginx.
  //    In CI the analytics-api may become temporarily unavailable (502)
  //    during heavy data seeding. Retry until it responds or we time out.
  const maxAttempts = 30;
  const intervalMs = 2_000;
  let apiReady = false;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const healthResp = await ctx.get("/api/health");
      if (healthResp.ok()) {
        apiReady = true;
        console.log(`[global-setup] API healthy (attempt ${i}/${maxAttempts})`);
        break;
      }
      console.warn(
        `[global-setup] API returned ${healthResp.status()} (attempt ${i}/${maxAttempts})`,
      );
    } catch (err) {
      console.warn(
        `[global-setup] API unreachable (attempt ${i}/${maxAttempts}):`,
        (err as Error).message,
      );
    }
    if (i < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  if (!apiReady) {
    throw new Error(
      `[global-setup] API did not become healthy after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s). Aborting tests.`,
    );
  }

  await ctx.dispose();
}

export default globalSetup;
