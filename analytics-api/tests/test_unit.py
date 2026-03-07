"""Unit tests for Analytics API — API-U01 through API-U05."""
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.models.requests import MetricFilters, get_metric_filters, parse_csv
from app.models.responses import (
    KpiCard,
    KpiCards,
    OverviewResponse,
    TeamBreakdown,
    TimeSeriesPoint,
)
from app.services.clickhouse import period_to_dates, previous_period_dates
from app.services.redis_cache import make_cache_key


# API-U01: Filter parsing — valid period values accepted
class TestFilterParsing:
    def test_valid_periods(self):
        for period in ("7d", "30d", "90d"):
            f = MetricFilters(period=period)
            assert f.period == period

    def test_invalid_period_rejected(self):
        with pytest.raises(Exception):
            MetricFilters(period="5d")

    def test_default_period(self):
        f = MetricFilters()
        assert f.period == "30d"


# API-U02: Filter parsing — team slugs validated
class TestTeamSlugParsing:
    def test_csv_parsing(self):
        result = parse_csv("platform,backend,frontend")
        assert result == ["platform", "backend", "frontend"]

    def test_csv_with_spaces(self):
        result = parse_csv(" platform , backend ")
        assert result == ["platform", "backend"]

    def test_empty_string(self):
        result = parse_csv("")
        assert result is None

    def test_none_value(self):
        result = parse_csv(None)
        assert result is None

    def test_single_value(self):
        result = parse_csv("platform")
        assert result == ["platform"]


# API-U03: Cache key generation is deterministic
class TestCacheKeyGeneration:
    def test_same_filters_same_key(self):
        key1 = make_cache_key("org_acme", "overview", {"period": "30d", "teams": ["a", "b"]})
        key2 = make_cache_key("org_acme", "overview", {"period": "30d", "teams": ["a", "b"]})
        assert key1 == key2

    def test_different_filters_different_key(self):
        key1 = make_cache_key("org_acme", "overview", {"period": "30d"})
        key2 = make_cache_key("org_acme", "overview", {"period": "7d"})
        assert key1 != key2

    def test_different_orgs_different_key(self):
        key1 = make_cache_key("org_acme", "overview", {"period": "30d"})
        key2 = make_cache_key("org_globex", "overview", {"period": "30d"})
        assert key1 != key2

    def test_key_format(self):
        key = make_cache_key("org_acme", "overview", {"period": "30d"})
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
            active_runs_count=3,
        )
        data = response.model_dump()
        assert data["kpi_cards"]["total_runs"]["value"] == 1000
        assert data["kpi_cards"]["total_runs"]["change_pct"] == 5.2
        assert data["usage_trend"][0]["date"] == "2025-01-01"
        assert data["team_breakdown"][0]["team_name"] == "Platform"
        assert data["active_runs_count"] == 3

    def test_kpi_card_with_null_change(self):
        card = KpiCard(value=100, change_pct=None, period="7d")
        data = card.model_dump()
        assert data["change_pct"] is None


# API-U05: Date range calculation from period
class TestDateRangeCalculation:
    def test_30d_period(self):
        start, end = period_to_dates("30d")
        assert end == date.today()
        assert start == date.today() - timedelta(days=30)

    def test_7d_period(self):
        start, end = period_to_dates("7d")
        assert end == date.today()
        assert start == date.today() - timedelta(days=7)

    def test_90d_period(self):
        start, end = period_to_dates("90d")
        assert end == date.today()
        assert start == date.today() - timedelta(days=90)

    def test_previous_period_contiguous(self):
        current_start, current_end = period_to_dates("30d")
        prev_start, prev_end = previous_period_dates("30d")
        assert prev_end == current_start
        assert prev_start == current_start - timedelta(days=30)
