import { XMarkIcon, InformationCircleIcon, FunnelIcon, ClockIcon } from "@heroicons/react/24/outline";
import { AGENT_TYPE_LABELS } from "@/lib/constants";
import { useOrg } from "@/api/hooks";
import { Skeleton } from "@/components/ui/Skeleton";
import type { WidgetConfig } from "@/types/widget";

export function WidgetCard({
  title,
  subtitle,
  tooltip,
  filters,
  timeRange,
  onRemove,
  children,
}: {
  title: string;
  subtitle?: string;
  tooltip?: string;
  filters?: WidgetConfig["filters"];
  timeRange?: WidgetConfig["timeRange"];
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-medium text-gray-900">{title}</h2>
            {tooltip && (
              <div className="group relative">
                <InformationCircleIcon className="h-4 w-4 shrink-0 text-gray-400 hover:text-gray-600" />
                <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-64 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg group-hover:block">
                  {tooltip}
                </div>
              </div>
            )}
            <FilterIndicator filters={filters} />
            <TimeRangeIndicator timeRange={timeRange} />
          </div>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Remove widget"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function FilterIndicator({
  filters,
}: {
  filters?: WidgetConfig["filters"];
}) {
  const { data: org } = useOrg();

  const hasFilters =
    filters &&
    ((filters.teams?.length ?? 0) > 0 ||
      (filters.projects?.length ?? 0) > 0 ||
      (filters.agent_types?.length ?? 0) > 0);

  if (!hasFilters) return null;

  const teamNames = (filters.teams ?? []).map((id) => {
    const team = org?.teams?.find((t) => t.team_id === id);
    return team?.name ?? id;
  });

  const projectNames = (filters.projects ?? []).map((id) => {
    const project = org?.projects?.find((p) => p.project_id === id);
    return project?.name ?? id;
  });

  const agentTypeNames = (filters.agent_types ?? []).map(
    (key) => AGENT_TYPE_LABELS[key] ?? key,
  );

  return (
    <div className="group relative">
      <FunnelIcon className="h-4 w-4 shrink-0 text-indigo-400 hover:text-indigo-600" />
      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-56 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg group-hover:block">
        <p className="mb-1.5 font-medium text-gray-900">Active Filters</p>
        {teamNames.length > 0 && (
          <p>
            <span className="font-medium text-gray-700">Teams:</span>{" "}
            {teamNames.join(", ")}
          </p>
        )}
        {projectNames.length > 0 && (
          <p>
            <span className="font-medium text-gray-700">Projects:</span>{" "}
            {projectNames.join(", ")}
          </p>
        )}
        {agentTypeNames.length > 0 && (
          <p>
            <span className="font-medium text-gray-700">Agent Types:</span>{" "}
            {agentTypeNames.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Custom time range indicator (clock icon + hover tooltip) ─────────────

function formatTimeRangeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${d.getFullYear()}`;
}

function TimeRangeIndicator({
  timeRange,
}: {
  timeRange?: WidgetConfig["timeRange"];
}) {
  if (!timeRange || timeRange.useGlobal) return null;

  return (
    <div className="group relative">
      <ClockIcon className="h-4 w-4 shrink-0 text-amber-400 hover:text-amber-600" />
      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-56 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg group-hover:block">
        <p className="mb-1.5 font-medium text-gray-900">Custom Time Range</p>
        <p>
          <span className="font-medium text-gray-700">From:</span>{" "}
          {formatTimeRangeDate(timeRange.start)}
        </p>
        <p>
          <span className="font-medium text-gray-700">To:</span>{" "}
          {formatTimeRangeDate(timeRange.end)}
        </p>
      </div>
    </div>
  );
}

export function WidgetSkeleton({ chartType }: { chartType: string }) {
  if (chartType === "kpi" || chartType === "gauge" || chartType === "stat") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }
  if (chartType === "table" || chartType === "top_users") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  return <Skeleton className="h-64 w-full" />;
}
