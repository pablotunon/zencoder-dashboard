import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";
import type { MetricFilters, Period, AgentType } from "@/types/api";

function parseCsv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function toCsv(values: string[] | undefined): string | null {
  if (!values || values.length === 0) return null;
  return values.join(",");
}

export function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: MetricFilters = useMemo(
    () => ({
      period: (searchParams.get("period") as Period) || "30d",
      teams: parseCsv(searchParams.get("teams")),
      projects: parseCsv(searchParams.get("projects")),
      agent_types: parseCsv(searchParams.get("agent_types")) as
        | AgentType[]
        | undefined,
    }),
    [searchParams],
  );

  const setFilters = useCallback(
    (updates: Partial<MetricFilters>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (updates.period !== undefined) {
          next.set("period", updates.period ?? "30d");
        }
        if (updates.teams !== undefined) {
          const v = toCsv(updates.teams);
          if (v) next.set("teams", v);
          else next.delete("teams");
        }
        if (updates.projects !== undefined) {
          const v = toCsv(updates.projects);
          if (v) next.set("projects", v);
          else next.delete("projects");
        }
        if (updates.agent_types !== undefined) {
          const v = toCsv(updates.agent_types);
          if (v) next.set("agent_types", v);
          else next.delete("agent_types");
        }
        return next;
      });
    },
    [setSearchParams],
  );

  return { filters, setFilters };
}
