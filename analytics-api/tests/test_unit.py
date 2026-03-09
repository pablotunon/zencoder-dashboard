"""Unit tests for Analytics API — API-U01 through API-U06."""
from datetime import date, timedelta
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
from app.services.clickhouse import period_to_dates, previous_period_dates
from app.services.redis_cache import make_cache_key
from app.services.widget_query import (
    DIMENSION_REGISTRY,
    METRIC_REGISTRY,
    _build_filter_clause,
)


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


# API-U05: Date range calculation from period
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
        req = WidgetQueryRequest(metric="run_count", period="30d")
        assert req.metric == "run_count"
        assert req.period == "30d"
        assert req.breakdown is None
        assert req.filters is None

    def test_valid_request_with_breakdown(self):
        req = WidgetQueryRequest(metric="cost", period="7d", breakdown="team")
        assert req.breakdown == "team"

    def test_invalid_metric_rejected(self):
        with pytest.raises(Exception):
            WidgetQueryRequest(metric="invalid_metric", period="30d")

    def test_invalid_period_rejected(self):
        with pytest.raises(Exception):
            WidgetQueryRequest(metric="run_count", period="15d")

    def test_invalid_breakdown_rejected(self):
        with pytest.raises(Exception):
            WidgetQueryRequest(metric="run_count", period="30d", breakdown="invalid")

    def test_all_metrics_in_registry(self):
        """Every metric accepted by the request model exists in the registry."""
        for key in METRIC_REGISTRY:
            req = WidgetQueryRequest(metric=key, period="30d")
            assert req.metric == key

    def test_all_dimensions_in_registry(self):
        """Every breakdown value accepted by the request model exists in the registry."""
        for key in DIMENSION_REGISTRY:
            req = WidgetQueryRequest(metric="run_count", period="30d", breakdown=key)
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
