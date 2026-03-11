"""Write raw events and rollup data to ClickHouse."""

import logging
from datetime import datetime

import clickhouse_connect
from clickhouse_connect.driver.client import Client

from app.config import Config
from app.consumer import AgentEvent

logger = logging.getLogger(__name__)


def create_client(config: Config) -> Client:
    """Create a ClickHouse client."""
    return clickhouse_connect.get_client(
        host=config.CLICKHOUSE_HOST,
        port=config.CLICKHOUSE_PORT,
        database=config.CLICKHOUSE_DB,
        username=config.CLICKHOUSE_USER,
        password=config.CLICKHOUSE_PASSWORD,
    )


def _parse_timestamp(ts_str: str) -> datetime:
    """Parse an ISO 8601 timestamp string to datetime."""
    # Handle both formats: with and without Z suffix, with fractional seconds
    ts_str = ts_str.replace("Z", "+00:00")
    return datetime.fromisoformat(ts_str)


def _compute_status(event: AgentEvent) -> str:
    """Map event_type to a status string for ClickHouse."""
    if event.event_type == "run_completed":
        return "completed"
    elif event.event_type == "run_failed":
        return "failed"
    return "running"


def insert_events(client: Client, events: list[AgentEvent]) -> int:
    """Insert completed/failed events into the agent_runs table.

    Only run_completed and run_failed events contain the full data needed
    for analytics (duration, tokens, cost). run_started events are skipped
    for ClickHouse insertion — they're only used for real-time counters.

    Returns the number of rows inserted.
    """
    # Filter to only completed/failed events
    completed_events = [
        e for e in events if e.event_type in ("run_completed", "run_failed")
    ]

    if not completed_events:
        return 0

    columns = [
        "run_id",
        "org_id",
        "team_id",
        "user_id",
        "project_id",
        "agent_type",
        "status",
        "started_at",
        "completed_at",
        "duration_ms",
        "tokens_input",
        "tokens_output",
        "model",
        "cost_usd",
        "error_category",
        "queue_wait_ms",
        "user_rating",
    ]

    rows = []
    for event in completed_events:
        completed_at = _parse_timestamp(event.timestamp)
        duration_ms = event.duration_ms or 0
        # Compute started_at by subtracting duration from completed_at timestamp
        started_at = datetime.fromtimestamp(
            completed_at.timestamp() - (duration_ms / 1000.0),
            tz=completed_at.tzinfo,
        )

        rows.append([
            event.run_id,
            event.org_id,
            event.team_id,
            event.user_id,
            event.project_id,
            event.agent_type,
            _compute_status(event),
            started_at,
            completed_at,
            duration_ms,
            event.tokens_input or 0,
            event.tokens_output or 0,
            event.model or "",
            event.cost_usd or 0.0,
            event.error_category,
            event.queue_wait_ms or 0,
            event.user_rating,
        ])

    client.insert(
        "agent_runs",
        rows,
        column_names=columns,
    )

    logger.debug("Inserted %d rows into agent_runs", len(rows))
    return len(rows)


def insert_daily_team_metrics(
    client: Client, rows: list[dict]
) -> None:
    """Upsert daily team metrics rollup data."""
    if not rows:
        return

    columns = [
        "date",
        "org_id",
        "team_id",
        "total_runs",
        "successful_runs",
        "failed_runs",
        "active_users",
        "total_cost",
        "total_tokens_input",
        "total_tokens_output",
        "avg_duration_ms",
        "p50_duration_ms",
        "p95_duration_ms",
        "p99_duration_ms",
        "avg_queue_wait_ms",
    ]

    data = [
        [row[col] for col in columns]
        for row in rows
    ]

    client.insert("daily_team_metrics", data, column_names=columns)
    logger.debug("Upserted %d rows into daily_team_metrics", len(data))


def insert_daily_agent_type_metrics(
    client: Client, rows: list[dict]
) -> None:
    """Upsert daily agent type metrics rollup data."""
    if not rows:
        return

    columns = [
        "date",
        "org_id",
        "agent_type",
        "total_runs",
        "successful_runs",
        "total_cost",
    ]

    data = [
        [row[col] for col in columns]
        for row in rows
    ]

    client.insert("daily_agent_type_metrics", data, column_names=columns)
    logger.debug(
        "Upserted %d rows into daily_agent_type_metrics", len(data)
    )


def insert_daily_project_metrics(
    client: Client, rows: list[dict]
) -> None:
    """Upsert daily project metrics rollup data."""
    if not rows:
        return

    columns = [
        "date",
        "org_id",
        "project_id",
        "total_runs",
        "active_users",
        "total_cost",
    ]

    data = [
        [row[col] for col in columns]
        for row in rows
    ]

    client.insert("daily_project_metrics", data, column_names=columns)
    logger.debug("Upserted %d rows into daily_project_metrics", len(data))
