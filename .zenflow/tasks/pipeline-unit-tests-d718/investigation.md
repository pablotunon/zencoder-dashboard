# Investigation: E2E Test Failure — 502 Instead of 401

## Bug Summary

E2E test `E2E-04a: GET /api/metrics/overview returns 401 without token` fails in CI because it receives HTTP 502 (Bad Gateway) instead of the expected 401 (Unauthorized).

## Root Cause Analysis

### How Auth Works

Authentication is handled entirely within the **analytics-api** (FastAPI) service, not at nginx. The flow is:

1. Request arrives at nginx (`/api/...`)
2. Nginx proxies to `analytics-api:8000` (transparent, no auth logic)
3. FastAPI route dependency `get_org_context()` checks for Bearer token
4. If no token → returns 401 (`analytics-api/app/auth/dependencies.py:19-20`)

### Why 502 Occurs

A 502 Bad Gateway means **nginx cannot reach the analytics-api upstream**. This happens when the analytics-api process is down or unresponsive at the time the E2E test sends its request.

### The Race Condition

The CI pipeline has these pre-test checks:
1. Docker healthcheck loop (90 attempts × 2s = 180s max)
2. `curl http://localhost:8080/api/health` through nginx (60 attempts × 3s = 180s max)
3. `curl http://localhost:8080/ingest/health` through nginx (30 attempts × 2s = 60s max)
4. Wait for simulator "Live Mode" in logs (120 attempts × 2s = 240s max)

However, there's a critical gap: **none of these steps verify the analytics-api remains healthy after the simulator finishes seeding**. The analytics-api could crash or become unresponsive between the health check (step 2) and the actual E2E test execution, due to:

- **Resource pressure from the simulator**: The simulator does a 90-day backfill that generates heavy load on ClickHouse, PostgreSQL, and Redis. The analytics-api shares these same dependencies.
- **Connection pool exhaustion**: The analytics-api's database connections may be affected by the simultaneous load from the simulator and aggregation-worker.
- **OOM or process crash**: On CI runners with limited memory, the combined workload of all services during data seeding could cause the analytics-api process to be killed.

### Why It's Intermittent

The health check at step 2 passes because it runs *before* the simulator starts seeding data (step 4). The analytics-api is healthy at that point. The problem emerges during or after the heavy seeding phase, when actual E2E tests finally run.

## Affected Components

- `tests/e2e/tests/auth.spec.ts` — The failing test
- `.github/workflows/ci.yml` — E2E job (lines 86-174), specifically the gap between health checks and test execution
- `nginx/nginx.conf` — No error handling for upstream failures
- `tests/e2e/tests/global-setup.ts` — Warmup ignores failures from `/api/health`

## Proposed Solution

Add a **retry-with-backoff mechanism** to the E2E `global-setup.ts` that waits for the analytics-api to be fully reachable through nginx before tests run. This is the correct fix because:

1. It runs at the right time — just before tests execute, after all CI preparation steps
2. It verifies end-to-end connectivity (through nginx, not just the container health)
3. It's the Playwright-native place for pre-test setup

### Implementation Details

**File: `tests/e2e/tests/global-setup.ts`**

Modify the global setup to:
1. Poll `/api/health` through nginx with retries (not just a single fire-and-forget call)
2. Fail loudly if the API never becomes reachable (instead of silently catching errors)
3. Add a reasonable timeout (e.g., 60s with 2s intervals)

This ensures the analytics-api is confirmed healthy right before tests start, closing the gap between CI health checks and actual test execution.

### Alternative/Complementary Options

1. **Add `proxy_next_upstream` to nginx** — Would cause nginx to retry on upstream errors, but only helps with multiple upstream servers (we have one).
2. **Add `error_page 502` directive in nginx** — Could provide a better error, but doesn't solve the root cause.
3. **Add retry logic in the CI workflow** — Another curl check after the simulator seeds. Less clean than fixing global-setup.
4. **Add test-level retry in auth.spec.ts** — Could wrap the assertion with retries, but masks the real issue and is not idiomatic for E2E tests.

The global-setup fix is the cleanest and most maintainable approach.

## Implementation Notes

### Change Made

**File: `tests/e2e/tests/global-setup.ts`** — Replaced the single fire-and-forget `/api/health` call with a retry loop:

- **30 attempts, 2s apart** (60s total timeout) — polls `GET /api/health` through nginx
- **Logs each attempt** so CI output shows exactly what happened
- **Fails loudly** with a descriptive error if the API never becomes healthy, instead of silently swallowing the error and letting tests run against an unreachable backend

The previous code was:
```ts
try { await ctx.get("/api/health"); } catch { /* ignore */ }
```

This meant that if the analytics-api was down (returning 502 via nginx), tests would proceed anyway and fail with cryptic 502-vs-401 assertion errors.

### Additional Fix: CI Workflow Post-Seeding Health Check

The first fix (global-setup retry) was insufficient. A subsequent CI run showed **all 54 tests** failing with 502, meaning the analytics-api was completely down during the entire test run. The global-setup retry can't help if the API goes down *after* it passed the health check.

Root cause: the CI workflow verified API health **before** the simulator's 90-day backfill (step 2 → "Verify API reachable through nginx"). The heavy seeding phase can cause the analytics-api to crash or become unreachable due to resource pressure on the shared ClickHouse/Postgres/Redis infrastructure. By the time E2E tests run, the API may already be down.

**File: `.github/workflows/ci.yml`** — Added a "Verify API still healthy after seeding" step between "Wait for simulator to seed data" and "Run E2E tests":
- 30 attempts, 2s apart (60s max wait)
- Re-verifies `/api/health` through nginx from the host
- If the API isn't healthy, dumps analytics-api logs and fails the job with a clear error message instead of running tests against a dead backend

This two-layer defense ensures:
1. **CI workflow level**: API is confirmed healthy after all heavy operations complete
2. **Playwright global-setup level**: API is confirmed healthy from inside the e2e container immediately before tests run

### Root Cause Fix: Prevent `--build` from Recreating Running Services

A third CI run revealed the true root cause. The global-setup retry worked correctly — it detected 30 consecutive 502 responses over 60 seconds and aborted with a clear error. But why was the analytics-api down for 60+ seconds when it had just passed the CI health check?

**The `--build` flag on `docker compose run` was recreating the analytics-api container.** When `docker compose --profile testing run --rm --build e2e` executes, docker compose rebuilds **all services in the dependency chain** (e2e → nginx → analytics-api, ingestion, frontend). If the analytics-api image hash changes (e.g., COPY context differs), docker compose recreates the container — stopping the running one and starting a new one. The new container needs time to pass its healthcheck (start_period: 10s + retries), during which nginx returns 502.

**Fix:** Split the build and run into two commands:
1. `docker compose --profile testing build e2e` — builds images (harmless to running containers)
2. `docker compose --profile testing run --rm e2e` — runs e2e without triggering rebuilds/recreation

Applied to both:
- `.github/workflows/ci.yml` (CI pipeline)
- `scripts/test.sh` (local development)

### Test Results

All 54 E2E tests passed. The analytics-api container ID remained unchanged throughout the test run, confirming no recreation occurred.
