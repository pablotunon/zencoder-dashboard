from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Query
from pydantic import BaseModel, field_validator, model_validator


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _default_start() -> datetime:
    return _now_utc() - timedelta(days=30)


def _default_end() -> datetime:
    return _now_utc()


class MetricFilters(BaseModel):
    start: datetime = None  # type: ignore[assignment]
    end: datetime = None  # type: ignore[assignment]
    teams: list[str] | None = None
    projects: list[str] | None = None
    agent_types: list[str] | None = None
    group_by: Literal["team", "project", "agent_type"] | None = None

    @model_validator(mode="before")
    @classmethod
    def _apply_defaults(cls, values: dict) -> dict:
        now = _now_utc()
        if values.get("start") is None:
            values["start"] = now - timedelta(days=30)
        if values.get("end") is None:
            values["end"] = now
        return values

    @model_validator(mode="after")
    def _validate_range(self) -> "MetricFilters":
        if self.start >= self.end:
            raise ValueError("start must be before end")
        max_range = timedelta(days=366)
        if (self.end - self.start) > max_range:
            raise ValueError("date range must not exceed 1 year")
        now = _now_utc()
        if self.end > now + timedelta(days=1):
            raise ValueError("end must not be more than 1 day in the future")
        return self


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
        "approval_rate", "rating_participation",
    ]
    start: datetime = None  # type: ignore[assignment]
    end: datetime = None  # type: ignore[assignment]
    breakdown: Literal["team", "project", "agent_type", "error_category", "model"] | None = None
    filters: WidgetFilters | None = None

    @model_validator(mode="before")
    @classmethod
    def _apply_defaults(cls, values: dict) -> dict:
        now = _now_utc()
        if values.get("start") is None:
            values["start"] = now - timedelta(days=30)
        if values.get("end") is None:
            values["end"] = now
        return values

    @model_validator(mode="after")
    def _validate_range(self) -> "WidgetQueryRequest":
        if self.start >= self.end:
            raise ValueError("start must be before end")
        max_range = timedelta(days=366)
        if (self.end - self.start) > max_range:
            raise ValueError("date range must not exceed 1 year")
        now = _now_utc()
        if self.end > now + timedelta(days=1):
            raise ValueError("end must not be more than 1 day in the future")
        return self


class BatchWidgetQueryRequest(BaseModel):
    metrics: list[Literal[
        "run_count", "active_users", "cost", "cost_per_run",
        "success_rate", "failure_rate", "error_rate",
        "latency_p50", "latency_p95", "latency_p99",
        "tokens_input", "tokens_output",
        "queue_wait_avg", "queue_wait_p95",
        "approval_rate", "rating_participation",
    ]]
    start: datetime = None  # type: ignore[assignment]
    end: datetime = None  # type: ignore[assignment]
    breakdown: Literal["team", "project", "agent_type", "error_category", "model"] | None = None
    filters: WidgetFilters | None = None

    @field_validator("metrics")
    @classmethod
    def _validate_metrics(cls, v: list[str]) -> list[str]:
        if len(v) == 0:
            raise ValueError("metrics must contain at least 1 item")
        if len(v) > 10:
            raise ValueError("metrics must contain at most 10 items")
        if len(v) != len(set(v)):
            raise ValueError("metrics must not contain duplicates")
        return v

    @model_validator(mode="before")
    @classmethod
    def _apply_defaults(cls, values: dict) -> dict:
        now = _now_utc()
        if values.get("start") is None:
            values["start"] = now - timedelta(days=30)
        if values.get("end") is None:
            values["end"] = now
        return values

    @model_validator(mode="after")
    def _validate_range(self) -> "BatchWidgetQueryRequest":
        if self.start >= self.end:
            raise ValueError("start must be before end")
        max_range = timedelta(days=366)
        if (self.end - self.start) > max_range:
            raise ValueError("date range must not exceed 1 year")
        now = _now_utc()
        if self.end > now + timedelta(days=1):
            raise ValueError("end must not be more than 1 day in the future")
        return self


def parse_csv(value: str | None) -> list[str] | None:
    if not value:
        return None
    return [v.strip() for v in value.split(",") if v.strip()]


def get_metric_filters(
    start: str | None = Query(None, description="ISO8601 start datetime"),
    end: str | None = Query(None, description="ISO8601 end datetime"),
    teams: str | None = Query(None),
    projects: str | None = Query(None),
    agent_types: str | None = Query(None),
    group_by: Literal["team", "project", "agent_type"] | None = Query(None),
) -> MetricFilters:
    kwargs: dict = {
        "teams": parse_csv(teams),
        "projects": parse_csv(projects),
        "agent_types": parse_csv(agent_types),
        "group_by": group_by,
    }
    if start is not None:
        kwargs["start"] = datetime.fromisoformat(start)
    if end is not None:
        kwargs["end"] = datetime.fromisoformat(end)
    return MetricFilters(**kwargs)
