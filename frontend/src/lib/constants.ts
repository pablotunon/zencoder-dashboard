import type { Period } from "@/types/api";

export const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
];

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
