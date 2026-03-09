import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  MetricKey,
  BreakdownDimension,
  WidgetQueryResponse,
  WidgetTimeseriesResponse,
  WidgetBreakdownResponse,
} from "@/types/widget";
import type { Period } from "@/types/api";

export interface WidgetQueryParams {
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
 * React Query hook for single-metric widget data.
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

// ── Multi-metric support ──────────────────────────────────────────────────

/** Merged time-series: each data point has a value per metric key. */
export interface MergedTimeseriesData {
  type: "merged_timeseries";
  metrics: MetricKey[];
  summaries: Record<MetricKey, { value: number; change_pct: number | null }>;
  data: Record<string, unknown>[];
}

/** Merged breakdown: each row has a value per metric key. */
export interface MergedBreakdownData {
  type: "merged_breakdown";
  metrics: MetricKey[];
  dimension: string;
  data: Record<string, unknown>[];
}

export type MergedWidgetData = MergedTimeseriesData | MergedBreakdownData;

function mergeTimeSeries(
  metrics: MetricKey[],
  responses: WidgetTimeseriesResponse[],
): MergedTimeseriesData {
  // Build date → { date, [metric]: value, is_partial } map
  const dateMap = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < responses.length; i++) {
    const metric = metrics[i];
    const resp = responses[i];
    if (!metric || !resp) continue;
    for (const pt of resp.data) {
      let row = dateMap.get(pt.date);
      if (!row) {
        row = { date: pt.date, is_partial: pt.is_partial };
        dateMap.set(pt.date, row);
      }
      row[metric] = pt.value;
      if (pt.is_partial) row.is_partial = true;
    }
  }

  const summaries = {} as Record<MetricKey, { value: number; change_pct: number | null }>;
  for (let i = 0; i < responses.length; i++) {
    const metric = metrics[i];
    const resp = responses[i];
    if (metric && resp) {
      summaries[metric] = resp.summary;
    }
  }

  return {
    type: "merged_timeseries",
    metrics,
    summaries,
    data: Array.from(dateMap.values()),
  };
}

function mergeBreakdowns(
  metrics: MetricKey[],
  responses: WidgetBreakdownResponse[],
): MergedBreakdownData {
  // Build label → { label, [metric]: value } map
  const labelMap = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < responses.length; i++) {
    const metric = metrics[i];
    const resp = responses[i];
    if (!metric || !resp) continue;
    for (const item of resp.data) {
      let row = labelMap.get(item.label);
      if (!row) {
        row = { label: item.label };
        labelMap.set(item.label, row);
      }
      row[metric] = item.value;
    }
  }

  return {
    type: "merged_breakdown",
    metrics,
    dimension: responses[0]?.dimension ?? "",
    data: Array.from(labelMap.values()),
  };
}

interface MultiMetricParams {
  metrics: MetricKey[];
  period: Period;
  breakdown?: BreakdownDimension;
  filters?: {
    teams?: string[];
    projects?: string[];
    agent_types?: string[];
  };
}

/**
 * React Query hook for multi-metric widget data.
 * Fires parallel queries for each metric and merges results.
 */
export function useMultiMetricWidgetData(params: MultiMetricParams) {
  const queries = useQueries({
    queries: params.metrics.map((metric) => ({
      queryKey: [
        "widget",
        metric,
        params.period,
        params.breakdown ?? null,
        params.filters ?? null,
      ],
      queryFn: () =>
        postWidgetQuery({
          metric,
          period: params.period,
          breakdown: params.breakdown,
          filters: params.filters,
        }),
      staleTime: 30_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;
  const allReady = queries.every((q) => q.data);

  const data = useMemo<MergedWidgetData | undefined>(() => {
    if (!allReady) return undefined;
    const responses = queries.map((q) => q.data!);

    // Determine data type from first response
    if (responses[0]?.type === "timeseries") {
      return mergeTimeSeries(
        params.metrics,
        responses as WidgetTimeseriesResponse[],
      );
    }
    if (responses[0]?.type === "breakdown") {
      return mergeBreakdowns(
        params.metrics,
        responses as WidgetBreakdownResponse[],
      );
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReady, ...queries.map((q) => q.data)]);

  const refetch = () => queries.forEach((q) => q.refetch());

  return { data, isLoading, error, refetch };
}
