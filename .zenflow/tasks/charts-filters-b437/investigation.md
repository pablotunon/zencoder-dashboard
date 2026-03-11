# Investigation: Charts Filters Always Empty

## Bug Summary

When a user adds a filter (team or project) to a widget, the chart always renders empty. Agent type filters may work in some cases but team and project filters never return data.

## Root Cause

**Value mismatch between frontend filter options and ClickHouse column values.**

The frontend `WidgetModal.tsx` sends the wrong identifier for team and project filters:

| Filter | Frontend sends | ClickHouse column | ClickHouse stores | Match? |
|--------|---------------|-------------------|-------------------|--------|
| Team | `team.slug` (e.g. `"platform"`) | `team_id` | `"team_platform"` | NO |
| Project | `project.name` (e.g. `"api-gateway"`) | `project_id` | `"proj_org_acme_00"` | NO |
| Agent Type | agent type value (e.g. `"coding"`) | `agent_type` | `"coding"` | YES |

The backend `_build_filter_clause()` in `widget_query.py` passes filter values directly into SQL `IN` clauses against `team_id` and `project_id` columns. Since the values don't match, the query returns zero rows.

## Affected Components

### Frontend (source of bug)
- `frontend/src/components/widgets/WidgetModal.tsx` lines 428 and 459
  - Line 428: `<option key={t.team_id} value={t.slug}>` should use `value={t.team_id}`
  - Line 459: `<option key={p.project_id} value={p.name}>` should use `value={p.project_id}`

### Backend (correct, no changes needed)
- `analytics-api/app/services/widget_query.py` - `_build_filter_clause()` correctly queries `team_id` and `project_id` columns
- `analytics-api/app/routers/widget.py` - correctly passes filters through
- `analytics-api/app/models/requests.py` - WidgetFilters model is fine

### Data layer (correct, no changes needed)
- ClickHouse `agent_runs` table stores `team_id` and `project_id` as String columns with actual IDs

## Proposed Solution

Change the `value` attribute of the `<option>` elements in WidgetModal.tsx:

1. **Team filter** (line 428): `value={t.slug}` -> `value={t.team_id}`
2. **Project filter** (line 459): `value={p.name}` -> `value={p.project_id}`

This is a two-line frontend fix. No backend changes needed. Agent type filter already works correctly since it uses the actual value stored in ClickHouse.

## Edge Cases

- Existing saved widget configs with slug/name filter values will still produce empty charts. These were always broken, so no regression.
- The `WidgetConfig.filters` type uses `string[]` which accommodates both IDs and slugs, so no type changes needed.

## Test Plan

- Add/update an integration or e2e test that creates a widget with team/project filters and verifies non-empty data is returned
- Verify existing `test_widget_with_filters` in `analytics-api/tests/test_integration.py` covers the backend path (it does, but it mocks ClickHouse)
- Manual verification: create a widget with a team filter, confirm chart shows data

## Implementation Notes

### Fix Applied
Two-line change in `frontend/src/components/widgets/WidgetModal.tsx`:

1. **Line 428**: `value={t.slug}` → `value={t.team_id}`
2. **Line 459**: `value={p.name}` → `value={p.project_id}`

### Dependency Added
- Added `@testing-library/dom` (^10.4.0) to `frontend/package.json` devDependencies — required peer dependency of `@testing-library/react` that was missing, needed for component rendering tests.

### Regression Tests Added
New test file: `frontend/src/__tests__/widget-filters.test.tsx` (4 tests):

1. **team filter options use team_id as value, not slug** — verifies `<option>` elements render with `team_id` values
2. **project filter options use project_id as value, not name** — verifies `<option>` elements render with `project_id` values
3. **submitted config.filters.teams contains team_id values** — end-to-end: select team → submit → verify `onAdd` receives `team_id`
4. **submitted config.filters.projects contains project_id values** — end-to-end: select project → submit → verify `onAdd` receives `project_id`

### Test Results
All 19 frontend tests pass (3 test files):
- `constants.test.ts` — 4 tests
- `api-auth.test.ts` — 11 tests
- `widget-filters.test.tsx` — 4 tests
