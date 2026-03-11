import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { postJson } from "@/api/client";
import type {
  MetricKey,
  BreakdownDimension,
  WidgetQueryResponse,
  WidgetTimeseriesResponse,
  WidgetBreakdownResponse,
} from "@/types/widget";

export interface WidgetQueryParams {
  metric: MetricKey;
  start: string;
  end: string;
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
    start: params.start,
    end: params.end,
  };
  if (params.breakdown) {
    body.breakdown = params.breakdown;
  }
  if (params.filters) {
    body.filters = params.filters;
  }

  return postJson<WidgetQueryResponse>("/api/metrics/widget", body);
}

/**
 * React Query hook for single-metric widget data.
 */
export function useWidgetData(params: WidgetQueryParams) {
  return useQuery({
    queryKey: [
      "widget",
      params.metric,
      params.start,
      params.end,
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
  // Build timestamp → { timestamp, [metric]: value, is_partial } map
  const tsMap = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < responses.length; i++) {
    const metric = metrics[i];
    const resp = responses[i];
    if (!metric || !resp) continue;
    for (const pt of resp.data) {
      let row = tsMap.get(pt.timestamp);
      if (!row) {
        row = { timestamp: pt.timestamp, is_partial: pt.is_partial };
        tsMap.set(pt.timestamp, row);
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
    data: Array.from(tsMap.values()),
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
  start: string;
  end: string;
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
        params.start,
        params.end,
        params.breakdown ?? null,
        params.filters ?? null,
      ],
      queryFn: () =>
        postWidgetQuery({
          metric,
          start: params.start,
          end: params.end,
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
