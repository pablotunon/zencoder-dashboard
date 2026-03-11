# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification

Assess the task's difficulty, as underestimating it leads to poor outcomes.
- easy: Straightforward implementation, trivial bug fix or feature
- medium: Moderate complexity, some edge cases or caveats to consider
- hard: Complex logic, many caveats, architectural considerations, or high-risk changes

Create a technical specification for the task that is appropriate for the complexity level:
- Review the existing codebase architecture and identify reusable components.
- Define the implementation approach based on established patterns in the project.
- Identify all source code files that will be created or modified.
- Define any necessary data model, API, or interface changes.
- Describe verification steps using the project's test and lint commands.

Save the output to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach
- Source code structure changes
- Data model / API / interface changes
- Verification approach

If the task is complex enough, create a detailed implementation plan based on `{@artifacts_path}/spec.md`:
- Break down the work into concrete tasks (incrementable, testable milestones)
- Each task should reference relevant contracts and include verification steps
- Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function).

Important: unit tests must be part of each implementation task, not separate tasks. Each task should implement the code and its tests together, if relevant.

Save to `{@artifacts_path}/plan.md`. If the feature is trivial and doesn't warrant this breakdown, keep the Implementation step below as is.

---

### [ ] Step: Analytics API - ClickHouse query deduplication

Refactor `analytics-api/app/services/clickhouse.py` to eliminate repeated query patterns:

- Extract `_query_timeseries(org_id, filters, select_exprs, row_mapper)` helper for the 6 time-series functions
- Extract `_query_breakdown(org_id, filters, group_col, select_exprs, row_mapper)` helper for the 5 breakdown functions
- Move WAU/MAU computation from Python nested loops (`query_active_users_trend` lines 306-376) to ClickHouse SQL for both simplification and performance
- Consolidate duplicate filter builder: remove `_build_filter_clause()` from `widget_query.py` and import `build_team_filter()` from `clickhouse.py`
- Remove dead `_is_today()` function
- Run `./scripts/test.sh analytics-api` to verify no regressions

### [ ] Step: Analytics API - Router boilerplate extraction

Reduce repetitive boilerplate across all metric routers:

- Create `analytics-api/app/routers/_helpers.py` with:
  - `cached_endpoint(org_id, name, filters, ttl, fn)` for cache check/store pattern
  - `query_clickhouse(fn, error_context)` for ClickHouse error handling
  - `safe_pg_query(fn, default, error_context)` for PostgreSQL fallback
- Refactor `overview.py`, `usage.py`, `cost.py`, `performance.py`, and `org.py` to use helpers
- Run `./scripts/test.sh analytics-api` to verify no regressions

### [ ] Step: Frontend - Split WidgetRenderer and deduplicate API client

Split the 1113-line `WidgetRenderer.tsx` into focused widget components and clean up the API client:

- Split `WidgetRenderer.tsx` into per-widget files: `KpiWidget.tsx`, `TimeSeriesWidget.tsx`, `TableWidget.tsx`, `BarWidget.tsx`, `PieWidget.tsx`, `GaugeWidget.tsx`, `StatWidget.tsx`, `ActiveUsersWidget.tsx`, `WidgetCard.tsx`, and a shared `widget-helpers.ts`
- Keep `WidgetRenderer.tsx` as slim dispatcher
- Refactor `client.ts`: extract shared `_request()` function to deduplicate 401/error handling across `fetchJson`, `postJson`, `putJson`, `deleteJson`
- Extract `useOutsideClick` hook from `DateRangePicker.tsx` and `MultiSelect.tsx`
- Run `./scripts/test.sh frontend` to verify no regressions

### [ ] Step: Aggregation worker and simulator cleanup

Small deduplication and dead code removal:

- Remove unused `EnrichmentCache` initialization from `aggregation-worker/app/main.py`
- Extract generic retry helper from duplicated `_wait_for_redis()` and `_create_ch_client_with_retry()` in `main.py`
- Simulator: extract shared `sleep()` to `utils.ts`, import from `index.ts` and `sender.ts`
- Simulator: extract magic numbers in `events.ts` to named constants
- Run `./scripts/test.sh aggregation-worker` and `./scripts/test.sh simulator`

### [ ] Step: Ingestion tests and infrastructure

Test helper extraction and infra improvements:

- Ingestion: extract `make_test_event()` and `post_events()` helpers in `integration.rs`
- Add `.dockerignore` files to `ingestion/`, `analytics-api/`, `aggregation-worker/`, `simulator/`
- Deduplicate nginx proxy headers in `nginx/nginx.conf`
- Run `./scripts/test.sh ingestion` and `./scripts/test.sh e2e` for final validation
- Write report to `{@artifacts_path}/report.md`
