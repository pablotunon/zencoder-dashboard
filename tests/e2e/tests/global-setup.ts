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

  // 2. Warm up the API — first request may be slow
  try {
    await ctx.get("/api/health");
  } catch {
    // ignore
  }

  await ctx.dispose();
}

export default globalSetup;
