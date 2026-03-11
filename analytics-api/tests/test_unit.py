"""Unit tests for Analytics API — API-U01 through API-U09."""
import json
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.models.requests import MetricFilters, WidgetQueryRequest, get_metric_filters, parse_csv
from app.models.responses import (
    KpiCard,
    KpiCards,
    OverviewResponse,
    TeamBreakdown,
    TimeSeriesPoint,
)
from app.services.clickhouse import (
    _is_current_bucket,
    _is_today,
    period_to_dates,
    previous_period_dates,
    previous_range,
    resolve_granularity,
)
from app.services.redis_cache import make_cache_key
from app.services.widget_query import (
    DIMENSION_REGISTRY,
    METRIC_REGISTRY,
    _build_filter_clause,
)


def _utc(**kwargs: int) -> datetime:
    """Helper to build a timezone-aware UTC datetime relative to now."""
    return datetime.now(timezone.utc) + timedelta(**kwargs)


def _dt(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    """Helper to build a specific timezone-aware UTC datetime."""
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


# API-U01: Filter parsing — start/end accepted, defaults applied
class TestFilterParsing:
    def test_defaults_applied(self):
        f = MetricFilters()
        now = datetime.now(timezone.utc)
        # Default range is last 30 days
        assert abs((now - timedelta(days=30) - f.start).total_seconds()) < 5
        assert abs((f.end - now).total_seconds()) < 5
        assert 29 <= (f.end - f.start).days <= 30

    def test_explicit_start_end(self):
        start = _dt(2026, 1, 1)
        end = _dt(2026, 1, 15)
        f = MetricFilters(start=start, end=end)
        assert f.start == start
        assert f.end == end

    def test_start_after_end_rejected(self):
        with pytest.raises(Exception):
            MetricFilters(start=_dt(2026, 3, 10), end=_dt(2026, 3, 5))

    def test_start_equals_end_rejected(self):
        t = _dt(2026, 3, 10)
        with pytest.raises(Exception):
            MetricFilters(start=t, end=t)

    def test_range_exceeding_one_year_rejected(self):
        with pytest.raises(Exception):
            MetricFilters(start=_dt(2025, 1, 1), end=_dt(2026, 3, 1))

    def test_end_far_in_future_rejected(self):
        with pytest.raises(Exception):
            MetricFilters(start=_utc(days=-1), end=_utc(days=5))


# API-U02: Filter parsing — team slugs validated
class TestTeamSlugParsing:
    @pytest.mark.parametrize("input_val,expected", [
        ("platform,backend,frontend", ["platform", "backend", "frontend"]),
        (" platform , backend ", ["platform", "backend"]),
        ("platform", ["platform"]),
    ])
    def test_csv_parsing(self, input_val, expected):
        assert parse_csv(input_val) == expected

    @pytest.mark.parametrize("input_val", ["", None])
    def test_csv_empty_or_none(self, input_val):
        assert parse_csv(input_val) is None


# API-U03: Cache key generation is deterministic
class TestCacheKeyGeneration:
    def test_same_filters_same_key(self):
        key1 = make_cache_key("org_acme", "overview", {"start": "2026-03-01", "teams": ["a", "b"]})
        key2 = make_cache_key("org_acme", "overview", {"start": "2026-03-01", "teams": ["a", "b"]})
        assert key1 == key2

    def test_different_filters_different_key(self):
        key1 = make_cache_key("org_acme", "overview", {"start": "2026-03-01", "end": "2026-03-08"})
        key2 = make_cache_key("org_acme", "overview", {"start": "2026-02-01", "end": "2026-03-08"})
        assert key1 != key2

    def test_different_orgs_different_key(self):
        key1 = make_cache_key("org_acme", "overview", {"start": "2026-03-01"})
        key2 = make_cache_key("org_globex", "overview", {"start": "2026-03-01"})
        assert key1 != key2

    def test_key_format(self):
        key = make_cache_key("org_acme", "overview", {"start": "2026-03-01"})
        assert key.startswith("metrics:org_acme:overview:")

    def test_no_filters(self):
        key = make_cache_key("org_acme", "overview")
        assert key == "metrics:org_acme:overview:none"


# API-U04: Response models serialize correctly
class TestResponseSerialization:
    def test_overview_response_serializes(self):
        response = OverviewResponse(
            kpi_cards=KpiCards(
                total_runs=KpiCard(value=1000, change_pct=5.2, period="30d"),
                active_users=KpiCard(value=42, change_pct=-3.1, period="30d"),
                total_cost=KpiCard(value=1234.56, change_pct=10.0, period="30d"),
                success_rate=KpiCard(value=87.5, change_pct=1.2, period="30d"),
            ),
            usage_trend=[TimeSeriesPoint(date="2025-01-01", runs=100, cost=50.0)],
            team_breakdown=[
                TeamBreakdown(
                    team_id="team_1",
                    team_name="Platform",
                    runs=500,
                    active_users=15,
                    cost=600.0,
                    success_rate=90.0,
                )
            ],
        )
        data = response.model_dump()
        assert data["kpi_cards"]["total_runs"]["value"] == 1000
        assert data["kpi_cards"]["total_runs"]["change_pct"] == 5.2
        assert data["usage_trend"][0]["date"] == "2025-01-01"
        assert data["team_breakdown"][0]["team_name"] == "Platform"

    def test_kpi_card_with_null_change(self):
        card = KpiCard(value=100, change_pct=None, period="7d")
        data = card.model_dump()
        assert data["change_pct"] is None


# API-U05: Legacy date range calculation from period (kept for backward compat)
class TestDateRangeCalculation:
    @pytest.mark.parametrize("period,days", [("7d", 7), ("30d", 30), ("90d", 90)])
    def test_period_to_dates(self, period, days):
        start, end = period_to_dates(period)
        assert end == date.today() + timedelta(days=1)
        assert start == date.today() - timedelta(days=days)

    def test_previous_period_contiguous(self):
        current_start, current_end = period_to_dates("30d")
        prev_start, prev_end = previous_period_dates("30d")
        assert prev_end == current_start
        assert prev_start == current_start - timedelta(days=30)


# API-U06: Widget query request validation and registries
class TestWidgetQueryRequest:
    def test_valid_request_no_breakdown(self):
        start = _utc(days=-7)
        end = _utc()
        req = WidgetQueryRequest(metric="run_count", start=start, end=end)
        assert req.metric == "run_count"
        assert req.start == start
        assert req.end == end
        assert req.breakdown is None
        assert req.filters is None

    def test_valid_request_with_breakdown(self):
        req = WidgetQueryRequest(metric="cost", start=_utc(days=-7), end=_utc(), breakdown="team")
        assert req.breakdown == "team"

    def test_defaults_applied_when_no_dates(self):
        req = WidgetQueryRequest(metric="run_count")
        now = datetime.now(timezone.utc)
        assert abs((req.end - now).total_seconds()) < 5
        assert 29 <= (req.end - req.start).days <= 30

    def test_invalid_metric_rejected(self):
        with pytest.raises(Exception):
            WidgetQueryRequest(metric="invalid_metric", start=_utc(days=-7), end=_utc())

    def test_start_after_end_rejected(self):
        with pytest.raises(Exception):
            WidgetQueryRequest(metric="run_count", start=_utc(days=-1), end=_utc(days=-5))

    def test_range_exceeding_one_year_rejected(self):
        with pytest.raises(Exception):
            WidgetQueryRequest(metric="run_count", start=_dt(2025, 1, 1), end=_dt(2026, 3, 1))

    def test_invalid_breakdown_rejected(self):
        with pytest.raises(Exception):
            WidgetQueryRequest(metric="run_count", start=_utc(days=-7), end=_utc(), breakdown="invalid")

    def test_all_metrics_in_registry(self):
        for key in METRIC_REGISTRY:
            req = WidgetQueryRequest(metric=key)
            assert req.metric == key

    def test_all_dimensions_in_registry(self):
        for key in DIMENSION_REGISTRY:
            req = WidgetQueryRequest(metric="run_count", breakdown=key)
            assert req.breakdown == key

    def test_metric_registry_has_required_fields(self):
        for key, entry in METRIC_REGISTRY.items():
            assert "expr" in entry, f"Metric {key} missing 'expr'"
            assert "label" in entry, f"Metric {key} missing 'label'"

    def test_dimension_registry_has_required_fields(self):
        for key, entry in DIMENSION_REGISTRY.items():
            assert "column" in entry, f"Dimension {key} missing 'column'"
            assert "label" in entry, f"Dimension {key} missing 'label'"


class TestWidgetFilterClause:
    def test_no_filters(self):
        clause, params = _build_filter_clause(None)
        assert clause == ""
        assert params == {}

    def test_empty_filters(self):
        clause, params = _build_filter_clause({})
        assert clause == ""
        assert params == {}

    def test_team_filter(self):
        clause, params = _build_filter_clause({"teams": ["platform", "backend"]})
        assert "team_id IN %(team_ids)s" in clause
        assert params["team_ids"] == ["platform", "backend"]

    def test_multiple_filters(self):
        clause, params = _build_filter_clause({
            "teams": ["platform"],
            "projects": ["proj_1"],
            "agent_types": ["coding"],
        })
        assert "team_id IN %(team_ids)s" in clause
        assert "project_id IN %(project_ids)s" in clause
        assert "agent_type IN %(agent_types)s" in clause
        assert len(params) == 3


# API-U07: ORJSONResponse serialization
class TestORJSONResponse:
    """Unit tests for the centralized orjson-backed JSON serializer."""

    def test_nan_serialized_as_null(self):
        from app.json_response import ORJSONResponse
        resp = ORJSONResponse(content={"value": float("nan")})
        data = json.loads(resp.body)
        assert data["value"] is None

    def test_inf_serialized_as_null(self):
        from app.json_response import ORJSONResponse
        resp = ORJSONResponse(content={"value": float("inf")})
        data = json.loads(resp.body)
        assert data["value"] is None

    def test_neg_inf_serialized_as_null(self):
        from app.json_response import ORJSONResponse
        resp = ORJSONResponse(content={"value": float("-inf")})
        data = json.loads(resp.body)
        assert data["value"] is None

    def test_finite_floats_preserved(self):
        from app.json_response import ORJSONResponse
        resp = ORJSONResponse(content={"value": 123.45, "zero": 0.0, "neg": -1.5})
        data = json.loads(resp.body)
        assert data["value"] == 123.45
        assert data["zero"] == 0.0
        assert data["neg"] == -1.5

    def test_nested_nan_sanitized(self):
        from app.json_response import ORJSONResponse
        resp = ORJSONResponse(content={
            "summary": {"value": float("nan")},
            "data": [{"v": float("nan")}, {"v": 1.0}],
        })
        data = json.loads(resp.body)
        assert data["summary"]["value"] is None
        assert data["data"][0]["v"] is None
        assert data["data"][1]["v"] == 1.0

    def test_non_float_types_preserved(self):
        from app.json_response import ORJSONResponse
        resp = ORJSONResponse(content={
            "str": "hello",
            "int": 42,
            "bool": True,
            "null": None,
            "list": [1, "two", None],
        })
        data = json.loads(resp.body)
        assert data["str"] == "hello"
        assert data["int"] == 42
        assert data["bool"] is True
        assert data["null"] is None
        assert data["list"] == [1, "two", None]


# API-U08: resolve_granularity auto-bucketing
class TestResolveGranularity:
    def test_under_6_hours_returns_minute(self):
        start = _dt(2026, 3, 10, 10, 0)
        end = _dt(2026, 3, 10, 14, 0)  # 4 hours
        bucket_fn, granularity = resolve_granularity(start, end)
        assert granularity == "minute"
        assert "toStartOfMinute" in bucket_fn

    def test_exactly_6_hours_returns_minute(self):
        start = _dt(2026, 3, 10, 8, 0)
        end = _dt(2026, 3, 10, 14, 0)  # 6 hours
        bucket_fn, granularity = resolve_granularity(start, end)
        assert granularity == "minute"

    def test_over_6_hours_under_48_returns_hour(self):
        start = _dt(2026, 3, 10, 0, 0)
        end = _dt(2026, 3, 11, 12, 0)  # 36 hours
        bucket_fn, granularity = resolve_granularity(start, end)
        assert granularity == "hour"
        assert "toStartOfHour" in bucket_fn

    def test_exactly_48_hours_returns_hour(self):
        start = _dt(2026, 3, 10, 0, 0)
        end = _dt(2026, 3, 12, 0, 0)  # 48 hours
        bucket_fn, granularity = resolve_granularity(start, end)
        assert granularity == "hour"

    def test_7_days_returns_day(self):
        start = _dt(2026, 3, 1)
        end = _dt(2026, 3, 8)  # 7 days
        bucket_fn, granularity = resolve_granularity(start, end)
        assert granularity == "day"
        assert "toDate" in bucket_fn

    def test_90_days_returns_day(self):
        start = _dt(2026, 1, 1)
        end = _dt(2026, 4, 1)  # 90 days
        bucket_fn, granularity = resolve_granularity(start, end)
        assert granularity == "day"

    def test_over_90_days_returns_week(self):
        start = _dt(2025, 6, 1)
        end = _dt(2026, 1, 1)  # ~7 months
        bucket_fn, granularity = resolve_granularity(start, end)
        assert granularity == "week"
        assert "toStartOfWeek" in bucket_fn


# API-U09: previous_range and _is_current_bucket
class TestPreviousRange:
    def test_previous_range_contiguous(self):
        start = _dt(2026, 3, 5, 14, 30)
        end = _dt(2026, 3, 8, 14, 30)  # 3 days
        prev_start, prev_end = previous_range(start, end)
        assert prev_end == start
        assert prev_start == _dt(2026, 3, 2, 14, 30)

    def test_previous_range_preserves_duration(self):
        start = _dt(2026, 3, 1)
        end = _dt(2026, 3, 11)  # 10 days
        prev_start, prev_end = previous_range(start, end)
        assert (prev_end - prev_start) == (end - start)

    def test_previous_range_short_duration(self):
        start = _dt(2026, 3, 10, 10, 0)
        end = _dt(2026, 3, 10, 12, 0)  # 2 hours
        prev_start, prev_end = previous_range(start, end)
        assert prev_end == start
        assert prev_start == _dt(2026, 3, 10, 8, 0)


class TestIsCurrentBucket:
    def test_today_is_current_day_bucket(self):
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        assert _is_current_bucket(today, "day") is True

    def test_yesterday_is_not_current_day_bucket(self):
        yesterday = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
        assert _is_current_bucket(yesterday, "day") is False

    def test_current_hour_is_current_hour_bucket(self):
        now = datetime.now(timezone.utc)
        current_hour = now.replace(minute=0, second=0, microsecond=0)
        assert _is_current_bucket(current_hour, "hour") is True

    def test_past_hour_is_not_current_hour_bucket(self):
        now = datetime.now(timezone.utc)
        past_hour = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
        assert _is_current_bucket(past_hour, "hour") is False

    def test_string_date_input(self):
        today_str = str(date.today())
        assert _is_current_bucket(today_str, "day") is True

    def test_string_datetime_input(self):
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        assert _is_current_bucket(yesterday.isoformat(), "day") is False

    def test_date_object_input(self):
        assert _is_current_bucket(date.today(), "day") is True
        assert _is_current_bucket(date.today() - timedelta(days=1), "day") is False


# API-U10: get_metric_filters parses start/end query params
class TestGetMetricFilters:
    def test_defaults_when_no_params(self):
        f = get_metric_filters(start=None, end=None, teams=None, projects=None, agent_types=None, group_by=None)
        now = datetime.now(timezone.utc)
        assert abs((f.end - now).total_seconds()) < 5
        assert 29 <= (f.end - f.start).days <= 30

    def test_parses_iso_start_end(self):
        f = get_metric_filters(
            start="2026-03-01T00:00:00+00:00",
            end="2026-03-08T12:00:00+00:00",
            teams=None, projects=None, agent_types=None, group_by=None,
        )
        assert f.start == _dt(2026, 3, 1)
        assert f.end == _dt(2026, 3, 8, 12)

    def test_parses_teams(self):
        f = get_metric_filters(start=None, end=None, teams="platform,backend", projects=None, agent_types=None, group_by=None)
        assert f.teams == ["platform", "backend"]

    def test_parses_group_by(self):
        f = get_metric_filters(start=None, end=None, teams=None, projects=None, agent_types=None, group_by="team")
        assert f.group_by == "team"
