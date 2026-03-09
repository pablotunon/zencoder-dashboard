import { useState, useMemo, useCallback, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  METRIC_REGISTRY,
  METRIC_BY_CATEGORY,
  BREAKDOWN_LABELS,
  CHART_TYPE_META,
  MAX_METRICS,
  ORG_METRIC_LABELS,
  breakdownModeForChartType,
  requiresOrgMetric,
} from "@/lib/widget-registry";
import { PERIOD_OPTIONS, AGENT_TYPE_LABELS } from "@/lib/constants";
import { useOrg } from "@/api/hooks";
import type { Period } from "@/types/api";
import type {
  ChartType,
  MetricKey,
  OrgMetricKey,
  BreakdownDimension,
  WidgetConfig,
} from "@/types/widget";

// ── Chart type option cards (user-creatable only) ────────────────────────────

const CHART_TYPE_OPTIONS = (
  Object.entries(CHART_TYPE_META) as [ChartType, (typeof CHART_TYPE_META)[ChartType]][]
)
  .filter(([, meta]) => meta.userCreatable)
  .map(([type, meta]) => ({ type, label: meta.label, icon: meta.icon }));

// ── Props ───────────────────────────────────────────────────────────────────

interface WidgetModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (config: Omit<WidgetConfig, "id">) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function WidgetModal({ open, onClose, onAdd }: WidgetModalProps) {
  const { data: org } = useOrg();

