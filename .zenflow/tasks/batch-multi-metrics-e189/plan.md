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

If you are blocked and need user clarification, mark the current step with `[!]` in plan.md before stopping.

---

## Workflow Steps

### [x] Step: Technical Specification
<!-- chat-id: c2c17b76-866e-4f7a-b57c-d9b7c7ee1f32 -->

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

### [ ] Step: Backend batch endpoint with tests

Implement the backend batch endpoint and its tests. See `spec.md` for full contract.

- Add `BatchWidgetQueryRequest` model to `analytics-api/app/models/requests.py` (list of metrics, shared start/end/breakdown/filters, 1-10 metrics validation, no duplicates)
- Add `BatchWidgetQueryResponse` model to `analytics-api/app/models/responses.py` (results dict keyed by metric)
- Add `POST /api/metrics/widget/batch` handler to `analytics-api/app/routers/widget.py` — loop over metrics, use per-metric Redis caching, call existing `build_widget_query()` for each
- Add unit tests to `analytics-api/tests/test_unit.py` for `BatchWidgetQueryRequest` validation (valid list, empty rejected, >10 rejected, duplicates rejected)
- Add integration tests to `analytics-api/tests/test_integration.py` for batch endpoint (timeseries response, breakdown response, invalid metric returns 400, cache behavior, auth required)
- Run: `docker compose exec analytics-api pytest`

### [ ] Step: Frontend batch integration with tests

Update the frontend to use the batch endpoint. See `spec.md` for full contract.

- Add `postBatchWidgetQuery` function and `BatchWidgetQueryParams`/`BatchWidgetQueryResponse` types to `frontend/src/api/widget.ts`
- Update `useMultiMetricWidgetData` hook to use a single `useQuery` calling `postBatchWidgetQuery` instead of `useQueries` with N individual calls. Keep existing `mergeTimeSeries`/`mergeBreakdowns` logic.
- Add auth test for `postBatchWidgetQuery` to `frontend/src/__tests__/api-auth.test.ts`
- Run: `docker compose exec frontend npm run test`
- Write completion report to `{@artifacts_path}/report.md`
