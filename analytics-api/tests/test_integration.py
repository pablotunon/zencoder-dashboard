"""Integration tests for Analytics API — API-I01 through API-I10.

These tests use mocked service layers to validate endpoint behavior
without requiring actual database connections.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


# Shared mock data
MOCK_KPIS = {
    "total_runs": 5000,
    "active_users": 42,
    "total_cost": 1234.56,
    "success_rate": 87.5,
    "total_runs_change": 5.2,
    "active_users_change": -3.1,
    "total_cost_change": 10.0,
    "success_rate_change": 1.2,
}

MOCK_USAGE_TREND = [
    {"date": "2025-01-01", "runs": 100, "cost": 50.0},
    {"date": "2025-01-02", "runs": 120, "cost": 60.0},
]

MOCK_TEAM_BREAKDOWN = [
    {"team_id": "team_platform", "runs": 500, "active_users": 15, "cost": 600.0, "success_rate": 90.0},
]

MOCK_TEAM_NAMES = {"team_platform": "Platform", "team_backend": "Backend"}

MOCK_ORG = {
    "org_id": "org_acme",
    "name": "Acme Corp",
    "plan": "enterprise",
    "monthly_budget": 50000.00,
    "logo_url": None,
}

MOCK_TEAMS = [
    {"team_id": "team_platform", "name": "Platform", "slug": "platform"},
    {"team_id": "team_backend", "name": "Backend", "slug": "backend"},
]

MOCK_PROJECTS = [
    {"project_id": "proj_1", "name": "Auth Service", "repository_url": "https://github.com/acme/auth", "team_id": "team_platform"},
]


def _patch_redis_cache():
    """Patch Redis cache to always miss."""
    return patch.multiple(
        "app.services.redis_cache",
        get_cached=MagicMock(return_value=None),
        set_cached=MagicMock(),
        check_connection=MagicMock(return_value=True),
    )


# API-I01: GET /api/health returns dependency status
class TestHealthEndpoint:
    def test_health_returns_dependencies(self, client):
        with patch("app.routers.health.ch_service") as mock_ch, \
             patch("app.routers.health.pg_service") as mock_pg, \
             patch("app.routers.health.redis_cache") as mock_redis:
            mock_client = MagicMock()
            mock_ch.get_client.return_value = mock_client
            mock_pg.check_connection = AsyncMock(return_value=True)
            mock_redis.check_connection.return_value = True

            resp = client.get("/api/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "ok"
            assert "clickhouse" in data["dependencies"]
            assert "postgres" in data["dependencies"]
            assert "redis" in data["dependencies"]

    def test_health_degraded_when_store_down(self, client):
        with patch("app.routers.health.ch_service") as mock_ch, \
             patch("app.routers.health.pg_service") as mock_pg, \
             patch("app.routers.health.redis_cache") as mock_redis:
            mock_ch.get_client.side_effect = Exception("down")
            mock_pg.check_connection = AsyncMock(return_value=True)
            mock_redis.check_connection.return_value = True

            resp = client.get("/api/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "degraded"
            assert data["dependencies"]["clickhouse"] == "disconnected"


# API-I02: GET /api/metrics/overview returns valid schema
class TestOverviewEndpoint:
    def test_overview_returns_valid_schema(self, client):
        with _patch_redis_cache(), \
             patch("app.routers.overview.ch_service") as mock_ch, \
             patch("app.routers.overview.pg_service") as mock_pg:
            mock_ch.query_overview_kpis.return_value = MOCK_KPIS
            mock_ch.query_usage_trend.return_value = MOCK_USAGE_TREND
            mock_ch.query_team_breakdown.return_value = MOCK_TEAM_BREAKDOWN
            mock_pg.get_team_names = AsyncMock(return_value=MOCK_TEAM_NAMES)

            resp = client.get("/api/metrics/overview?period=30d")
            assert resp.status_code == 200
            data = resp.json()

            assert "kpi_cards" in data
            assert "usage_trend" in data
            assert "team_breakdown" in data
            kpi = data["kpi_cards"]
            assert kpi["total_runs"]["value"] == 5000
            assert kpi["total_runs"]["change_pct"] == 5.2
            assert kpi["total_runs"]["period"] == "30d"


# API-I03: GET /api/metrics/overview with team filter narrows results
class TestOverviewWithFilter:
    def test_team_filter_passed_to_query(self, client):
        with _patch_redis_cache(), \
             patch("app.routers.overview.ch_service") as mock_ch, \
             patch("app.routers.overview.pg_service") as mock_pg:
            mock_ch.query_overview_kpis.return_value = MOCK_KPIS
            mock_ch.query_usage_trend.return_value = MOCK_USAGE_TREND
            mock_ch.query_team_breakdown.return_value = MOCK_TEAM_BREAKDOWN
            mock_pg.get_team_names = AsyncMock(return_value=MOCK_TEAM_NAMES)

            resp = client.get("/api/metrics/overview?period=30d&teams=platform,backend")
            assert resp.status_code == 200

            # Verify the filters were passed with teams
            call_args = mock_ch.query_overview_kpis.call_args
            filters = call_args[0][1]
            assert filters.teams == ["platform", "backend"]


# API-I04: GET /api/metrics/cost with group_by=team returns team breakdown
class TestCostGroupBy:
    def test_cost_group_by_team(self, client):
        mock_cost_breakdown = [
            {"dimension_value": "team_platform", "cost": 600.0, "runs": 500, "cost_per_run": 1.2},
        ]
        with _patch_redis_cache(), \
             patch("app.routers.cost.ch_service") as mock_ch, \
             patch("app.routers.cost.pg_service") as mock_pg:
            mock_ch.query_cost_trend.return_value = [{"date": "2025-01-01", "cost": 50.0}]
            mock_ch.query_cost_breakdown.return_value = mock_cost_breakdown
            mock_ch.query_cost_per_run_trend.return_value = [{"date": "2025-01-01", "avg_cost_per_run": 1.2}]
            mock_ch.query_token_breakdown.return_value = {
                "input_tokens": 1000000,
                "output_tokens": 500000,
                "by_model": [{"model": "gpt-4", "input_tokens": 1000000, "output_tokens": 500000}],
            }
            mock_ch.query_current_month_spend.return_value = 5000.0
            mock_pg.get_org = AsyncMock(return_value=MOCK_ORG)

            resp = client.get("/api/metrics/cost?period=30d&group_by=team")
            assert resp.status_code == 200
            data = resp.json()
            assert "cost_breakdown" in data
            assert data["cost_breakdown"][0]["dimension_value"] == "team_platform"

            # Verify group_by was passed to the query
            call_args = mock_ch.query_cost_breakdown.call_args
            filters = call_args[0][1]
            assert filters.group_by == "team"


# API-I05: GET /api/metrics/performance returns latency percentiles
class TestPerformanceLatency:
    def test_latency_invariant_p50_le_p95_le_p99(self, client):
        mock_latency = [
            {"date": "2025-01-01", "p50": 500, "p95": 2000, "p99": 5000},
            {"date": "2025-01-02", "p50": 450, "p95": 1800, "p99": 4500},
        ]
        with _patch_redis_cache(), \
             patch("app.routers.performance.ch_service") as mock_ch:
            mock_ch.query_success_rate_trend.return_value = [
                {"date": "2025-01-01", "success_rate": 90.0, "failure_rate": 10.0, "error_rate": 8.0}
            ]
            mock_ch.query_latency_trend.return_value = mock_latency
            mock_ch.query_error_breakdown.return_value = [
                {"error_category": "timeout", "count": 50, "percentage": 50.0}
            ]
            mock_ch.query_availability.return_value = {"uptime_pct": 95.0, "period": "30d"}
            mock_ch.query_queue_wait_trend.return_value = [
                {"date": "2025-01-01", "avg_wait_ms": 100, "p95_wait_ms": 500}
            ]

            resp = client.get("/api/metrics/performance?period=30d")
            assert resp.status_code == 200
            data = resp.json()

            for pt in data["latency_trend"]:
                assert pt["p50"] <= pt["p95"] <= pt["p99"]


# API-I06: Redis cache hit returns same data
class TestCacheHit:
    def test_cache_hit_returns_cached_data(self, client):
        cached_data = {
            "kpi_cards": {
                "total_runs": {"value": 999, "change_pct": 1.0, "period": "30d"},
                "active_users": {"value": 10, "change_pct": None, "period": "30d"},
                "total_cost": {"value": 100.0, "change_pct": None, "period": "30d"},
                "success_rate": {"value": 90.0, "change_pct": None, "period": "30d"},
            },
            "usage_trend": [],
            "team_breakdown": [],
        }
        with patch("app.routers.overview.redis_cache") as mock_cache:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = cached_data

            resp = client.get("/api/metrics/overview?period=30d")
            assert resp.status_code == 200
            data = resp.json()
            assert data["kpi_cards"]["total_runs"]["value"] == 999


# API-I07: GET /api/orgs/current returns org with teams and projects
class TestOrgEndpoint:
    def test_org_current_returns_enriched_data(self, client):
        with patch("app.routers.org.redis_cache") as mock_cache, \
             patch("app.routers.org.pg_service") as mock_pg:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_pg.get_org = AsyncMock(return_value=MOCK_ORG)
            mock_pg.get_teams = AsyncMock(return_value=MOCK_TEAMS)
            mock_pg.get_projects = AsyncMock(return_value=MOCK_PROJECTS)
            mock_pg.get_total_licensed_users = AsyncMock(return_value=25)

            resp = client.get("/api/orgs/current")
            assert resp.status_code == 200
            data = resp.json()

            assert data["org_id"] == "org_acme"
            assert data["name"] == "Acme Corp"
            assert data["plan"] == "enterprise"
            assert data["licensed_users"] == 25
            assert len(data["teams"]) == 2
            assert len(data["projects"]) == 1
            assert data["teams"][0]["team_id"] == "team_platform"
            assert data["projects"][0]["project_id"] == "proj_1"


# Mock widget query results
MOCK_WIDGET_TIMESERIES = {
    "type": "timeseries",
    "metric": "run_count",
    "summary": {"value": 5000.0, "change_pct": 5.2},
    "data": [
        {"date": "2025-01-01", "value": 100.0, "is_partial": False},
        {"date": "2025-01-02", "value": 120.0, "is_partial": True},
    ],
}

MOCK_WIDGET_BREAKDOWN = {
    "type": "breakdown",
    "metric": "cost",
    "dimension": "team",
    "data": [
        {"label": "platform", "value": 850.0},
        {"label": "backend", "value": 620.0},
    ],
}


# API-I08: POST /api/metrics/widget returns timeseries response
class TestWidgetTimeseries:
    def test_widget_timeseries_response(self, client):
        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_widget_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_query.return_value = MOCK_WIDGET_TIMESERIES

            resp = client.post("/api/metrics/widget", json={
                "metric": "run_count",
                "period": "30d",
            })
            assert resp.status_code == 200
            data = resp.json()

            assert data["type"] == "timeseries"
            assert data["metric"] == "run_count"
            assert "summary" in data
            assert data["summary"]["value"] == 5000.0
            assert data["summary"]["change_pct"] == 5.2
            assert len(data["data"]) == 2
            assert data["data"][0]["date"] == "2025-01-01"

            # Verify build_widget_query was called with correct args
            mock_query.assert_called_once_with(
                org_id="org_acme",
                metric="run_count",
                period="30d",
                breakdown=None,
                filters=None,
            )


# API-I09: POST /api/metrics/widget with breakdown returns breakdown response
class TestWidgetBreakdown:
    def test_widget_breakdown_response(self, client):
        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_widget_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_query.return_value = MOCK_WIDGET_BREAKDOWN

            resp = client.post("/api/metrics/widget", json={
                "metric": "cost",
                "period": "30d",
                "breakdown": "team",
            })
            assert resp.status_code == 200
            data = resp.json()

            assert data["type"] == "breakdown"
            assert data["metric"] == "cost"
            assert data["dimension"] == "team"
            assert len(data["data"]) == 2
            assert data["data"][0]["label"] == "platform"

    def test_widget_with_filters(self, client):
        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_widget_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_query.return_value = MOCK_WIDGET_TIMESERIES

            resp = client.post("/api/metrics/widget", json={
                "metric": "cost",
                "period": "7d",
                "filters": {
                    "teams": ["platform"],
                    "agent_types": ["coding"],
                },
            })
            assert resp.status_code == 200

            mock_query.assert_called_once_with(
                org_id="org_acme",
                metric="cost",
                period="7d",
                breakdown=None,
                filters={"teams": ["platform"], "agent_types": ["coding"]},
            )


# API-I10: POST /api/metrics/widget validates request body
class TestWidgetValidation:
    def test_invalid_metric_returns_422(self, client):
        resp = client.post("/api/metrics/widget", json={
            "metric": "nonexistent",
            "period": "30d",
        })
        assert resp.status_code == 422

    def test_invalid_period_returns_422(self, client):
        resp = client.post("/api/metrics/widget", json={
            "metric": "run_count",
            "period": "15d",
        })
        assert resp.status_code == 422

    def test_invalid_breakdown_returns_422(self, client):
        resp = client.post("/api/metrics/widget", json={
            "metric": "run_count",
            "period": "30d",
            "breakdown": "nonexistent",
        })
        assert resp.status_code == 422

    def test_missing_metric_returns_422(self, client):
        resp = client.post("/api/metrics/widget", json={
            "period": "30d",
        })
        assert resp.status_code == 422

    def test_widget_cache_hit(self, client):
        cached_data = MOCK_WIDGET_TIMESERIES
        with patch("app.routers.widget.redis_cache") as mock_cache:
            mock_cache.make_cache_key.return_value = "test_widget_key"
            mock_cache.get_cached.return_value = cached_data

            resp = client.post("/api/metrics/widget", json={
                "metric": "run_count",
                "period": "30d",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["type"] == "timeseries"
            assert data["summary"]["value"] == 5000.0

    def test_widget_query_failure_returns_503(self, client):
        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_widget_key"
            mock_cache.get_cached.return_value = None
            mock_query.side_effect = Exception("ClickHouse down")

            resp = client.post("/api/metrics/widget", json={
                "metric": "run_count",
                "period": "30d",
            })
            assert resp.status_code == 503
