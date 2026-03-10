import { test as base, expect, request } from "@playwright/test";

const EMAIL = "user@acmecorp.com";
const PASSWORD = "pass";

interface LoginResult {
  token: string;
  user: unknown;
  org: unknown;
}

/** Module-level cache — one login per worker process. */
let _cached: LoginResult | null = null;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Login via the API with retry on 429 rate-limit.
 * Caches the result so subsequent calls in the same worker reuse the token.
 */
export async function apiLogin(baseURL: string): Promise<LoginResult> {
  if (_cached) return _cached;

  const ctx = await request.newContext({ baseURL });
  const maxRetries = 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await ctx.post("/api/auth/login", {
      data: { email: EMAIL, password: PASSWORD },
    });

    if (resp.status() === 429) {
      // Rate-limited — back off aggressively (limit window is 60s)
      const delay = Math.min(15_000 * (attempt + 1), 60_000);
      if (attempt < maxRetries) {
        await sleep(delay);
        continue;
      }
    }

    expect(resp.ok(), `Login failed: ${resp.status()}`).toBeTruthy();
    const body = await resp.json();
    expect(body.token).toBeTruthy();
    await ctx.dispose();
    _cached = body as LoginResult;
    return _cached;
  }

  throw new Error("Login failed after max retries due to rate limiting");
}

/**
 * Playwright fixture: authenticated API request context.
 * Use for API-level tests (pipeline, health checks on protected routes).
 */
export const test = base.extend<{
  authRequest: Awaited<ReturnType<typeof request.newContext>>;
}>({
  authRequest: async ({ playwright }, use) => {
    const baseURL = process.env.BASE_URL ?? "http://localhost:8080";
    const { token } = await apiLogin(baseURL);
    const ctx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await use(ctx);
    await ctx.dispose();
  },
});

/**
 * Playwright fixture: authenticated browser page.
 * Seeds localStorage with the JWT so AuthProvider picks it up on load.
 */
export const browserTest = base.extend<{
  authedPage: import("@playwright/test").Page;
}>({
  authedPage: async ({ page }, use) => {
    const baseURL = process.env.BASE_URL ?? "http://localhost:8080";
    const { token, user, org } = await apiLogin(baseURL);

    // Navigate to origin so we can write localStorage
    await page.goto("/login");
    await page.evaluate(
      ({ token, user, org }) => {
        localStorage.setItem("agenthub_token", token);
        localStorage.setItem("agenthub_user", JSON.stringify(user));
        localStorage.setItem("agenthub_org", JSON.stringify(org));
      },
      { token, user, org },
    );

    // Reload — AuthProvider restores session from localStorage
    await page.goto("/");

    await use(page);
  },
});
