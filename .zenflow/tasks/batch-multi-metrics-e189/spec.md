# Technical Specification: Batch Multi-Metrics Endpoint

## Difficulty: Medium

The feature is well-scoped: add a batch endpoint that accepts multiple metrics in one request, reusing the existing `build_widget_query()` engine. Frontend changes are minimal since the merge logic already exists.

---

## Technical Context

- **Backend**: Python 3.12 / FastAPI, ClickHouse for analytics, Redis for caching
- **Frontend**: TypeScript / React, TanStack React Query, Vite
- **Key dependencies**: `clickhouse-connect`, `pydantic`, `redis`, `orjson`

---

## Problem

Multi-metric widgets (e.g., a line chart showing `cost` and `run_count` together) currently fire N independent `POST /api/metrics/widget` requests — one per metric. The frontend `useMultiMetricWidgetData` hook uses `useQueries()` to parallelize them, then merges results client-side.

This causes:
- N HTTP roundtrips per widget render (latency)
- N independent cache lookups (overhead)
- Harder to reason about loading/error states across metrics

---

## Implementation Approach

### Approach: Loop-based batch endpoint

Add a **`POST /api/metrics/widget/batch`** endpoint that accepts an array of metrics with shared time range, breakdown, and filters. Internally, it loops over each metric calling the existing `build_widget_query()` function, then returns all results keyed by metric name.

**Why this approach:**
- Maximum code reuse — zero changes to `build_widget_query()` or `widget_query.py`
- Each metric result is still independently cacheable via existing Redis cache
- Eliminates N HTTP roundtrips → 1, which is the main latency win
- The frontend merge logic (`mergeTimeSeries`/`mergeBreakdowns`) already exists and stays unchanged

---

## Source Code Changes

### Backend (analytics-api)

#### 1. New request model: `BatchWidgetQueryRequest`
**File**: `analytics-api/app/models/requests.py`

```python
class BatchWidgetQueryRequest(BaseModel):
    metrics: list[Literal[
        "run_count", "active_users", "cost", "cost_per_run",
        "success_rate", "failure_rate", "error_rate",
        "latency_p50", "latency_p95", "latency_p99",
        "tokens_input", "tokens_output",
        "queue_wait_avg", "queue_wait_p95",
    ]]
    start: datetime = None  # type: ignore[assignment]
    end: datetime = None  # type: ignore[assignment]
    breakdown: Literal["team", "project", "agent_type", "error_category", "model"] | None = None
    filters: WidgetFilters | None = None

    # Reuse the same validators as WidgetQueryRequest for date defaults/range
    # Add: len(metrics) >= 1 and len(metrics) <= 10
```

**Rationale**: Mirrors `WidgetQueryRequest` but replaces `metric: str` with `metrics: list[str]`. Shares time range, breakdown, and filters — matching how `useMultiMetricWidgetData` always sends the same parameters for all metrics.

#### 2. New response model: `BatchWidgetQueryResponse`
**File**: `analytics-api/app/models/responses.py`

```python
class BatchWidgetQueryResponse(BaseModel):
    results: dict[str, Any]  # metric_key → individual widget response
```

The `results` dict maps each metric key to its standard `WidgetTimeseriesResponse` or `WidgetBreakdownResponse` payload. This allows the frontend to access each metric's result without knowing the array order.

#### 3. New router handler
**File**: `analytics-api/app/routers/widget.py` (add to existing file)

```python
@router.post("/api/metrics/widget/batch")
async def query_widget_batch(
    body: BatchWidgetQueryRequest,
    ctx: OrgContext = Depends(get_org_context),
):
    # 1. Validate all metrics and breakdown
    # 2. Loop over each metric:
    #    a. Check per-metric Redis cache (reuse existing cache key pattern)
    #    b. On miss: call build_widget_query() (existing function, unchanged)
    #    c. Cache the result (reuse existing set_cached)
    # 3. Return { results: { metric_key: response, ... } }
```

**Per-metric caching**: Each metric is cached individually using the same key structure as the single-metric endpoint: `metrics:{org_id}:widget:{hash(single_metric_params)}`. This means:
- A batch request benefits from cache entries set by previous single-metric requests
- A single-metric request benefits from cache entries set by batch requests
- Cache invalidation stays unchanged

#### 4. No changes needed
- `analytics-api/app/services/widget_query.py` — `build_widget_query()` is called per-metric, unchanged
- `analytics-api/app/services/clickhouse.py` — no changes
- `analytics-api/app/services/redis_cache.py` — no changes
- `analytics-api/app/main.py` — no changes (widget router is already registered)

### Frontend

#### 5. New API function: `postBatchWidgetQuery`
**File**: `frontend/src/api/widget.ts`

```typescript
export interface BatchWidgetQueryParams {
  metrics: MetricKey[];
  start: string;
  end: string;
  breakdown?: BreakdownDimension;
  filters?: { teams?: string[]; projects?: string[]; agent_types?: string[] };
}

export interface BatchWidgetQueryResponse {
  results: Record<string, WidgetQueryResponse>;
}

export async function postBatchWidgetQuery(
  params: BatchWidgetQueryParams,
): Promise<BatchWidgetQueryResponse> {
  return postJson<BatchWidgetQueryResponse>("/api/metrics/widget/batch", params);
}
```

