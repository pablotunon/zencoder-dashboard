import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Literal

import clickhouse_connect
from clickhouse_connect.driver.client import Client

from app.config import settings
from app.models.requests import MetricFilters

Granularity = Literal["minute", "hour", "day", "week"]

BUCKET_FUNCTIONS: dict[Granularity, str] = {
    "minute": "toStartOfMinute(started_at)",
    "hour": "toStartOfHour(started_at)",
    "day": "toDate(started_at)",
    "week": "toStartOfWeek(started_at)",
}


def resolve_granularity(start: datetime, end: datetime) -> tuple[str, Granularity]:
    """Pick a ClickHouse bucket function based on range span.

    Returns (bucket_sql_expression, granularity_label).
    """
    span = end - start
    hours = span.total_seconds() / 3600

    if hours <= 6:
        g: Granularity = "minute"
    elif hours <= 48:
        g = "hour"
    elif span.days <= 90:
        g = "day"
    else:
        g = "week"

    return BUCKET_FUNCTIONS[g], g


def previous_range(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    """Shift a range back by its own duration for change-% calculation."""
    duration = end - start
    return start - duration, start


def _is_current_bucket(timestamp: datetime | date | str, granularity: Granularity) -> bool:
    """Check if a bucket timestamp represents the current (partial) bucket."""
    now = datetime.now(timezone.utc)

    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp)
        except ValueError:
            timestamp = datetime.combine(date.fromisoformat(timestamp), datetime.min.time(), tzinfo=timezone.utc)

    if isinstance(timestamp, date) and not isinstance(timestamp, datetime):
        timestamp = datetime.combine(timestamp, datetime.min.time(), tzinfo=timezone.utc)

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    if granularity == "minute":
        return timestamp >= now.replace(second=0, microsecond=0)
    elif granularity == "hour":
        return timestamp >= now.replace(minute=0, second=0, microsecond=0)
    elif granularity == "day":
        return timestamp.date() >= now.date()
    else:  # week
        # Current week: Monday of this week
        days_since_monday = now.weekday()
        week_start = (now - timedelta(days=days_since_monday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return timestamp >= week_start


logger = logging.getLogger(__name__)

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = clickhouse_connect.get_client(
            host=settings.clickhouse_host,
            port=settings.clickhouse_port,
            database=settings.clickhouse_db,
            username=settings.clickhouse_user,
            password=settings.clickhouse_password,
        )
    return _client


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def build_filter_clause(
    filters: MetricFilters | dict[str, list[str] | None] | None,
    table_prefix: str = "",
) -> tuple[str, dict[str, Any]]:
    """Build WHERE clause fragment and params for team/project/agent_type filters.

    Accepts either a MetricFilters model or a plain dict (from widget requests).
    """
    if not filters:
        return "", {}

    # Normalise to dict access
    if isinstance(filters, dict):
        teams = filters.get("teams")
        projects = filters.get("projects")
        agent_types = filters.get("agent_types")
    else:
        teams = filters.teams
        projects = filters.projects
        agent_types = filters.agent_types

    clauses: list[str] = []
    params: dict[str, Any] = {}
    prefix = f"{table_prefix}." if table_prefix else ""

    if teams:
        clauses.append(f"{prefix}team_id IN %(team_ids)s")
        params["team_ids"] = teams

    if projects:
        clauses.append(f"{prefix}project_id IN %(project_ids)s")
        params["project_ids"] = projects

    if agent_types:
        clauses.append(f"{prefix}agent_type IN %(agent_types)s")
        params["agent_types"] = agent_types

    return (" AND " + " AND ".join(clauses) if clauses else ""), params


# ---------------------------------------------------------------------------
# Generic query helpers
# ---------------------------------------------------------------------------

RowMapper = Callable[[tuple], dict[str, Any]]


def _query_timeseries(
    org_id: str,
    filters: MetricFilters,
    select_exprs: str,
    row_mapper: RowMapper,
    extra_where_literal: str = "",
) -> dict[str, Any]:
    """Run a bucketed time-series query and return {granularity, data}.

    ``select_exprs`` are the SELECT columns *after* the timestamp bucket,
    e.g. ``"count() AS runs, sum(cost_usd) AS cost"``.

    ``row_mapper`` converts a result row (tuple starting at index 1, after
    timestamp) into a dict.  The helper adds ``timestamp`` and ``is_partial``
    automatically.

    ``extra_where_literal`` allows injecting additional fixed WHERE clauses
    like ``AND duration_ms > 0``.
    """
    client = get_client()
    start, end = filters.start, filters.end
    bucket_fn, granularity = resolve_granularity(start, end)
    extra_where, extra_params = build_filter_clause(filters)

    query = f"""
        SELECT
            {bucket_fn} AS timestamp,
            {select_exprs}
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
          {extra_where_literal}
          {extra_where}
        GROUP BY timestamp
        ORDER BY timestamp
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return {
        "granularity": granularity,
        "data": [
            {
                "timestamp": str(row[0]),
                **row_mapper(row),
                "is_partial": _is_current_bucket(row[0], granularity),
            }
            for row in result.result_rows
        ],
    }


def _query_breakdown(
    org_id: str,
    filters: MetricFilters,
    group_col: str,
    select_exprs: str,
    row_mapper: RowMapper,
    order_by: str = "2 DESC",
    extra_where_literal: str = "",
) -> list[dict[str, Any]]:
    """Run a grouped breakdown query and return a list of dicts.

    ``group_col`` is the column to GROUP BY (e.g. ``"team_id"``).
    ``select_exprs`` are columns after the group column.
    ``row_mapper`` converts a full result row into the output dict.
    """
    client = get_client()
    start, end = filters.start, filters.end
    extra_where, extra_params = build_filter_clause(filters)

    query = f"""
        SELECT
            {group_col},
            {select_exprs}
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
          {extra_where_literal}
          {extra_where}
        GROUP BY {group_col}
        ORDER BY {order_by}
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [row_mapper(row) for row in result.result_rows]


# ---------------------------------------------------------------------------
# Overview queries
# ---------------------------------------------------------------------------


def query_overview_kpis(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    client = get_client()
    start, end = filters.start, filters.end
    prev_start, prev_end = previous_range(start, end)
    extra_where, extra_params = build_filter_clause(filters)

    base_query = """
        SELECT
            count() AS total_runs,
            uniq(user_id) AS active_users,
            sum(cost_usd) AS total_cost,
            countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
    """
    base_query += extra_where

    current = client.query(
        base_query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    prev = client.query(
        base_query,
        parameters={"org_id": org_id, "start": prev_start, "end": prev_end, **extra_params},
    )

    cr = current.first_row
    pr = prev.first_row

    def pct_change(curr: float, prev_val: float) -> float | None:
        if prev_val == 0:
            return None
        return round(((curr - prev_val) / prev_val) * 100, 1)

    return {
        "total_runs": cr[0],
        "active_users": cr[1],
        "total_cost": round(float(cr[2]), 2),
        "success_rate": round(float(cr[3]), 1),
        "total_runs_change": pct_change(cr[0], pr[0]),
        "active_users_change": pct_change(cr[1], pr[1]),
        "total_cost_change": pct_change(float(cr[2]), float(pr[2])),
        "success_rate_change": pct_change(float(cr[3]), float(pr[3])),
    }


def query_usage_trend(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    return _query_timeseries(
        org_id, filters,
        select_exprs="count() AS runs, sum(cost_usd) AS cost",
        row_mapper=lambda row: {
            "runs": row[1],
            "cost": round(float(row[2]), 2),
        },
    )


def query_team_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    return _query_breakdown(
        org_id, filters,
        group_col="team_id",
        select_exprs="""count() AS runs,
            uniq(user_id) AS active_users,
            sum(cost_usd) AS cost,
            countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate""",
        row_mapper=lambda row: {
            "team_id": row[0],
            "runs": row[1],
            "active_users": row[2],
            "cost": round(float(row[3]), 2),
            "success_rate": round(float(row[4]), 1),
        },
        order_by="runs DESC",
    )


# ---------------------------------------------------------------------------
# Usage queries
# ---------------------------------------------------------------------------


def query_active_users_trend(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    """Compute DAU/WAU/MAU trend entirely in ClickHouse using sub-queries."""
    client = get_client()
    start, end = filters.start, filters.end
    bucket_fn, granularity = resolve_granularity(start, end)
    extra_where, extra_params = build_filter_clause(filters)

    # WAU/MAU need a wider lookback window
    wau_start = start - timedelta(days=6)
    mau_start = start - timedelta(days=29)

    query = f"""
        SELECT
            t.timestamp,
            t.dau,
            wau.wau,
            mau.mau
        FROM (
            SELECT
                {bucket_fn} AS timestamp,
                uniq(user_id) AS dau
            FROM agent_runs
            WHERE org_id = %(org_id)s
              AND started_at >= %(start)s
              AND started_at < %(end)s
              {extra_where}
            GROUP BY timestamp
            ORDER BY timestamp
        ) AS t
        LEFT JOIN (
            SELECT
                b.timestamp,
                uniq(r.user_id) AS wau
            FROM (
                SELECT DISTINCT {bucket_fn} AS timestamp
                FROM agent_runs
                WHERE org_id = %(org_id)s
                  AND started_at >= %(start)s
                  AND started_at < %(end)s
                  {extra_where}
            ) AS b
            INNER JOIN agent_runs AS r
                ON r.org_id = %(org_id)s
                AND r.started_at >= toDateTime(toDate(b.timestamp) - 6)
                AND r.started_at < toDateTime(toDate(b.timestamp) + 1)
                {extra_where.replace('team_id', 'r.team_id').replace('project_id', 'r.project_id').replace('agent_type', 'r.agent_type') if extra_where else ''}
            GROUP BY b.timestamp
        ) AS wau ON t.timestamp = wau.timestamp
        LEFT JOIN (
            SELECT
                b.timestamp,
                uniq(r.user_id) AS mau
            FROM (
                SELECT DISTINCT {bucket_fn} AS timestamp
                FROM agent_runs
                WHERE org_id = %(org_id)s
                  AND started_at >= %(start)s
                  AND started_at < %(end)s
                  {extra_where}
            ) AS b
            INNER JOIN agent_runs AS r
                ON r.org_id = %(org_id)s
                AND r.started_at >= toDateTime(toDate(b.timestamp) - 29)
                AND r.started_at < toDateTime(toDate(b.timestamp) + 1)
                {extra_where.replace('team_id', 'r.team_id').replace('project_id', 'r.project_id').replace('agent_type', 'r.agent_type') if extra_where else ''}
            GROUP BY b.timestamp
        ) AS mau ON t.timestamp = mau.timestamp
        ORDER BY t.timestamp
    """
    result = client.query(
        query,
        parameters={
            "org_id": org_id,
            "start": start,
            "end": end,
            "wau_start": wau_start,
            "mau_start": mau_start,
            **extra_params,
        },
    )

    return {
        "granularity": granularity,
        "data": [
            {
                "timestamp": str(row[0]),
                "dau": row[1],
                "wau": row[2] or 0,
                "mau": row[3] or 0,
                "is_partial": _is_current_bucket(row[0], granularity),
            }
            for row in result.result_rows
        ],
    }


def query_agent_type_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    rows = _query_breakdown(
        org_id, filters,
        group_col="agent_type",
        select_exprs="count() AS runs",
        row_mapper=lambda row: {"agent_type": row[0], "runs": row[1]},
        order_by="runs DESC",
    )
    total = sum(r["runs"] for r in rows) or 1
    for r in rows:
        r["percentage"] = round(r["runs"] * 100.0 / total, 1)
    return rows


def query_top_users(org_id: str, filters: MetricFilters, limit: int = 10) -> list[dict[str, Any]]:
    """Top users by run count. Uses direct query because of LIMIT parameter."""
    client = get_client()
    start, end = filters.start, filters.end
    extra_where, extra_params = build_filter_clause(filters)

    query = f"""
        SELECT
            user_id,
            count() AS runs,
            max(started_at) AS last_active
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
          {extra_where}
        GROUP BY user_id
        ORDER BY runs DESC
        LIMIT %(limit)s
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, "limit": limit, **extra_params},
    )
    return [
        {
            "user_id": row[0],
            "runs": row[1],
            "last_active": str(row[2]) if row[2] else None,
        }
        for row in result.result_rows
    ]


def query_project_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    return _query_breakdown(
        org_id, filters,
        group_col="project_id",
        select_exprs="""count() AS runs,
            uniq(user_id) AS active_users,
            sum(cost_usd) AS cost""",
        row_mapper=lambda row: {
            "project_id": row[0],
            "runs": row[1],
            "active_users": row[2],
            "cost": round(float(row[3]), 2),
        },
        order_by="runs DESC",
    )


# ---------------------------------------------------------------------------
# Cost queries
# ---------------------------------------------------------------------------


def query_cost_trend(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    return _query_timeseries(
        org_id, filters,
        select_exprs="sum(cost_usd) AS cost",
        row_mapper=lambda row: {"cost": round(float(row[1]), 2)},
    )


def query_cost_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    group_col = "team_id"
    if filters.group_by == "project":
        group_col = "project_id"
    elif filters.group_by == "agent_type":
        group_col = "agent_type"

    return _query_breakdown(
        org_id, filters,
        group_col=group_col,
        select_exprs="""sum(cost_usd) AS cost,
            count() AS runs,
            sum(cost_usd) / greatest(count(), 1) AS cost_per_run""",
        row_mapper=lambda row: {
            "dimension_value": row[0],
            "cost": round(float(row[1]), 2),
            "runs": row[2],
            "cost_per_run": round(float(row[3]), 4),
        },
        order_by="cost DESC",
    )


def query_cost_per_run_trend(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    return _query_timeseries(
        org_id, filters,
        select_exprs="sum(cost_usd) / greatest(count(), 1) AS avg_cost_per_run",
        row_mapper=lambda row: {"avg_cost_per_run": round(float(row[1]), 4)},
    )


def query_token_breakdown(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    client = get_client()
    start, end = filters.start, filters.end
    extra_where, extra_params = build_filter_clause(filters)

    total_query = f"""
        SELECT
            sum(tokens_input) AS input_tokens,
            sum(tokens_output) AS output_tokens
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
          {extra_where}
    """
    total = client.query(
        total_query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    tr = total.first_row

    model_query = f"""
        SELECT
            model,
            sum(tokens_input) AS input_tokens,
            sum(tokens_output) AS output_tokens
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
          {extra_where}
        GROUP BY model
        ORDER BY input_tokens + output_tokens DESC
    """
    model_result = client.query(
        model_query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return {
        "input_tokens": int(tr[0]),
        "output_tokens": int(tr[1]),
        "by_model": [
            {"model": row[0], "input_tokens": int(row[1]), "output_tokens": int(row[2])}
            for row in model_result.result_rows
        ],
    }


# ---------------------------------------------------------------------------
# Performance queries
# ---------------------------------------------------------------------------


def query_success_rate_trend(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    return _query_timeseries(
        org_id, filters,
        select_exprs="""countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate,
            countIf(status = 'failed') * 100.0 / greatest(count(), 1) AS failure_rate,
            countIf(status = 'failed' AND error_category IS NOT NULL) * 100.0 / greatest(count(), 1) AS error_rate""",
        row_mapper=lambda row: {
            "success_rate": round(float(row[1]), 1),
            "failure_rate": round(float(row[2]), 1),
            "error_rate": round(float(row[3]), 1),
        },
    )


def query_latency_trend(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    return _query_timeseries(
        org_id, filters,
        select_exprs="""quantile(0.5)(duration_ms) AS p50,
            quantile(0.95)(duration_ms) AS p95,
            quantile(0.99)(duration_ms) AS p99""",
        row_mapper=lambda row: {
            "p50": round(float(row[1]), 0),
            "p95": round(float(row[2]), 0),
            "p99": round(float(row[3]), 0),
        },
        extra_where_literal="AND duration_ms > 0",
    )


def query_error_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    rows = _query_breakdown(
        org_id, filters,
        group_col="error_category",
        select_exprs="count() AS cnt",
        row_mapper=lambda row: {"error_category": row[0], "count": row[1]},
        order_by="cnt DESC",
        extra_where_literal="AND status = 'failed' AND error_category IS NOT NULL",
    )
    total = sum(r["count"] for r in rows) or 1
    for r in rows:
        r["percentage"] = round(r["count"] * 100.0 / total, 1)
    return rows


def query_queue_wait_trend(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    return _query_timeseries(
        org_id, filters,
        select_exprs="""avg(queue_wait_ms) AS avg_wait_ms,
            quantile(0.95)(queue_wait_ms) AS p95_wait_ms""",
        row_mapper=lambda row: {
            "avg_wait_ms": round(float(row[1]), 0),
            "p95_wait_ms": round(float(row[2]), 0),
        },
        extra_where_literal="AND queue_wait_ms > 0",
    )


def query_availability(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    client = get_client()
    start, end = filters.start, filters.end
    extra_where, extra_params = build_filter_clause(filters)

    query = f"""
        SELECT
            countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS uptime_pct
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND started_at >= %(start)s
          AND started_at < %(end)s
          {extra_where}
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return {
        "uptime_pct": round(float(result.first_row[0]), 1),
    }


# ---------------------------------------------------------------------------
# Cost: budget queries
# ---------------------------------------------------------------------------


def query_current_month_spend(org_id: str) -> float:
    client = get_client()
    today = date.today()
    month_start = today.replace(day=1)

    query = """
        SELECT sum(cost_usd) AS spend
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(month_start)s
          AND toDate(started_at) <= %(today)s
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "month_start": month_start, "today": today},
    )
    return float(result.first_row[0]) if result.first_row[0] else 0.0
