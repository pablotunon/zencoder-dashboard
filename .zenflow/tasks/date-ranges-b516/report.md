# Date Ranges Feature - Implementation Report

## Summary

Replaced the fixed `period` parameter (`7d`, `30d`, `90d`) with flexible `start`/`end` ISO 8601 datetime parameters across the entire stack. Users can now select custom date ranges with minute-level precision, including predefined presets (Last 1 hour, Last 24 hours, Last 7 days, Last 30 days, Last 90 days) and fully custom calendar + time selection.

## Changes by Layer

### Backend (analytics-api)

- **`app/models/requests.py`**: Replaced `period: Literal["7d","30d","90d"]` with `start: datetime` and `end: datetime` in `MetricFilters` and `WidgetQueryRequest`. Added validation (start < end, range <= 1 year, end <= now + 1 day). Defaults to last 30 days when omitted.
- **`app/services/clickhouse.py`**: Replaced `period_to_dates()` with `resolve_granularity(start, end)` that auto-selects bucket size (minute/hour/day/week) based on range span. Updated all SQL queries to use datetime comparisons. Fixed a `toDate()` type mismatch in the active users trend wide query.
- **`app/services/widget_query.py`**: Updated `build_widget_query()` to accept `start`/`end` datetimes. Returns `granularity` in responses. Renamed `date` to `timestamp` in data points.
- **SQL queries** (`overview.sql`, `usage.sql`, `cost.sql`, `performance.sql`): Replaced hardcoded `toDate()` bucketing with parameterized `{bucket_fn}` for dynamic granularity.
- **Routers** (`overview.py`, `usage.py`, `cost.py`, `performance.py`, `widget.py`): Wired updated models throughout.

### Frontend

- **Types** (`api.ts`, `widget.ts`): Replaced `Period` with `DateRange = { start: string; end: string }`. Renamed `date` to `timestamp` in timeseries types.
- **`DateRangePicker` component**: New popover-based component with preset buttons, react-day-picker calendar, and native time inputs for minute precision.
- **Dashboard integration** (`CustomPage.tsx`, `RowLayout.tsx`, `WidgetRenderer.tsx`, `WidgetModal.tsx`): Replaced period selectors with DateRangePicker for both global and per-widget date ranges.
- **Chart formatting** (`TimeSeriesChart.tsx`): X-axis tick formatting adapts to granularity (minute: "HH:mm", hour: "Mar 5 14:00", day: "Mar 5", week: "Mar 5").
- **API layer** (`client.ts`, `widget.ts`, `hooks.ts`, `constants.ts`): Updated to send `start`/`end` parameters.

### E2E Tests

- **`auth.spec.ts`**: Updated all API endpoint URLs from `?period=7d` to `?start=...&end=...`. Updated POST body payloads similarly. Fixed test title instability by using static titles instead of embedding dynamic timestamps.
- **`pipeline.spec.ts`**: Updated all API endpoint URLs from `?period=90d` to `?start=...&end=...`.

## Bug Fixes Found During Verification

1. **ClickHouse type mismatch in usage query** (`clickhouse.py:317-318`): The `query_active_users_trend` function's wide query used `toDate(started_at) >= %(wide_start)s` where `wide_start` was a `datetime` object. ClickHouse `toDate()` returns a `Date` type, causing a type mismatch error. Fixed by using `started_at >= %(wide_start)s` (datetime-to-datetime comparison).

## Test Results

### Unit Tests (all passing)
| Service | Tests | Status |
|---------|-------|--------|
| analytics-api | 125 | Pass |
| frontend | 31 | Pass |
| ingestion | 23 | Pass |
| aggregation-worker | 26 | Pass |
| simulator | 48 | Pass |
| **Total** | **253** | **All pass** |

### E2E Tests (all passing)
| Suite | Tests | Status |
|-------|-------|--------|
| Container Health Checks | 5 | Pass |
| Write-Aggregate-Read Pipeline | 7 | Pass |
| Dashboard Accessibility | 7 | Pass |
| Authentication & Authorization | 10 | Pass |
| Custom Pages API & UI | 15 | Pass |
| Chart Colors | 3 | Pass |
| Frontend HTML | 1 | Pass |
| Dashboard loads after login | 2 | Pass |
| Non-existent page error | 1 | Pass |
| Old routes redirect | 1 | Pass |
| Delete page from sidebar | 1 | Pass |
| Create new page via modal | 1 | Pass |
| **Total** | **54** | **All pass** |

### Full Stack Build
All 9 services build and start successfully: postgres, clickhouse, redis, ingestion, analytics-api, aggregation-worker, frontend, nginx, simulator.
