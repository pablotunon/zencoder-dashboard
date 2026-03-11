# Code Quality Report

## Summary

Refactored all 6 services for code reuse and simplification without changing external behavior. All tests pass across every service.

## Changes by Service

### Analytics API (Python/FastAPI)

**ClickHouse query deduplication** — `app/services/clickhouse.py`
- Extracted `_query_timeseries()` and `_query_breakdown()` generic helpers, reducing 11 query functions from ~20 lines each to ~6 lines each
- Consolidated `build_filter_clause()` to accept both `MetricFilters` and `dict`, eliminating the duplicate in `widget_query.py`
- Moved WAU/MAU computation from Python nested loops (O(rows x 30)) to ClickHouse SQL JOINs
- Removed dead `_is_today()` function

**Router boilerplate extraction** — `app/routers/_helpers.py` (new)
- Created `get_cached_or_none()`, `set_cache()`, `query_clickhouse()`, `safe_pg_query()`
- Refactored all 5 routers (`overview.py`, `usage.py`, `cost.py`, `performance.py`, `org.py`) to use shared helpers
- Removed duplicated `logging`, `HTTPException`, and `redis_cache` imports from each router

### Frontend (React/TypeScript)

**WidgetRenderer split** — 1113 lines split into 4 files:
- `widget-helpers.ts` (37 lines) — shared constants and helpers (`FORMAT_FN`, `PIE_COLORS`, `resolveEffectiveDateRange`, `primaryMetric`)
- `WidgetCard.tsx` (118 lines) — `WidgetCard`, `FilterIndicator`, `WidgetSkeleton`
- `ChartWidgets.tsx` (332 lines) — `SingleChartDispatch`, `KpiWidget`, `TimeSeriesWidget`, `BreakdownBarWidget`, `PieWidget`, `SingleTableWidget`
- `WidgetRenderer.tsx` (481 lines) — dispatcher, data loaders, sealed widgets

**API client deduplication** — `api/client.ts`
- Extracted `request()` wrapper centralizing 401 handling and error checking
- Reduced `fetchJson`, `postJson`, `putJson`, `deleteJson` to thin wrappers (eliminated 4x duplicated error blocks)

**useOutsideClick hook** — `hooks/useOutsideClick.ts` (new)
- Extracted from 3 components: `DateRangePicker`, `MultiSelect`, `CustomPage`
- Supports single or multiple refs, includes Escape key handling
- Eliminated ~40 lines of duplicated `useEffect` code

### Aggregation Worker (Python)

- Extracted `_wait_for_service()` generic retry helper from duplicated `_wait_for_redis()` and `_create_ch_client_with_retry()` methods

### Simulator (TypeScript)

- Exported `sleep()` from `sender.ts`, removed duplicate in `index.ts`
- Extracted 13 named constants in `events.ts` for magic numbers: duration ranges, token ranges, queue wait, cost-per-token, rating probabilities

### Ingestion (Rust/Axum)

- Extracted `redis_url()` and `build_app()` test helpers in `integration.rs`, eliminating duplicated Redis URL construction and router building
- Extracted `require_non_empty()` validation helper in `validation.rs`, replacing 4 repetitive `if field.is_empty()` blocks

### Infrastructure

- `docker-compose.yml`: Introduced `x-database-env` YAML anchor for shared database environment variables, used by `analytics-api`, `aggregation-worker`, and `simulator` (eliminated ~30 duplicated lines)

## Verification

All service tests pass:
- `./scripts/test.sh` — simulator, ingestion, aggregation-worker, analytics-api, frontend: all pass

## Files Modified

| Service | File | Change |
|---------|------|--------|
| analytics-api | `app/services/clickhouse.py` | Major refactor with query helpers |
| analytics-api | `app/services/widget_query.py` | Import consolidated filter builder |
| analytics-api | `app/routers/_helpers.py` | New shared router helpers |
| analytics-api | `app/routers/overview.py` | Use shared helpers |
| analytics-api | `app/routers/usage.py` | Use shared helpers |
| analytics-api | `app/routers/cost.py` | Use shared helpers |
| analytics-api | `app/routers/performance.py` | Use shared helpers |
| analytics-api | `app/routers/org.py` | Use shared helpers |
| analytics-api | `tests/test_unit.py` | Remove dead import |
| analytics-api | `tests/test_integration.py` | Update static analysis test for delegation |
| frontend | `src/components/widgets/widget-helpers.ts` | New shared constants/helpers |
| frontend | `src/components/widgets/WidgetCard.tsx` | New card component module |
| frontend | `src/components/widgets/ChartWidgets.tsx` | New chart components module |
| frontend | `src/components/widgets/WidgetRenderer.tsx` | Slim dispatcher (was 1113 lines, now 481) |
| frontend | `src/api/client.ts` | Centralized request() wrapper |
| frontend | `src/hooks/useOutsideClick.ts` | New shared hook |
| frontend | `src/components/ui/MultiSelect.tsx` | Use useOutsideClick |
| frontend | `src/components/ui/DateRangePicker.tsx` | Use useOutsideClick |
| frontend | `src/pages/CustomPage.tsx` | Use useOutsideClick |
| aggregation-worker | `app/main.py` | Extract retry helper |
| simulator | `src/sender.ts` | Export sleep() |
| simulator | `src/index.ts` | Import sleep() from sender |
| simulator | `src/generators/events.ts` | Named constants for magic numbers |
| ingestion | `tests/integration.rs` | Extract test helpers |
| ingestion | `src/validation.rs` | Extract validation helper |
| infrastructure | `docker-compose.yml` | YAML anchors for env vars |
