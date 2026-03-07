"""Compute daily rollup aggregates from ClickHouse raw events.

Queries agent_runs for each day that has un-aggregated data, computes
aggregated metrics, and upserts into the daily_* rollup tables.
ReplacingMergeTree handles deduplication on (org_id, date, dimension).
"""

import logging
from datetime import date, datetime, timedelta, timezone

from clickhouse_connect.driver.client import Client

from app.writers.clickhouse import (
    insert_daily_agent_type_metrics,
    insert_daily_project_metrics,
    insert_daily_team_metrics,
)

logger = logging.getLogger(__name__)


def compute_rollups(client: Client) -> None:
    """Compute daily rollups for all orgs and days with data.

    Queries the last 2 days of raw events to catch any late-arriving data,
    then upserts aggregated metrics. ReplacingMergeTree handles idempotency.
    """
    cutoff = date.today() - timedelta(days=2)

    _compute_team_rollups(client, cutoff)
    _compute_agent_type_rollups(client, cutoff)
    _compute_project_rollups(client, cutoff)

    logger.info("Rollup computation complete for dates >= %s", cutoff)


def _compute_team_rollups(client: Client, since: date) -> None:
    """Compute daily_team_metrics from agent_runs."""
    query = """
        SELECT
            toDate(started_at) AS date,
            org_id,
            team_id,
            count() AS total_runs,
            countIf(status = 'completed') AS successful_runs,
            countIf(status = 'failed') AS failed_runs,
            uniq(user_id) AS active_users,
            sum(cost_usd) AS total_cost,
            sum(tokens_input) AS total_tokens_input,
            sum(tokens_output) AS total_tokens_output,
            avg(duration_ms) AS avg_duration_ms,
            quantile(0.5)(duration_ms) AS p50_duration_ms,
            quantile(0.95)(duration_ms) AS p95_duration_ms,
            quantile(0.99)(duration_ms) AS p99_duration_ms,
            avg(queue_wait_ms) AS avg_queue_wait_ms
        FROM agent_runs
        WHERE toDate(started_at) >= %(since)s
        GROUP BY date, org_id, team_id
    """
    result = client.query(query, parameters={"since": since})

    rows = []
    for row in result.result_rows:
        rows.append({
            "date": row[0],
            "org_id": row[1],
            "team_id": row[2],
            "total_runs": row[3],
            "successful_runs": row[4],
            "failed_runs": row[5],
            "active_users": row[6],
            "total_cost": row[7],
            "total_tokens_input": row[8],
            "total_tokens_output": row[9],
            "avg_duration_ms": row[10],
            "p50_duration_ms": row[11],
            "p95_duration_ms": row[12],
            "p99_duration_ms": row[13],
            "avg_queue_wait_ms": row[14],
        })

    insert_daily_team_metrics(client, rows)
    logger.debug("Computed %d team rollup rows", len(rows))


def _compute_agent_type_rollups(client: Client, since: date) -> None:
    """Compute daily_agent_type_metrics from agent_runs."""
    query = """
        SELECT
            toDate(started_at) AS date,
            org_id,
            agent_type,
            count() AS total_runs,
            countIf(status = 'completed') AS successful_runs,
            sum(cost_usd) AS total_cost
        FROM agent_runs
        WHERE toDate(started_at) >= %(since)s
        GROUP BY date, org_id, agent_type
    """
    result = client.query(query, parameters={"since": since})

    rows = []
    for row in result.result_rows:
        rows.append({
            "date": row[0],
            "org_id": row[1],
            "agent_type": row[2],
            "total_runs": row[3],
            "successful_runs": row[4],
            "total_cost": row[5],
        })

    insert_daily_agent_type_metrics(client, rows)
    logger.debug("Computed %d agent type rollup rows", len(rows))


def _compute_project_rollups(client: Client, since: date) -> None:
    """Compute daily_project_metrics from agent_runs."""
    query = """
        SELECT
            toDate(started_at) AS date,
            org_id,
            project_id,
            count() AS total_runs,
            uniq(user_id) AS active_users,
            sum(cost_usd) AS total_cost
        FROM agent_runs
        WHERE toDate(started_at) >= %(since)s
        GROUP BY date, org_id, project_id
    """
    result = client.query(query, parameters={"since": since})

    rows = []
    for row in result.result_rows:
        rows.append({
            "date": row[0],
            "org_id": row[1],
            "project_id": row[2],
            "total_runs": row[3],
            "active_users": row[4],
            "total_cost": row[5],
        })

    insert_daily_project_metrics(client, rows)
    logger.debug("Computed %d project rollup rows", len(rows))
