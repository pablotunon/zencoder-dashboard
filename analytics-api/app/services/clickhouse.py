import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

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


def _is_today(date_val: date | str) -> bool:
    """Check if a date value represents today (partial data).

    Kept for backward compatibility during migration. Use _is_current_bucket() for new code.
    """
    return str(date_val) == str(date.today())

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


def period_to_dates(period: str) -> tuple[date, date]:
    """Convert period string to (start_date, end_date) tuple.

    Returns (start, end) where queries should use >= start AND < end.
    End is tomorrow so that today's (partial) data is included.
    """
    days = int(period.rstrip("d"))
    today = date.today()
    end = today + timedelta(days=1)
    start = today - timedelta(days=days)
    return start, end


def previous_period_dates(period: str) -> tuple[date, date]:
    """Get dates for the previous equivalent period (for change calculation)."""
    days = int(period.rstrip("d"))
    current_start, _ = period_to_dates(period)
    prev_end = current_start
    prev_start = prev_end - timedelta(days=days)
    return prev_start, prev_end


def build_team_filter(filters: MetricFilters, table_prefix: str = "") -> tuple[str, dict[str, Any]]:
    """Build WHERE clause fragment and params for team/project/agent_type filters."""
    clauses: list[str] = []
    params: dict[str, Any] = {}
    prefix = f"{table_prefix}." if table_prefix else ""

    if filters.teams:
        clauses.append(f"{prefix}team_id IN %(team_ids)s")
        params["team_ids"] = filters.teams

    if filters.projects:
        clauses.append(f"{prefix}project_id IN %(project_ids)s")
        params["project_ids"] = filters.projects

    if filters.agent_types:
        clauses.append(f"{prefix}agent_type IN %(agent_types)s")
        params["agent_types"] = filters.agent_types

    return (" AND " + " AND ".join(clauses) if clauses else ""), params


# --- Overview queries ---


