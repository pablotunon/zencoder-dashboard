import { useQuery } from "@tanstack/react-query";
import type {
  MetricKey,
  BreakdownDimension,
  WidgetQueryResponse,
} from "@/types/widget";
import type { Period } from "@/types/api";

interface WidgetQueryParams {
  metric: MetricKey;
  period: Period;
  breakdown?: BreakdownDimension;
  filters?: {
    teams?: string[];
    projects?: string[];
    agent_types?: string[];
  };
}

/**
 * POST /api/metrics/widget — the single backend endpoint for all widget data.
 */
export async function postWidgetQuery(
  params: WidgetQueryParams,
): Promise<WidgetQueryResponse> {
  const body: Record<string, unknown> = {
    metric: params.metric,
    period: params.period,
  };
  if (params.breakdown) {
    body.breakdown = params.breakdown;
  }
  if (params.filters) {
    body.filters = params.filters;
  }

  const res = await fetch("/api/metrics/widget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Widget query failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<WidgetQueryResponse>;
}

/**
 * React Query hook for widget data.
 *
 * Builds a stable query key from all parameters so identical widgets
 * share cached data automatically.
 */
export function useWidgetData(params: WidgetQueryParams) {
  return useQuery({
    queryKey: [
      "widget",
      params.metric,
      params.period,
      params.breakdown ?? null,
      params.filters ?? null,
    ],
    queryFn: () => postWidgetQuery(params),
    staleTime: 30_000,
  });
}
