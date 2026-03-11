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
