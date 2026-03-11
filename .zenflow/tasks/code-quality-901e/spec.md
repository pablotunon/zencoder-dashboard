# Technical Specification: Code Quality Improvements

## Task Difficulty: Medium-Hard

Cross-service codebase analysis touching Rust, Python (FastAPI), TypeScript (React), and infrastructure.
Many individual changes are small, but the volume and need to preserve behavior across all services
raises complexity.

---

## Executive Summary

After a thorough review of every source file across all six services, the codebase is **well-structured
overall** with clear separation of concerns and consistent architectural patterns. The issues found are
the kind of organic duplication that accumulates as a project grows. The highest-impact improvements
center on the **analytics-api** service, which has the most code duplication, and the **frontend**,
which has a 1100-line widget renderer that should be split.

### Impact Breakdown

| Priority | Service         | Category                        | Estimated Files |
|----------|-----------------|---------------------------------|-----------------|
| P0       | analytics-api   | ClickHouse query deduplication  | 1-2 files       |
| P0       | analytics-api   | Router boilerplate extraction   | 4 files         |
| P1       | frontend        | Split WidgetRenderer.tsx        | 1 -> ~8 files   |
| P1       | frontend        | API client deduplication        | 1 file          |
| P1       | frontend        | Extract useOutsideClick hook    | 2-3 files       |
| P2       | aggregation-wkr | Remove dead enrichment cache    | 2 files         |
| P2       | aggregation-wkr | Extract retry utility           | 1 file          |
| P2       | ingestion       | Test helper extraction          | 1 file          |
| P2       | simulator       | Duplicate sleep(), magic nums   | 2-3 files       |
| P3       | infra           | Missing .dockerignore files     | 4 files         |
| P3       | infra           | Nginx proxy header dedup        | 1 file          |

---

## P0: Analytics API - ClickHouse Query Layer (HIGH IMPACT)

### Problem

`clickhouse.py` (836 lines) contains 15+ query functions that repeat the same structural pattern:

```python
def query_<name>(org_id, filters):
    client = get_client()
    start, end = filters.start, filters.end
    bucket_fn, granularity = resolve_granularity(start, end)
    extra_where, extra_params = build_team_filter(filters)
    query = f"""
        SELECT {bucket_fn} AS timestamp, <metric_expr>
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s AND started_at < %(end)s
          {extra_where}
        GROUP BY timestamp ORDER BY timestamp
    """
    result = client.query(query, parameters={...})
    return { "granularity": granularity, "data": [<row mapping>] }
```

This pattern appears in: `query_usage_trend`, `query_cost_trend`, `query_cost_per_run_trend`,
`query_success_rate_trend`, `query_latency_trend`, `query_queue_wait_trend` (6 functions).

A similar non-timeseries breakdown pattern repeats in: `query_team_breakdown`,
`query_agent_type_breakdown`, `query_project_breakdown`, `query_error_breakdown`,
`query_cost_breakdown` (5 functions).

### Observation

`widget_query.py` already solves this generically with `build_widget_query()` using a
`METRIC_REGISTRY` and `DIMENSION_REGISTRY`. The dedicated router query functions in `clickhouse.py`
duplicate what the widget system does, but with hardcoded metrics.

### Proposed Solution

Introduce two generic private helpers in `clickhouse.py`:

1. **`_query_timeseries(org_id, filters, select_exprs, row_mapper)`** - Handles the
   bucket/granularity/filter/is_partial pattern. The 6 timeseries functions become thin wrappers.

2. **`_query_breakdown(org_id, filters, group_col, select_exprs, row_mapper)`** - Handles the
   group-by/filter pattern. The 5 breakdown functions become thin wrappers.

Each existing function retains its name and return type (no API changes) but delegates to the helper.

### Also: Duplicate filter builder

`build_team_filter()` in `clickhouse.py:132-150` and `_build_filter_clause()` in
`widget_query.py:60-82` are functionally identical. Consolidate into `clickhouse.py` and import
from `widget_query.py`.

### Also: Dead code

`_is_today()` at `clickhouse.py:78-83` is unused. Remove it.

### Files Modified
- `analytics-api/app/services/clickhouse.py` (major refactor)
- `analytics-api/app/services/widget_query.py` (import filter builder from clickhouse)

