import { test, expect } from "@playwright/test";

test.describe("E2E-01: Container Health Checks", () => {
  test("ingestion service is healthy", async ({ request }) => {
    const resp = await request.get("/ingest/health");
    expect(resp.status()).toBe(200);
  });

  test("analytics API is healthy with all dependencies", async ({ request }) => {
    const resp = await request.get("/api/health");
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.status).toBe("ok");
    expect(body.dependencies.clickhouse).toBe("connected");
    expect(body.dependencies.postgres).toBe("connected");
    expect(body.dependencies.redis).toBe("connected");
  });

  test("frontend serves HTML", async ({ request }) => {
    const resp = await request.get("/");
    expect(resp.status()).toBe(200);
    const html = await resp.text();
    expect(html).toContain("<!doctype html");
  });

  test("nginx proxies /api/* to analytics-api", async ({ request }) => {
    const resp = await request.get("/api/health");
    expect(resp.status()).toBe(200);
  });

  test("nginx proxies /ingest/* to ingestion", async ({ request }) => {
    const resp = await request.get("/ingest/health");
    expect(resp.status()).toBe(200);
  });
});
