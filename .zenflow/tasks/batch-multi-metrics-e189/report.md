# Completion Report: Batch Multi-Metrics

## Summary

Multi-metric widgets now fetch all metrics in a single HTTP request via `POST /api/metrics/widget/batch` instead of issuing N individual calls.

## Changes

### Backend (previous step)
- `analytics-api/app/models/requests.py` — `BatchWidgetQueryRequest` model
- `analytics-api/app/models/responses.py` — `BatchWidgetQueryResponse` model
- `analytics-api/app/routers/widget.py` — `POST /api/metrics/widget/batch` handler with per-metric caching
- `analytics-api/tests/test_unit.py` — validation tests for batch request model
- `analytics-api/tests/test_integration.py` — integration tests for batch endpoint

### Frontend (this step)
- **`frontend/src/api/widget.ts`**
  - Added `BatchWidgetQueryParams` and `BatchWidgetQueryResponse` interfaces
  - Added `postBatchWidgetQuery()` function calling `/api/metrics/widget/batch`
  - Updated `useMultiMetricWidgetData` hook: replaced `useQueries()` (N individual requests) with a single `useQuery()` calling `postBatchWidgetQuery`
  - Removed unused `useQueries` import
  - Existing `mergeTimeSeries` and `mergeBreakdowns` logic unchanged
- **`frontend/src/__tests__/api-auth.test.ts`**
  - Added MSW handler for `POST */api/metrics/widget/batch`
  - Added test: `postBatchWidgetQuery` sends Authorization header
  - Added test: `postBatchWidgetQuery` rejects with 401 when no token is set

## Verification

All frontend tests pass (25/25):
```
 ✓ src/__tests__/api-auth.test.ts (9 tests)
 ✓ src/__tests__/widget-filters.test.tsx (4 tests)
 ✓ src/__tests__/date-range-picker.test.tsx (12 tests)
```
