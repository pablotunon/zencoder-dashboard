import logging
from datetime import datetime
from typing import Any, Literal

from app.services.clickhouse import (
    _is_current_bucket,
    get_client,
    previous_range,
    resolve_granularity,
)

logger = logging.getLogger(__name__)

MetricKey = Literal[
    "run_count",
    "active_users",
    "cost",
    "cost_per_run",
    "success_rate",
    "failure_rate",
    "error_rate",
    "latency_p50",
    "latency_p95",
    "latency_p99",
    "tokens_input",
    "tokens_output",
    "queue_wait_avg",
    "queue_wait_p95",
]

BreakdownDimension = Literal["team", "project", "agent_type", "error_category", "model"]

METRIC_REGISTRY: dict[str, dict[str, str]] = {
    "run_count":      {"expr": "count()",                                                                               "label": "Run Count"},
    "active_users":   {"expr": "uniq(user_id)",                                                                         "label": "Active Users"},
    "cost":           {"expr": "sum(cost_usd)",                                                                         "label": "Cost (USD)"},
    "cost_per_run":   {"expr": "sum(cost_usd) / greatest(count(), 1)",                                                  "label": "Cost Per Run"},
    "success_rate":   {"expr": "countIf(status = 'completed') * 100.0 / greatest(count(), 1)",                          "label": "Success Rate"},
    "failure_rate":   {"expr": "countIf(status = 'failed') * 100.0 / greatest(count(), 1)",                             "label": "Failure Rate"},
    "error_rate":     {"expr": "countIf(status = 'failed' AND error_category IS NOT NULL) * 100.0 / greatest(count(), 1)", "label": "Error Rate"},
    "latency_p50":    {"expr": "quantile(0.5)(duration_ms)",                                                            "label": "Latency P50"},
    "latency_p95":    {"expr": "quantile(0.95)(duration_ms)",                                                           "label": "Latency P95"},
    "latency_p99":    {"expr": "quantile(0.99)(duration_ms)",                                                           "label": "Latency P99"},
    "tokens_input":   {"expr": "sum(tokens_input)",                                                                     "label": "Input Tokens"},
    "tokens_output":  {"expr": "sum(tokens_output)",                                                                    "label": "Output Tokens"},
    "queue_wait_avg": {"expr": "avg(queue_wait_ms)",                                                                    "label": "Avg Queue Wait"},
    "queue_wait_p95": {"expr": "quantile(0.95)(queue_wait_ms)",                                                         "label": "Queue Wait P95"},
}

DIMENSION_REGISTRY: dict[str, dict[str, str]] = {
    "team":           {"column": "team_id",        "label": "Team"},
    "project":        {"column": "project_id",     "label": "Project"},
    "agent_type":     {"column": "agent_type",     "label": "Agent Type"},
    "error_category": {"column": "error_category", "label": "Error Category"},
    "model":          {"column": "model",          "label": "Model"},
}


def _build_filter_clause(
    filters: dict[str, list[str] | None] | None,
) -> tuple[str, dict[str, Any]]:
    """Build WHERE clause fragment and params dict from widget filters."""
    if not filters:
        return "", {}

    clauses: list[str] = []
    params: dict[str, Any] = {}

    if filters.get("teams"):
        clauses.append("team_id IN %(team_ids)s")
        params["team_ids"] = filters["teams"]

    if filters.get("projects"):
        clauses.append("project_id IN %(project_ids)s")
        params["project_ids"] = filters["projects"]

    if filters.get("agent_types"):
        clauses.append("agent_type IN %(agent_types)s")
        params["agent_types"] = filters["agent_types"]

    return (" AND " + " AND ".join(clauses) if clauses else ""), params


def _query_aggregate(
    org_id: str,
    metric_expr: str,
    start: datetime,
    end: datetime,
    extra_where: str,
    extra_params: dict[str, Any],
) -> float:
    """Run an aggregate query and return the single scalar value."""
    client = get_client()
    sql = f"""
        SELECT {metric_expr} AS value
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
          {extra_where}
    """
    result = client.query(
        sql,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return float(result.first_row[0]) if result.first_row[0] is not None else 0.0


def build_widget_query(
    org_id: str,
    metric: str,
    start: datetime,
    end: datetime,
    breakdown: str | None = None,
    filters: dict[str, list[str] | None] | None = None,
) -> dict[str, Any]:
    """Execute a dynamic widget query and return the response payload.

    Returns either a timeseries response (no breakdown) or a breakdown response.
    Timeseries responses include a summary with the aggregate value and change %.
    """
    metric_entry = METRIC_REGISTRY[metric]
    metric_expr = metric_entry["expr"]

    extra_where, extra_params = _build_filter_clause(filters)

    client = get_client()

    if breakdown:
        dimension_col = DIMENSION_REGISTRY[breakdown]["column"]
        sql = f"""
            SELECT
                {dimension_col} AS label,
                {metric_expr} AS value
            FROM agent_runs
            WHERE org_id = %(org_id)s
              AND started_at >= %(start)s
              AND started_at < %(end)s
              {extra_where}
            GROUP BY label
            ORDER BY value DESC
        """
        result = client.query(
            sql,
            parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
        )
        data = [
            {"label": str(row[0]) if row[0] is not None else "unknown", "value": round(float(row[1]), 2)}
            for row in result.result_rows
        ]
        return {
            "type": "breakdown",
            "metric": metric,
            "dimension": breakdown,
            "data": data,
        }

    # Time-series query (no breakdown) with dynamic bucketing
    bucket_fn, granularity = resolve_granularity(start, end)
    sql = f"""
        SELECT
            {bucket_fn} AS timestamp,
            {metric_expr} AS value
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
          {extra_where}
        GROUP BY timestamp
        ORDER BY timestamp
    """
    result = client.query(
        sql,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    data = [
        {
            "timestamp": str(row[0]),
            "value": round(float(row[1]), 2),
            "is_partial": _is_current_bucket(row[0], granularity),
        }
        for row in result.result_rows
    ]

    # Summary: aggregate over the current period
    current_value = _query_aggregate(org_id, metric_expr, start, end, extra_where, extra_params)

    # Change %: compare against the previous period
    prev_start, prev_end = previous_range(start, end)
    prev_value = _query_aggregate(org_id, metric_expr, prev_start, prev_end, extra_where, extra_params)

    change_pct = None
    if prev_value != 0:
        change_pct = round(((current_value - prev_value) / prev_value) * 100, 1)

    return {
        "type": "timeseries",
        "metric": metric,
        "granularity": granularity,
        "summary": {"value": round(current_value, 2), "change_pct": change_pct},
        "data": data,
    }