---

## P0: Analytics API - Router Boilerplate (HIGH IMPACT)

### Problem

All 4 metric routers (`overview.py`, `usage.py`, `cost.py`, `performance.py`) repeat identical
boilerplate:

1. **Cache check** (4 lines, identical across all 4 + org.py):
   ```python
   cache_key = redis_cache.make_cache_key(ctx.org_id, "X", filters.model_dump(...))
   cached = redis_cache.get_cached(cache_key)
   if cached:
       return cached
   ```

2. **ClickHouse error handling** (identical try/except in all 4):
   ```python
   try:
       ... = ch_service.query_*(...)
   except Exception:
       logger.exception("ClickHouse query failed for X")
       raise HTTPException(status_code=503, detail="Analytics data temporarily unavailable")
   ```

3. **PostgreSQL fallback** (identical in overview + usage + cost):
   ```python
   try:
       names = await pg_service.get_*(...)
   except Exception:
       logger.exception("PostgreSQL query failed for X")
       names = {}
   ```

### Proposed Solution

Create a small helpers module (`analytics-api/app/routers/_helpers.py` or similar) with:

1. **`cached_endpoint(org_id, name, filters, ttl, fn)`** - A helper that handles the
   cache-check-and-store pattern.

2. **`query_clickhouse(fn, error_context)`** - Wraps a callable with the standard ClickHouse
   error handling.

3. **`safe_pg_query(fn, default, error_context)`** - Wraps an async PG call with the fallback
   pattern.

This removes ~12 lines of boilerplate from each router function.

### Files Modified
- Create: `analytics-api/app/routers/_helpers.py`
- Modify: `analytics-api/app/routers/overview.py`
- Modify: `analytics-api/app/routers/usage.py`
- Modify: `analytics-api/app/routers/cost.py`
- Modify: `analytics-api/app/routers/performance.py`
- Modify: `analytics-api/app/routers/org.py`

---

## P1: Frontend - Split WidgetRenderer.tsx (MEDIUM-HIGH IMPACT)

### Problem

`WidgetRenderer.tsx` is 1113 lines containing 15+ component functions. This makes testing,
navigation, and maintenance harder than necessary.

### Proposed Solution

Split into individual files under `components/widgets/`:

- `KpiWidget.tsx` - KpiWidget, SingleMetricWidget
- `TimeSeriesWidget.tsx` - TimeSeriesWidget, MultiTimeSeriesWidget, SingleChartDispatch
- `TableWidget.tsx` - SingleTableWidget, MultiTableWidget
- `BarWidget.tsx` - BreakdownBarWidget
- `PieWidget.tsx` - PieWidget
- `GaugeWidget.tsx` - GaugeWidgetLoader
- `StatWidget.tsx` - StatWidgetLoader
- `ActiveUsersWidget.tsx` - ActiveUsersTrendWidget, TopUsersWidget
- `WidgetCard.tsx` - WidgetCard, WidgetSkeleton, FilterIndicator
- `WidgetRenderer.tsx` - Slim dispatcher that imports from above (kept for backward compat)
- `widget-helpers.ts` - Shared helpers: FORMAT_FN, PIE_COLORS, resolveEffectiveDateRange

### Files Modified
- `frontend/src/components/widgets/WidgetRenderer.tsx` (split into ~8-9 files)
- Several new files created

---

## P1: Frontend - API Client Deduplication (MEDIUM IMPACT)

### Problem

`client.ts` has four functions (`fetchJson`, `postJson`, `putJson`, `deleteJson`) that repeat
identical 401-handling and error-checking logic (lines 38-94).

### Proposed Solution

Extract a private `_request<T>(url, options)` function that handles auth headers, 401 detection,
and error checking. The four exports become one-liners calling `_request`.

### Files Modified
- `frontend/src/api/client.ts`

---

## P1: Frontend - Extract useOutsideClick Hook (MEDIUM IMPACT)

### Problem

`DateRangePicker.tsx` (lines 216-240) and `MultiSelect.tsx` (lines 28-50) contain identical
outside-click + Escape key handling with useEffect.

### Proposed Solution