def query_overview_kpis(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    prev_start, prev_end = previous_period_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    base_query = """
        SELECT
            count() AS total_runs,
            uniq(user_id) AS active_users,
            sum(cost_usd) AS total_cost,
            countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
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


def query_usage_trend(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            toDate(started_at) AS date,
            count() AS runs,
            sum(cost_usd) AS cost
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY date
        ORDER BY date
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {"date": str(row[0]), "runs": row[1], "cost": round(float(row[2]), 2), "is_partial": _is_today(row[0])}
        for row in result.result_rows
    ]


def query_team_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            team_id,
            count() AS runs,
            uniq(user_id) AS active_users,
            sum(cost_usd) AS cost,
            countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY team_id
        ORDER BY runs DESC
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {
            "team_id": row[0],
            "runs": row[1],
            "active_users": row[2],
            "cost": round(float(row[3]), 2),
            "success_rate": round(float(row[4]), 1),
        }
        for row in result.result_rows
    ]


# --- Usage queries ---


def query_active_users_trend(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            toDate(started_at) AS date,
            uniq(user_id) AS dau
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY date
        ORDER BY date
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )

    rows = result.result_rows
    dau_by_date: dict[str, int] = {str(row[0]): row[1] for row in rows}

    # Compute WAU/MAU using a join approach compatible with ClickHouse 24
    # Get the wider-window data for rolling aggregation
    wau_start = start - timedelta(days=6)
    mau_start = start - timedelta(days=29)

    wide_query = f"""
        SELECT
            toDate(started_at) AS event_date,
            user_id
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(wide_start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
    """
    wide_result = client.query(
        wide_query,
        parameters={"org_id": org_id, "wide_start": mau_start, "end": end, **extra_params},
    )

    # Build user activity by date for rolling window computation
    from collections import defaultdict
    user_dates: dict[str, set[str]] = defaultdict(set)
    for row in wide_result.result_rows:
        user_dates[str(row[0])].add(row[1])

    # Compute WAU and MAU for each day in our target range
    wau_by_date: dict[str, int] = {}
    mau_by_date: dict[str, int] = {}

    for row in rows:
        d = row[0]
        d_str = str(d)

        # WAU: unique users in [d-6, d]
        wau_users: set[str] = set()
        for offset in range(7):
            check_date = str(d - timedelta(days=offset))
            wau_users.update(user_dates.get(check_date, set()))
        wau_by_date[d_str] = len(wau_users)

        # MAU: unique users in [d-29, d]
        mau_users: set[str] = set()
        for offset in range(30):
            check_date = str(d - timedelta(days=offset))
            mau_users.update(user_dates.get(check_date, set()))
        mau_by_date[d_str] = len(mau_users)

    trend = []
    for row in rows:
        d = str(row[0])
        trend.append({
            "date": d,
            "dau": dau_by_date.get(d, 0),
            "wau": wau_by_date.get(d, 0),
            "mau": mau_by_date.get(d, 0),
            "is_partial": _is_today(row[0]),
        })

    return trend


def query_agent_type_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            agent_type,
            count() AS runs
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY agent_type
        ORDER BY runs DESC
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    total = sum(row[1] for row in result.result_rows) or 1
    return [
        {
            "agent_type": row[0],
            "runs": row[1],
            "percentage": round(row[1] * 100.0 / total, 1),
        }
        for row in result.result_rows
    ]


def query_top_users(org_id: str, filters: MetricFilters, limit: int = 10) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            user_id,
            count() AS runs,
            max(started_at) AS last_active
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
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
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            project_id,
            count() AS runs,
            uniq(user_id) AS active_users,
            sum(cost_usd) AS cost
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY project_id
        ORDER BY runs DESC
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {
            "project_id": row[0],
            "runs": row[1],
            "active_users": row[2],
            "cost": round(float(row[3]), 2),
        }
        for row in result.result_rows
    ]


# --- Cost queries ---


def query_cost_trend(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            toDate(started_at) AS date,
            sum(cost_usd) AS cost
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY date
        ORDER BY date
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {"date": str(row[0]), "cost": round(float(row[1]), 2), "is_partial": _is_today(row[0])}
        for row in result.result_rows
    ]


def query_cost_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    group_col = "team_id"
    if filters.group_by == "project":
        group_col = "project_id"
    elif filters.group_by == "agent_type":
        group_col = "agent_type"

    query = f"""
        SELECT
            {group_col} AS dimension_value,
            sum(cost_usd) AS cost,
            count() AS runs,
            sum(cost_usd) / greatest(count(), 1) AS cost_per_run
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY dimension_value
        ORDER BY cost DESC
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {
            "dimension_value": row[0],
            "cost": round(float(row[1]), 2),
            "runs": row[2],
            "cost_per_run": round(float(row[3]), 4),
        }
        for row in result.result_rows
    ]


def query_cost_per_run_trend(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            toDate(started_at) AS date,
            sum(cost_usd) / greatest(count(), 1) AS avg_cost_per_run
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY date
        ORDER BY date
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {"date": str(row[0]), "avg_cost_per_run": round(float(row[1]), 4), "is_partial": _is_today(row[0])}
        for row in result.result_rows
    ]


def query_token_breakdown(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    total_query = f"""
        SELECT
            sum(tokens_input) AS input_tokens,
            sum(tokens_output) AS output_tokens
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
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
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
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


# --- Performance queries ---


def query_success_rate_trend(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            toDate(started_at) AS date,
            countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate,
            countIf(status = 'failed') * 100.0 / greatest(count(), 1) AS failure_rate,
            countIf(status = 'failed' AND error_category IS NOT NULL) * 100.0 / greatest(count(), 1) AS error_rate
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
        GROUP BY date
        ORDER BY date
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {
            "date": str(row[0]),
            "success_rate": round(float(row[1]), 1),
            "failure_rate": round(float(row[2]), 1),
            "error_rate": round(float(row[3]), 1),
            "is_partial": _is_today(row[0]),
        }
        for row in result.result_rows
    ]


def query_latency_trend(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            toDate(started_at) AS date,
            quantile(0.5)(duration_ms) AS p50,
            quantile(0.95)(duration_ms) AS p95,
            quantile(0.99)(duration_ms) AS p99
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          AND duration_ms > 0
          {extra_where}
        GROUP BY date
        ORDER BY date
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {
            "date": str(row[0]),
            "p50": round(float(row[1]), 0),
            "p95": round(float(row[2]), 0),
            "p99": round(float(row[3]), 0),
            "is_partial": _is_today(row[0]),
        }
        for row in result.result_rows
    ]


def query_error_breakdown(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            error_category,
            count() AS cnt
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          AND status = 'failed'
          AND error_category IS NOT NULL
          {extra_where}
        GROUP BY error_category
        ORDER BY cnt DESC
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    total = sum(row[1] for row in result.result_rows) or 1
    return [
        {
            "error_category": row[0],
            "count": row[1],
            "percentage": round(row[1] * 100.0 / total, 1),
        }
        for row in result.result_rows
    ]


def query_queue_wait_trend(org_id: str, filters: MetricFilters) -> list[dict[str, Any]]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            toDate(started_at) AS date,
            avg(queue_wait_ms) AS avg_wait_ms,
            quantile(0.95)(queue_wait_ms) AS p95_wait_ms
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          AND queue_wait_ms > 0
          {extra_where}
        GROUP BY date
        ORDER BY date
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return [
        {
            "date": str(row[0]),
            "avg_wait_ms": round(float(row[1]), 0),
            "p95_wait_ms": round(float(row[2]), 0),
            "is_partial": _is_today(row[0]),
        }
        for row in result.result_rows
    ]


def query_availability(org_id: str, filters: MetricFilters) -> dict[str, Any]:
    client = get_client()
    start, end = period_to_dates(filters.period)
    extra_where, extra_params = build_team_filter(filters)

    query = f"""
        SELECT
            countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS uptime_pct
        FROM agent_runs
        WHERE org_id = %(org_id)s
          AND toDate(started_at) >= %(start)s
          AND toDate(started_at) < %(end)s
          {extra_where}
    """
    result = client.query(
        query,
        parameters={"org_id": org_id, "start": start, "end": end, **extra_params},
    )
    return {
        "uptime_pct": round(float(result.first_row[0]), 1),
        "period": filters.period,
    }


# --- Cost: budget queries ---


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
