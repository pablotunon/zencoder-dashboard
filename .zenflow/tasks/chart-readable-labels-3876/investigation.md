# Investigation: Chart Readable Labels

## Bug Summary

The widget query endpoint (`/api/metrics/widget`) returns raw database column values as breakdown labels. When breaking down by `team` or `project`, charts display UUIDs (e.g. `"team-abc-123"`) instead of human-readable names (e.g. `"Engineering"`).

## Root Cause Analysis

`build_widget_query()` in `analytics-api/app/services/widget_query.py:110-137` returns raw ClickHouse column values as labels without enrichment:

```python
data = [
    {"label": str(row[0]) if row[0] is not None else "unknown", "value": ...}
    for row in result.result_rows
]
```

For `team` breakdowns, `row[0]` is a `team_id` UUID. For `project`, it's a `project_id` UUID. These are displayed as-is in the frontend charts.

Other endpoints (`overview.py:43-60`, `usage.py:48-88`) correctly enrich IDs by looking up names from PostgreSQL using existing helper functions:
- `pg_service.get_team_names(org_id)` -> `{team_id: team_name}`
- `pg_service.get_project_names(org_id)` -> `{project_id: project_name}`

The widget endpoint never received this enrichment step.

## Affected Components

### Backend (needs change)
- `analytics-api/app/routers/widget.py` — must enrich labels after `build_widget_query()` returns, for `team` and `project` breakdowns

### Frontend (no changes needed)
- `frontend/src/components/widgets/WidgetRenderer.tsx` — already displays `item.label` as-is; once backend sends names, charts will show them correctly

### Dimensions that need enrichment
| Dimension | Column | Needs mapping? |
|-----------|--------|----------------|
| team | team_id | Yes — UUID to team name |
| project | project_id | Yes — UUID to project name |
| agent_type | agent_type | No — already readable |
| error_category | error_category | No — already readable |
| model | model | No — already readable |

## Proposed Solution (Approved: Approach A — Backend Enrichment)

Add label enrichment in `widget.py` after `build_widget_query()` returns. For `team` and `project` breakdowns, look up names from PostgreSQL using existing `pg_service.get_team_names()` / `get_project_names()` and replace IDs with names in the response data.

This follows the same pattern used in `overview.py` and `usage.py`, requires ~10-15 lines in one file, and needs zero frontend changes.

### Implementation details

In `analytics-api/app/routers/widget.py`, after `build_widget_query()` returns `result`:

1. Check if `result["type"] == "breakdown"` and `body.breakdown in ("team", "project")`
2. If so, fetch the name mapping from PostgreSQL
3. Replace each `item["label"]` with the looked-up name, falling back to the raw ID if not found
4. The result is then cached by Redis as usual, so the extra DB lookup only happens on cache miss

### Test strategy

- Add a test that exercises the widget endpoint with `team` and `project` breakdowns and asserts that labels contain names (not UUIDs)
- Run existing tests to confirm no regressions
