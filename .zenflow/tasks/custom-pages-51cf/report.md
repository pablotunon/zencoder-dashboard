# Custom Pages — Integration Testing Report

## Summary

The Custom Pages feature replaces hardcoded dashboard routes (`/overview`, `/usage`, `/cost`, `/performance`) with a dynamic user-owned pages system backed by PostgreSQL. Pages are accessible at `/p/:slug`, with CRUD operations via REST API and a React frontend with dynamic sidebar navigation, inline editing, and page creation from templates.

## Test Results

### Service Unit Tests — All Pass (154 total)

| Service | Tests | Status |
|---------|-------|--------|
| Ingestion (Rust) | 12 | Pass |
| Aggregation Worker (Python) | 26 | Pass |
| Analytics API (Python) | 101 | Pass |
| Frontend (TypeScript) | 15 | Pass |

### E2E Tests — All Pass (54 total, 35s)

| Suite | Tests | Description |
|-------|-------|-------------|
| E2E-01: Health Checks | 5 | Container health, nginx proxying |
| E2E-02: Pipeline | 6 | Ingestion, aggregation, metric endpoints |
| E2E-03: Dashboard | 7 | Page routing, sidebar navigation, KPI cards |
| E2E-04: Auth | 17 | 401 rejection, authenticated API, browser session |
| E2E-05a: Pages API | 8 | CRUD, templates, slug generation, 401 guard |
| E2E-05b: Pages UI | 7 | Sidebar, modal creation, navigation, deletion, error states |
| Chart Colors | 3 | Recharts gradient color regression |
| Frontend HTML | 1 | Module script references |

## New E2E Test Coverage (custom-pages.spec.ts)

### API-level tests (E2E-05a)
- `GET /api/pages` returns seeded pages (overview, usage-adoption, cost-efficiency, performance-reliability)
- `GET /api/pages/templates` returns 4 templates with id, name, icon, description
- `POST /api/pages` creates blank page with correct slug
- `POST /api/pages` creates page from template with pre-populated layout
- `PUT /api/pages/:slug` updates page name and generates new slug
- `DELETE /api/pages/:slug` removes page, returns 404 on re-fetch
- `GET /api/pages/:slug` returns page with layout array
- `GET /api/pages` returns 401 without auth token

### Browser-level tests (E2E-05b)
- Seeded pages appear in sidebar with "New Page" button
- Create new page via modal (with pre/post cleanup for idempotency)
- Navigate between pages via sidebar links
- Blank page shows empty state ("No rows yet")
- Delete page from sidebar with confirmation
- Old routes (`/overview`, etc.) redirect to first page via catch-all
- Non-existent page slug shows "Page not found" error state

## Issues Found and Fixed

### 1. Vite Dev Server Cold-Start (Root Cause of Browser Test Flakiness)

The Vite dev server in Docker performs module-on-demand compilation. First browser requests trigger compilation, causing the `authedPage` fixture to time out waiting for the SPA to redirect from `/` to `/p/:slug`.

**Fix:** Added `globalSetup` (`tests/e2e/tests/global-setup.ts`) that warms up the frontend with an HTTP request before any tests run. Also added `waitUntil: "networkidle"` to the fixture's `page.goto()` calls.

### 2. E2E Docker Image Not Rebuilt

The `test.sh e2e` command used `docker compose run --rm e2e` without `--build`, so test file changes weren't picked up.

**Fix:** Added `--build` flag to `scripts/test.sh` so the e2e container is always rebuilt.

### 3. Route Updates in Existing Tests

Existing E2E tests referenced old routes (`/usage`, `/cost`, `/performance`). Updated to new `/p/:slug` routes across `dashboard.spec.ts`, `chart-colors.spec.ts`, and `auth.spec.ts`.

### 4. Strict Mode Heading Violations

`getByRole('heading', { name: /cost/i })` matched multiple headings (page title + widget titles). Fixed chart-colors tests to use `locator("h1")` for page heading checks.

### 5. Auth Browser Tests Re-Navigation

Auth browser tests unnecessarily re-navigated to `/` after the fixture already established the session. Simplified to verify content on the already-loaded page.

### 6. Test Cleanup for Idempotency

The "create new page via modal" test left behind test pages on failure/retry. Added pre-test cleanup of leftover `my-test-page` slugs and post-test deletion.

## Files Modified

| File | Change |
|------|--------|
| `tests/e2e/tests/custom-pages.spec.ts` | **New** — 15 E2E tests for pages API and UI |
| `tests/e2e/tests/global-setup.ts` | **New** — Vite warmup before test suite |
| `tests/e2e/playwright.config.ts` | Added `globalSetup` reference |
| `tests/e2e/tests/auth.setup.ts` | Added `networkidle` waits in `authedPage` fixture |
| `tests/e2e/tests/auth.spec.ts` | Simplified browser tests, removed redundant navigation |
| `tests/e2e/tests/dashboard.spec.ts` | Updated routes to `/p/:slug` |
| `tests/e2e/tests/chart-colors.spec.ts` | Updated routes, fixed heading selectors |
| `scripts/test.sh` | Added `--build` flag to e2e command |

## Verification

All 54 E2E tests pass consistently across multiple runs with 0 flaky tests.
All 154 service unit tests pass.
