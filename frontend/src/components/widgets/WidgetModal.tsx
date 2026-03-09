import { useState, useMemo, useCallback, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  METRIC_REGISTRY,
  METRIC_BY_CATEGORY,
  BREAKDOWN_LABELS,
  breakdownModeForChartType,
} from "@/lib/widget-registry";
import { PERIOD_OPTIONS, AGENT_TYPE_LABELS } from "@/lib/constants";
import { useOrg } from "@/api/hooks";
import type { Period } from "@/types/api";
import type {
  ChartType,
  MetricKey,
  BreakdownDimension,
  WidgetConfig,
} from "@/types/widget";

// ── Chart type option cards ─────────────────────────────────────────────────

const CHART_TYPE_OPTIONS: { type: ChartType; label: string; icon: string }[] = [
  { type: "line", label: "Line", icon: "\u2571" },
  { type: "area", label: "Area", icon: "\u25B3" },
  { type: "bar", label: "Bar", icon: "\u2593" },
  { type: "pie", label: "Pie", icon: "\u25D4" },
  { type: "kpi", label: "KPI", icon: "#" },
  { type: "table", label: "Table", icon: "\u2261" },
];

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
  const [metric, setMetric] = useState<MetricKey>("run_count");
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
  const metricMeta = METRIC_REGISTRY[metric];
  const breakdownMode = breakdownModeForChartType(chartType);
  const isCompatible = metricMeta.compatibleChartTypes.includes(chartType);

  // Auto-generate title when metric or chart type changes (unless user edited it)
  const autoTitle = useMemo(() => {
    const metaLabel = METRIC_REGISTRY[metric].label;
    const chartLabel =
      CHART_TYPE_OPTIONS.find((o) => o.type === chartType)?.label ?? chartType;
    return `${metaLabel} (${chartLabel})`;
  }, [metric, chartType]);

  useEffect(() => {
    if (!titleTouched) setTitle(autoTitle);
  }, [autoTitle, titleTouched]);

  // Clear breakdown if chart type doesn't support it
  useEffect(() => {
    if (breakdownMode === "none") setBreakdown("");
  }, [breakdownMode]);

  // Ensure breakdown is set when required (pie)
  const validBreakdowns = metricMeta.validBreakdowns;

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setChartType("area");
      setMetric("run_count");
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
    if (!isCompatible) return false;
    if (breakdownMode === "required" && !breakdown) return false;
    return true;
  }, [isCompatible, breakdownMode, breakdown]);

  const handleSubmit = useCallback(() => {
    if (!isValid) return;

    const config: Omit<WidgetConfig, "id"> = {
      title: title || autoTitle,
      chartType,
      metric,
      timeRange: useGlobal ? { useGlobal: true } : { useGlobal: false, period },
    };

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
    metric,
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
            <div className="grid grid-cols-6 gap-2">
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

          {/* Metric */}
          <div>
            <label
              htmlFor="widget-metric"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Metric
            </label>
            <select
              id="widget-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as MetricKey)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {Object.entries(METRIC_BY_CATEGORY).map(([category, metrics]) => (
                <optgroup key={category} label={category}>
                  {metrics.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!isCompatible && (
              <p className="mt-1 text-xs text-amber-600">
                {metricMeta.label} is not compatible with{" "}
                {chartType} charts. Compatible:{" "}
                {metricMeta.compatibleChartTypes.join(", ")}
              </p>
            )}
          </div>

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