  // Form state
  const [chartType, setChartType] = useState<ChartType>("area");
  const [metrics, setMetrics] = useState<(MetricKey | "")[]>(["run_count"]);
  const [orgMetric, setOrgMetric] = useState<OrgMetricKey | "">("monthly_budget");
  const [breakdown, setBreakdown] = useState<BreakdownDimension | "">("");
  const [useGlobal, setUseGlobal] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterTeams, setFilterTeams] = useState<string[]>([]);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterAgentTypes, setFilterAgentTypes] = useState<string[]>([]);

  // Derived
  const primaryMetric = metrics[0] as MetricKey | "";
  const metricMeta = primaryMetric ? METRIC_REGISTRY[primaryMetric] : null;
  const breakdownMode = breakdownModeForChartType(chartType);
  const maxMetrics = MAX_METRICS[chartType];
  const needsOrgMetric = requiresOrgMetric(chartType);

  const isCompatible =
    metricMeta !== null && metricMeta.compatibleChartTypes.includes(chartType);

  // Adjust metrics array length when chart type changes
  useEffect(() => {
    setMetrics((prev) => {
      const capped = prev.slice(0, Math.max(maxMetrics, 1));
      // Ensure at least one slot
      if (capped.length === 0) return ["run_count"];
      return capped;
    });
  }, [maxMetrics]);

  const setMetricAt = useCallback((index: number, value: MetricKey | "") => {
    setMetrics((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  // Auto-generate title
  const autoTitle = useMemo(() => {
    const labels = metrics
      .filter((m): m is MetricKey => m !== "")
      .map((m) => METRIC_REGISTRY[m].label);
    const chartLabel = CHART_TYPE_META[chartType]?.label ?? chartType;
    return labels.length > 0
      ? `${labels.join(", ")} (${chartLabel})`
      : chartLabel;
  }, [metrics, chartType]);

  useEffect(() => {
    if (!titleTouched) setTitle(autoTitle);
  }, [autoTitle, titleTouched]);

  // Clear breakdown if chart type doesn't support it
  useEffect(() => {
    if (breakdownMode === "none") setBreakdown("");
  }, [breakdownMode]);

  const validBreakdowns = metricMeta?.validBreakdowns ?? [];

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setChartType("area");
      setMetrics(["run_count"]);
      setOrgMetric("monthly_budget");
      setBreakdown("");
      setUseGlobal(true);
      setPeriod("30d");
      setTitle("");
      setTitleTouched(false);
      setShowFilters(false);
      setFilterTeams([]);
      setFilterProjects([]);
      setFilterAgentTypes([]);
    }
  }, [open]);

  // Validation
  const isValid = useMemo(() => {
    if (!primaryMetric || !isCompatible) return false;
    if (breakdownMode === "required" && !breakdown) return false;
    if (needsOrgMetric && !orgMetric) return false;
    return true;
  }, [primaryMetric, isCompatible, breakdownMode, breakdown, needsOrgMetric, orgMetric]);

  const handleSubmit = useCallback(() => {
    if (!isValid) return;

    const activeMetrics = metrics.filter((m): m is MetricKey => m !== "");
    if (activeMetrics.length === 0) return;

    const config: Omit<WidgetConfig, "id"> = {
      title: title || autoTitle,
      chartType,
      metrics: activeMetrics,
      timeRange: useGlobal ? { useGlobal: true } : { useGlobal: false, period },
    };

    if (needsOrgMetric && orgMetric) {
      config.orgMetric = orgMetric as OrgMetricKey;
    }

    if (breakdown) {
      config.breakdownDimension = breakdown as BreakdownDimension;
    }

    const hasFilters =
      filterTeams.length > 0 ||
      filterProjects.length > 0 ||
      filterAgentTypes.length > 0;
    if (hasFilters) {
      config.filters = {};
      if (filterTeams.length > 0) config.filters.teams = filterTeams;
      if (filterProjects.length > 0) config.filters.projects = filterProjects;
      if (filterAgentTypes.length > 0)
        config.filters.agent_types = filterAgentTypes;
    }

    onAdd(config);
    onClose();
  }, [
    isValid,
    title,
    autoTitle,
    chartType,
    metrics,
    orgMetric,
    needsOrgMetric,
    breakdown,
    useGlobal,
    period,
    filterTeams,
    filterProjects,
    filterAgentTypes,
    onAdd,
    onClose,
  ]);

  if (!open) return null;

  const teams = org?.teams ?? [];
  const projects = org?.projects ?? [];
  const agentTypes = Object.entries(AGENT_TYPE_LABELS);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Add Widget
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* Chart type */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">
              Chart Type
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {CHART_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setChartType(opt.type)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-3 text-xs font-medium transition-colors ${
                    chartType === opt.type
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <span className="text-lg leading-none">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Metrics — primary + optional extras */}
          {maxMetrics > 0 && (
            <div className="space-y-2">
              {Array.from({ length: Math.min(maxMetrics, 5) }).map((_, i) => {
                const isRequired = i === 0;
                const currentVal = metrics[i] ?? "";
                return (
                  <div key={i}>
                    <label
                      htmlFor={`widget-metric-${i}`}
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      {isRequired
                        ? "Metric"
                        : `Metric ${i + 1} (optional)`}
                    </label>
                    <select
                      id={`widget-metric-${i}`}
                      value={currentVal}
                      onChange={(e) =>
                        setMetricAt(i, e.target.value as MetricKey | "")
                      }
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {!isRequired && <option value="">None</option>}
                      {Object.entries(METRIC_BY_CATEGORY).map(
                        ([category, catMetrics]) => (
                          <optgroup key={category} label={category}>
                            {catMetrics.map((m) => (
                              <option key={m.key} value={m.key}>
                                {m.label}
                              </option>
                            ))}
                          </optgroup>
                        ),
                      )}
                    </select>
                    {i === 0 && !isCompatible && metricMeta && (
                      <p className="mt-1 text-xs text-amber-600">
                        {metricMeta.label} is not compatible with{" "}
                        {chartType} charts. Compatible:{" "}
                        {metricMeta.compatibleChartTypes.join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Org metric (gauge/stat) */}
          {needsOrgMetric && (
            <div>
              <label
                htmlFor="widget-org-metric"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Target (Org Value)
                <span className="ml-1 text-red-500">*</span>
              </label>
              <select
                id="widget-org-metric"
                value={orgMetric}
                onChange={(e) => setOrgMetric(e.target.value as OrgMetricKey | "")}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="" disabled>
                  Select target...
                </option>
                {(Object.entries(ORG_METRIC_LABELS) as [OrgMetricKey, string][]).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}

          {/* Breakdown dimension (contextual) */}
          {breakdownMode !== "none" && (
            <div>
              <label
                htmlFor="widget-breakdown"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Breakdown Dimension
                {breakdownMode === "required" && (
                  <span className="ml-1 text-red-500">*</span>
                )}
              </label>
              <select
                id="widget-breakdown"
                value={breakdown}
                onChange={(e) =>
                  setBreakdown(e.target.value as BreakdownDimension | "")
                }
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {breakdownMode === "optional" && (
                  <option value="">None (time series)</option>
                )}
                {breakdownMode === "required" && (
                  <option value="" disabled>
                    Select a dimension...
                  </option>
                )}
                {validBreakdowns.map((dim) => (
                  <option key={dim} value={dim}>
                    {BREAKDOWN_LABELS[dim]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time range */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Time Range
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={useGlobal}
                  onChange={(e) => setUseGlobal(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Use global
              </label>
            </div>
            {!useGlobal && (
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Filters (expandable) */}
          <div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {showFilters ? "- Hide Filters" : "+ Add Filters"}
            </button>

            {showFilters && (
              <div className="mt-3 space-y-3 rounded-lg border border-gray-200 p-3">
                {/* Team filter */}
                <div>
                  <label
                    htmlFor="widget-filter-team"
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Team
                  </label>
                  <select
                    id="widget-filter-team"
                    multiple
                    value={filterTeams}
                    onChange={(e) =>
                      setFilterTeams(
                        Array.from(
                          e.target.selectedOptions,
                          (o) => o.value,
                        ),
                      )
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    size={Math.min(teams.length || 1, 4)}
                  >
                    {teams.map((t) => (
                      <option key={t.team_id} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Project filter */}
                <div>
                  <label
                    htmlFor="widget-filter-project"
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Project
                  </label>
                  <select
                    id="widget-filter-project"
                    multiple
                    value={filterProjects}
                    onChange={(e) =>
                      setFilterProjects(
                        Array.from(
                          e.target.selectedOptions,
                          (o) => o.value,
                        ),
                      )
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    size={Math.min(projects.length || 1, 4)}
                  >
                    {projects.map((p) => (
                      <option key={p.project_id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Agent type filter */}
                <div>
                  <label
                    htmlFor="widget-filter-agent-type"
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Agent Type
                  </label>
                  <select
                    id="widget-filter-agent-type"
                    multiple
                    value={filterAgentTypes}
                    onChange={(e) =>
                      setFilterAgentTypes(
                        Array.from(
                          e.target.selectedOptions,
                          (o) => o.value,
                        ),
                      )
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    size={Math.min(agentTypes.length, 4)}
                  >
                    {agentTypes.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label
              htmlFor="widget-title"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Title
            </label>
            <input
              id="widget-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder={autoTitle}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Widget
          </button>
        </div>
      </div>
    </div>
  );
}
