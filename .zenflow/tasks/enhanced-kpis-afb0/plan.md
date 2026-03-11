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

Assessed difficulty as easy–medium. Created `spec.md` with full design:
- Frontend-only change, zero backend modifications
- Three files modified: `types/widget.ts`, `lib/widget-registry.ts`, `components/widgets/WidgetRenderer.tsx`
- Enhancements: sparkline, description, previous period value, period high/low
- All data already available in the existing API response

---

### [x] Step: Add description field to MetricMeta and registry
<!-- chat-id: b64e8b9f-cbac-45cd-aa3a-6876509a51aa -->

Extend the type system and populate descriptions for all 14 metrics:
- Add `description: string` to `MetricMeta` interface in `frontend/src/types/widget.ts`
- Add `description` value to each of the 14 entries in `frontend/src/lib/widget-registry.ts`
- Run type-check to confirm all entries satisfy the updated interface

Verification: `docker compose exec frontend npm run type-check`

---

### [x] Step: Rewrite KpiWidget with sparkline, insights, and tests
<!-- chat-id: af377c98-938d-4262-a63b-8beb4155e843 -->

Enhance the `KpiWidget` component in `frontend/src/components/widgets/WidgetRenderer.tsx`:
- Add sparkline using recharts `AreaChart` (tiny, no axes, ~48px tall)
- Show previous period value derived from `summary.value` and `summary.change_pct`
- Display metric description from registry
- Compute and display period high/low from timeseries data (excluding partial buckets)
- Pass `MetricMeta` through from `SingleChartDispatch`
- Handle edge cases: null change_pct, empty data, single data point
- Write unit tests for the enhanced KpiWidget
- Run all tests, lint, and type-check

Verification:
- `docker compose exec frontend npm run test`
- `docker compose exec frontend npm run lint`
- `docker compose exec frontend npm run type-check`
- `./scripts/test.sh e2e`
- Write report to `{@artifacts_path}/report.md`
