from typing import Literal

from fastapi import Query
from pydantic import BaseModel


class MetricFilters(BaseModel):
    period: Literal["7d", "30d", "90d"] = "30d"
    teams: list[str] | None = None
    projects: list[str] | None = None
    agent_types: list[str] | None = None
    group_by: Literal["team", "project", "agent_type"] | None = None


class WidgetFilters(BaseModel):
    teams: list[str] | None = None
    projects: list[str] | None = None
    agent_types: list[str] | None = None


class WidgetQueryRequest(BaseModel):
    metric: Literal[
        "run_count", "active_users", "cost", "cost_per_run",
        "success_rate", "failure_rate", "error_rate",
        "latency_p50", "latency_p95", "latency_p99",
        "tokens_input", "tokens_output",
        "queue_wait_avg", "queue_wait_p95",
    ]
    period: Literal["7d", "30d", "90d"]
    breakdown: Literal["team", "project", "agent_type", "error_category", "model"] | None = None
    filters: WidgetFilters | None = None


def parse_csv(value: str | None) -> list[str] | None:
    if not value:
        return None
    return [v.strip() for v in value.split(",") if v.strip()]


def get_metric_filters(
    period: Literal["7d", "30d", "90d"] = Query("30d"),
    teams: str | None = Query(None),
    projects: str | None = Query(None),
    agent_types: str | None = Query(None),
    group_by: Literal["team", "project", "agent_type"] | None = Query(None),
) -> MetricFilters:
    return MetricFilters(
        period=period,
        teams=parse_csv(teams),
        projects=parse_csv(projects),
        agent_types=parse_csv(agent_types),
        group_by=group_by,
    )
