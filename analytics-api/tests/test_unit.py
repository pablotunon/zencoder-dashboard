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
    @pytest.mark.parametrize("period", ["7d", "30d", "90d"])
    def test_valid_periods(self, period):
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
    @pytest.mark.parametrize("period,days", [("7d", 7), ("30d", 30), ("90d", 90)])
    def test_period_to_dates(self, period, days):
        start, end = period_to_dates(period)
        assert end == date.today()
        assert start == date.today() - timedelta(days=days)

    def test_previous_period_contiguous(self):
        current_start, current_end = period_to_dates("30d")
        prev_start, prev_end = previous_period_dates("30d")
        assert prev_end == current_start
        assert prev_start == current_start - timedelta(days=30)
