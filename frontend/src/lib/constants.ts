import type { DateRange } from "@/types/api";

export interface DateRangePreset {
  label: string;
  getRange: () => DateRange;
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  {
    label: "Last 1 hour",
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 60 * 60 * 1000);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    label: "Last 24 hours",
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    label: "Last 7 days",
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    label: "Last 30 days",
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    label: "Last 90 days",
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
];

/** Compute the default date range (last 30 days). */
export function getDefaultDateRange(): DateRange {
  const preset = DATE_RANGE_PRESETS.find((p) => p.label === "Last 30 days");
  return preset!.getRange();
}

export const AGENT_TYPE_LABELS: Record<string, string> = {
  coding: "Coding",
  review: "Code Review",
  testing: "Testing",
  ci: "CI/CD",
  debugging: "Debugging",
  general: "General",
};

export const AGENT_TYPE_COLORS: Record<string, string> = {
  coding: "#6366f1",
  review: "#8b5cf6",
  testing: "#06b6d4",
  ci: "#f59e0b",
  debugging: "#ef4444",
  general: "#64748b",
};

export const ERROR_CATEGORY_LABELS: Record<string, string> = {
  timeout: "Timeout",
  rate_limit: "Rate Limit",
  context_overflow: "Context Overflow",
  tool_error: "Tool Error",
  internal_error: "Internal Error",
};
