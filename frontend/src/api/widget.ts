import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { postJson } from "@/api/client";
import type { Granularity } from "@/types/api";
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

// ── Batch multi-metric support ──────────────────────────────────────────

export interface BatchWidgetQueryParams {
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

export interface BatchWidgetQueryResponse {
  results: Record<string, WidgetQueryResponse>;
}

/**
 * POST /api/metrics/widget/batch — fetch multiple metrics in a single request.
 */
export async function postBatchWidgetQuery(
  params: BatchWidgetQueryParams,
): Promise<BatchWidgetQueryResponse> {
  const body: Record<string, unknown> = {
    metrics: params.metrics,
    start: params.start,
    end: params.end,
  };
  if (params.breakdown) {
    body.breakdown = params.breakdown;
  }
  if (params.filters) {
    body.filters = params.filters;
  }

  return postJson<BatchWidgetQueryResponse>("/api/metrics/widget/batch", body);
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
  granularity: Granularity;
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
    granularity: responses[0]?.granularity ?? "day",
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
 * Uses the batch endpoint to fetch all metrics in a single request,
 * then merges results client-side.
 */
export function useMultiMetricWidgetData(params: MultiMetricParams) {
  const query = useQuery({
    queryKey: [
      "widget-batch",
      params.metrics,
      params.start,
      params.end,
      params.breakdown ?? null,
      params.filters ?? null,
    ],
    queryFn: () =>
      postBatchWidgetQuery({
        metrics: params.metrics,
        start: params.start,
        end: params.end,
        breakdown: params.breakdown,
        filters: params.filters,
      }),
    staleTime: 30_000,
  });

  const data = useMemo<MergedWidgetData | undefined>(() => {
    if (!query.data) return undefined;
    const responses = params.metrics.map((m) => query.data!.results[m]);

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
  }, [query.data, params.metrics]);

  return {
    data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