#### 6. Update `useMultiMetricWidgetData` hook
**File**: `frontend/src/api/widget.ts`

Replace the `useQueries()` pattern (N individual requests) with a single `useQuery()` that calls `postBatchWidgetQuery`. The merge logic (`mergeTimeSeries`/`mergeBreakdowns`) stays unchanged — just fed from the batch response instead of individual query results.

```typescript
export function useMultiMetricWidgetData(params: MultiMetricParams) {
  const query = useQuery({
    queryKey: ["widget-batch", params.metrics, params.start, params.end,
               params.breakdown ?? null, params.filters ?? null],
    queryFn: () => postBatchWidgetQuery({
      metrics: params.metrics,
      start: params.start,
      end: params.end,
      breakdown: params.breakdown,
      filters: params.filters,
    }),
    staleTime: 30_000,
  });

  const data = useMemo<MergedWidgetData | undefined>(() => {
    if (!query.data) return undefined;
    const responses = params.metrics.map(m => query.data!.results[m]);
    // Use existing mergeTimeSeries / mergeBreakdowns logic unchanged
    ...
  }, [query.data, params.metrics]);

  return { data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}
```

---

## Data Model / API Contract

### Request: `POST /api/metrics/widget/batch`

```json
{
  "metrics": ["run_count", "cost"],
  "start": "2025-02-01T00:00:00Z",
  "end": "2025-03-01T00:00:00Z",
  "breakdown": null,
  "filters": { "teams": ["team_platform"] }
}
```

### Response (timeseries mode):

```json
{
  "results": {
    "run_count": {
      "type": "timeseries",
      "metric": "run_count",
      "granularity": "day",
      "summary": { "value": 15234, "change_pct": 12.3 },
      "data": [
        { "timestamp": "2025-02-01 00:00:00", "value": 523, "is_partial": false },
        ...
      ]
    },
    "cost": {
      "type": "timeseries",
      "metric": "cost",
      "granularity": "day",
      "summary": { "value": 1847.50, "change_pct": -3.2 },
      "data": [
        { "timestamp": "2025-02-01 00:00:00", "value": 62.30, "is_partial": false },
        ...
      ]
    }
  }
}
```

### Response (breakdown mode):

```json
{
  "results": {
    "run_count": {
      "type": "breakdown",
      "metric": "run_count",
      "dimension": "team",
      "data": [
        { "label": "team_platform", "value": 8234 },
        { "label": "team_ml", "value": 6100 }
      ]
    },
    "cost": {
      "type": "breakdown",
      "metric": "cost",
      "dimension": "team",
      "data": [
        { "label": "team_ml", "value": 1200.50 },
        { "label": "team_platform", "value": 647.00 }
      ]
    }
  }
}
```

### Validation rules:
- `metrics` must have 1-10 items, no duplicates
- Each metric must exist in `METRIC_REGISTRY`
- `breakdown` (if present) must exist in `DIMENSION_REGISTRY`
- Date range validators identical to `WidgetQueryRequest`
- Returns 400 on invalid metric or breakdown, 422 on validation errors

---

## Verification Approach

### Unit Tests (`analytics-api/tests/test_unit.py`)
- `BatchWidgetQueryRequest` validation: valid metrics list, empty list rejected, >10 rejected, duplicates rejected
- `BatchWidgetQueryRequest` inherits date range validation from existing pattern

### Integration Tests (`analytics-api/tests/test_integration.py`)
- `POST /api/metrics/widget/batch` returns correct structure for 2+ metrics (timeseries)
- `POST /api/metrics/widget/batch` returns correct structure for breakdown mode
- Invalid metric in batch returns 400
- Empty metrics list returns 422
- Per-metric caching works (cache set on first call, hit on second)
- Auth required (401 without token)

### Frontend Tests (`frontend/src/__tests__/api-auth.test.ts`)
- `postBatchWidgetQuery()` sends Authorization header

### Linting
- `docker compose exec analytics-api pytest`
- `docker compose exec frontend npm run test`

### Manual verification
- Open a multi-metric widget in the browser
- Confirm Network tab shows 1 batch request instead of N individual requests
- Confirm charts render identically to before

---

## Files Modified

| File | Change |
|------|--------|
| `analytics-api/app/models/requests.py` | Add `BatchWidgetQueryRequest` model |
| `analytics-api/app/models/responses.py` | Add `BatchWidgetQueryResponse` model |
| `analytics-api/app/routers/widget.py` | Add `POST /api/metrics/widget/batch` handler |
| `analytics-api/tests/test_unit.py` | Add `BatchWidgetQueryRequest` validation tests |
| `analytics-api/tests/test_integration.py` | Add batch endpoint integration tests |
| `frontend/src/api/widget.ts` | Add `postBatchWidgetQuery`, update `useMultiMetricWidgetData` |
| `frontend/src/__tests__/api-auth.test.ts` | Add auth test for batch endpoint |