Create `hooks/useOutsideClick.ts` with a custom hook that encapsulates the
mousedown-listener + escape-key pattern. Both components import and use it.

### Files Modified
- Create: `frontend/src/hooks/useOutsideClick.ts`
- Modify: `frontend/src/components/ui/DateRangePicker.tsx`
- Modify: `frontend/src/components/ui/MultiSelect.tsx`

---

## P2: Aggregation Worker - Dead Code & Retry Dedup (LOW-MEDIUM IMPACT)

### Problem 1: Unused EnrichmentCache

`main.py:15,59-61,70` initializes and periodically refreshes an `EnrichmentCache` that is never
actually used for enrichment. The `enrichment.py` module defines the class but it doesn't
participate in the processing pipeline.

**Proposed Solution:** Remove the unused `EnrichmentCache` initialization and refresh calls from
`main.py`. Keep `enrichment.py` only if it serves another purpose; otherwise remove.

### Problem 2: Duplicate Retry Logic

`main.py:117-130` (`_wait_for_redis`) and `main.py:132-147` (`_create_ch_client_with_retry`)
implement nearly identical retry loops (30 attempts, 2-second sleep, same log format).

**Proposed Solution:** Extract a generic `_retry(fn, description, max_attempts=30, delay=2)` helper
and rewrite both methods as one-liners.

### Files Modified
- `aggregation-worker/app/main.py`
- Possibly `aggregation-worker/app/enrichment.py` (remove if dead)

---

## P2: Ingestion - Test Helper Extraction (LOW-MEDIUM IMPACT)

### Problem

`integration.rs` repeats the same test event JSON construction in 11+ tests and the same HTTP
request-building boilerplate in 12+ tests.

### Proposed Solution

Add helper functions at the top of the test module:
- `fn make_test_event(org_id: &str) -> Value`
- `async fn post_events(app: &Router, body: Value) -> (StatusCode, Value)`

### Files Modified
- `ingestion/tests/integration.rs`

---

## P2: Simulator - Small Dedup (LOW IMPACT)

### Problem

1. `sleep()` is defined identically in both `index.ts:122-124` and `sender.ts:95-97`
2. Magic numbers in `events.ts:228-245` (duration ranges, token counts, cost multipliers) lack
   semantic names

### Proposed Solution

1. Move `sleep()` to a shared `utils.ts` and import from both files
2. Extract numeric ranges to named constants

### Files Modified
- Create: `simulator/src/utils.ts`
- Modify: `simulator/src/index.ts`
- Modify: `simulator/src/sender.ts`
- Modify: `simulator/src/generators/events.ts`

---

## P3: Infrastructure (LOW IMPACT)

### Problem 1: Missing .dockerignore

Only the frontend has a `.dockerignore`. The other 4 service builds include unnecessary files
(git history, test artifacts, docs), slowing builds.

**Solution:** Add `.dockerignore` to ingestion, analytics-api, aggregation-worker, simulator.

### Problem 2: Nginx Proxy Header Duplication

`nginx.conf` repeats `proxy_set_header` lines identically in 3 location blocks.

**Solution:** Define common proxy headers once at the `server` or `http` level, or in a shared
included file.

### Files Modified
- Create: `ingestion/.dockerignore`, `analytics-api/.dockerignore`, `aggregation-worker/.dockerignore`, `simulator/.dockerignore`
- Modify: `nginx/nginx.conf`

---

## Decisions

1. **WAU/MAU Calculation:** Include in scope. Move computation from Python nested loops to
   ClickHouse SQL for both code simplification and performance improvement.

2. **Frontend Formatter Dedup:** Out of scope. Too minor (33 lines total, ~10 lines saved).

---

## Verification Approach

For each implementation step:

1. Run the service-specific tests:
   - `./scripts/test.sh analytics-api`
   - `./scripts/test.sh ingestion`
   - `./scripts/test.sh aggregation-worker`
   - `./scripts/test.sh simulator`
   - `./scripts/test.sh frontend`

2. Run linters:
   - `docker compose exec ingestion cargo clippy`
   - `docker compose exec simulator npm run lint`

3. Run E2E tests after all changes: `./scripts/test.sh e2e`

4. Verify no behavioral changes by checking API response shapes remain identical.
