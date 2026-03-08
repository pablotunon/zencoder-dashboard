import { useOrg } from "@/api/hooks";
import { useFilters } from "@/hooks/useFilters";
import { PERIOD_OPTIONS, AGENT_TYPE_LABELS } from "@/lib/constants";
import type { Period, AgentType } from "@/types/api";

export function FilterBar() {
  const { filters, setFilters } = useFilters();
  const { data: org } = useOrg();

  const teams = org?.teams ?? [];
  const agentTypes = Object.entries(AGENT_TYPE_LABELS);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
      {/* Period selector */}
      <select
        value={filters.period ?? "30d"}
        onChange={(e) => setFilters({ period: e.target.value as Period })}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {PERIOD_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Team filter */}
      <select
        value={filters.teams?.[0] ?? ""}
        onChange={(e) =>
          setFilters({
            teams: e.target.value ? [e.target.value] : undefined,
          })
        }
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">All Teams</option>
        {teams.map((t) => (
          <option key={t.team_id} value={t.slug}>
            {t.name}
          </option>
        ))}
      </select>

      {/* Agent type filter */}
      <select
        value={filters.agent_types?.[0] ?? ""}
        onChange={(e) =>
          setFilters({
            agent_types: e.target.value
              ? [e.target.value as AgentType]
              : undefined,
          })
        }
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">All Agent Types</option>
        {agentTypes.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Clear filters */}
      {(filters.teams || filters.agent_types || filters.period !== "30d") && (
        <button
          onClick={() =>
            setFilters({
              period: "30d",
              teams: undefined,
              agent_types: undefined,
              projects: undefined,
            })
          }
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
