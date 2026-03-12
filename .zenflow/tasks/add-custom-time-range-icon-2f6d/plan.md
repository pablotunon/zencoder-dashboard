# Auto

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

### [x] Step: Implementation
<!-- chat-id: d86d2d56-9059-499d-a676-92180f5936cf -->

**Scope**: Small — add a custom time range indicator icon to widget headers.

**What was done**: Added a `TimeRangeIndicator` component to `WidgetCard.tsx` that displays a clock icon (amber color, matching the pattern of the existing info/filter icons) when a widget uses a custom time range instead of the global one. On hover, a tooltip shows "Custom Time Range" with the From/To dates. The `WidgetCard` component now accepts an optional `timeRange` prop, and all call sites in `WidgetRenderer.tsx` pass `widget.timeRange`. Also resolved merge conflicts after a code quality PR refactored the widget system into separate files (`WidgetCard.tsx`, `ChartWidgets.tsx`, `widget-helpers.ts`).

**Files changed**:
- `frontend/src/components/widgets/WidgetCard.tsx` — added `timeRange` prop, `ClockIcon` import, `TimeRangeIndicator` component
- `frontend/src/components/widgets/WidgetRenderer.tsx` — resolved merge conflicts, added `timeRange={widget.timeRange}` to all `WidgetCard` call sites
- `frontend/src/components/widgets/ChartWidgets.tsx` — removed unused imports (`formatNumber`, `FORMAT_FN`) left over from refactor

**Verification**: All 56 frontend tests pass (5 test files), lint clean (0 errors).

**Debug requests, questions, and investigations:** answer or investigate first. Do not create a plan upfront — the user needs an answer, not a plan. A plan may become relevant later once the investigation reveals what needs to change.

**For all other tasks**, before writing any code, assess the scope of the actual change (not the prompt length — a one-sentence prompt can describe a large feature). Scale your approach:

- **Trivial** (typo, config tweak, single obvious change): implement directly, no plan needed.
- **Small** (a few files, clear what to do): write 2–3 sentences in `plan.md` describing what and why, then implement. No substeps.
- **Medium** (multiple components, design decisions, edge cases): write a plan in `plan.md` with requirements, affected files, key decisions, verification. Break into 3–5 steps.
- **Large** (new feature, cross-cutting, unclear scope): gather requirements and write a technical spec first (`requirements.md`, `spec.md` in `{@artifacts_path}/`). Then write `plan.md` with concrete steps referencing the spec.

**Skip planning and implement directly when** the task is trivial, or the user explicitly asks to "just do it" / gives a clear direct instruction.

To reflect the actual purpose of the first step, you can rename it to something more relevant (e.g., Planning, Investigation). Do NOT remove meta information like comments for any step.

Rule of thumb for step size: each step = a coherent unit of work (component, endpoint, test suite). Not too granular (single function), not too broad (entire feature). Unit tests are part of each step, not separate.

Update `{@artifacts_path}/plan.md`.
