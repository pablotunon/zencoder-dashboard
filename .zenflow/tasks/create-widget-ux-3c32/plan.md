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
<!-- chat-id: 5ba4d031-8001-4b73-9306-93405c697a68 -->

#### Investigation findings

The stat chart had **zero compatible metrics** in the frontend `METRIC_REGISTRY` — no metric's `compatibleChartTypes` array included `"stat"`. The gauge chart only had `"cost"`. Both chart renderers (`OrgMetricWidgets.tsx`) work with any metric that produces timeseries data, so this was a registry oversight.

The metric dropdown in `WidgetModal.tsx` showed all metrics identically with no visual distinction between compatible and incompatible options. Incompatibility only appeared as a warning *after* selection, leaving users confused — especially for stat where nothing worked.

#### Changes made

**Bug fix — `widget-registry.ts`:** All 16 metrics now list all 8 user-creatable chart types (`line`, `area`, `bar`, `kpi`, `pie`, `table`, `gauge`, `stat`) in `compatibleChartTypes`. The backend has no chart-type restrictions (any metric works with any query shape), and the frontend rendering code handles all metrics generically per chart type. The previous selective compatibility was an oversight that created inconsistencies (e.g., `error_rate` had `bar`/`pie`/`table` but `success_rate` didn't).

**UX improvement — `WidgetModal.tsx`:**
- Metric dropdown now shows compatible metrics first, with incompatible ones grayed out (`disabled`) and labeled "(not available)" at the bottom of each category group.
- When switching chart types, any currently selected incompatible metric is automatically swapped to the first compatible one, preventing a broken form state.
- Removed the post-selection incompatibility warning since users can no longer select incompatible metrics.

**Sealed widgets in create modal — `WidgetModal.tsx` + `widget-registry.ts`:**
- Sealed chart types (Users Trend, Top Users) now appear in the chart type picker under a "Templates" separator at the bottom.
- When a sealed type is selected, all metric/breakdown/filter form fields are hidden and a hint explains it's a pre-built template.
- Only time range and title fields remain visible for sealed types.
- Validation auto-passes for sealed types; submit sends an empty metrics array.

#### Verification
- All 56 frontend tests pass
- 0 lint errors (3 pre-existing warnings unchanged)
