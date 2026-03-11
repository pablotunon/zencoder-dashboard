"""Integration tests for Analytics API — API-I01 through API-I14.

These tests use mocked service layers to validate endpoint behavior
without requiring actual database connections.
"""
import inspect
import re
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_org_context
from app.main import app
from app.models.auth import OrgContext

MOCK_ORG_CONTEXT = OrgContext(
    org_id="org_acme", user_id="user_test", role="admin", team_id="team_platform"
)

MOCK_GLOBEX_CONTEXT = OrgContext(
    org_id="org_globex", user_id="user_globex_admin", role="admin", team_id="team_engineering"
)


@pytest.fixture
def client():
    app.dependency_overrides[get_org_context] = lambda: MOCK_ORG_CONTEXT
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def globex_client():
    app.dependency_overrides[get_org_context] = lambda: MOCK_GLOBEX_CONTEXT
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


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

MOCK_USAGE_TREND = {
    "granularity": "day",
    "data": [
        {"timestamp": "2025-01-01", "runs": 100, "cost": 50.0},
        {"timestamp": "2025-01-02", "runs": 120, "cost": 60.0},
    ],
}

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

            resp = client.get("/api/metrics/overview")
            assert resp.status_code == 200
            data = resp.json()

            assert "kpi_cards" in data
            assert "usage_trend" in data
            assert "team_breakdown" in data
            kpi = data["kpi_cards"]
            assert kpi["total_runs"]["value"] == 5000
            assert kpi["total_runs"]["change_pct"] == 5.2


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

            resp = client.get("/api/metrics/overview?teams=platform,backend")
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
            mock_ch.query_cost_trend.return_value = {"granularity": "day", "data": [{"timestamp": "2025-01-01", "cost": 50.0}]}
            mock_ch.query_cost_breakdown.return_value = mock_cost_breakdown
            mock_ch.query_cost_per_run_trend.return_value = {"granularity": "day", "data": [{"timestamp": "2025-01-01", "avg_cost_per_run": 1.2}]}
            mock_ch.query_token_breakdown.return_value = {
                "input_tokens": 1000000,
                "output_tokens": 500000,
                "by_model": [{"model": "gpt-4", "input_tokens": 1000000, "output_tokens": 500000}],
            }
            mock_ch.query_current_month_spend.return_value = 5000.0
            mock_pg.get_org = AsyncMock(return_value=MOCK_ORG)

            resp = client.get("/api/metrics/cost?group_by=team")
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
            {"timestamp": "2025-01-01", "p50": 500, "p95": 2000, "p99": 5000},
            {"timestamp": "2025-01-02", "p50": 450, "p95": 1800, "p99": 4500},
        ]
        with _patch_redis_cache(), \
             patch("app.routers.performance.ch_service") as mock_ch:
            mock_ch.query_success_rate_trend.return_value = {
                "granularity": "day",
                "data": [{"timestamp": "2025-01-01", "success_rate": 90.0, "failure_rate": 10.0, "error_rate": 8.0}],
            }
            mock_ch.query_latency_trend.return_value = {
                "granularity": "day",
                "data": mock_latency,
            }
            mock_ch.query_error_breakdown.return_value = [
                {"error_category": "timeout", "count": 50, "percentage": 50.0}
            ]
            mock_ch.query_availability.return_value = {"uptime_pct": 95.0}
            mock_ch.query_queue_wait_trend.return_value = {
                "granularity": "day",
                "data": [{"timestamp": "2025-01-01", "avg_wait_ms": 100, "p95_wait_ms": 500}],
            }

            resp = client.get("/api/metrics/performance")
            assert resp.status_code == 200
            data = resp.json()

            for pt in data["latency_trend"]:
                assert pt["p50"] <= pt["p95"] <= pt["p99"]


# API-I06: Redis cache hit returns same data
class TestCacheHit:
    def test_cache_hit_returns_cached_data(self, client):
        cached_data = {
            "kpi_cards": {
                "total_runs": {"value": 999, "change_pct": 1.0},
                "active_users": {"value": 10, "change_pct": None},
                "total_cost": {"value": 100.0, "change_pct": None},
                "success_rate": {"value": 90.0, "change_pct": None},
            },
            "usage_trend": [],
            "usage_trend_granularity": "day",
            "team_breakdown": [],
        }
        with patch("app.routers.overview.redis_cache") as mock_cache:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = cached_data

            resp = client.get("/api/metrics/overview")
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


# API-I08: Cross-org isolation — queries always receive the caller's org_id
class TestCrossOrgIsolation:
    """Verify that each metrics endpoint passes the authenticated org_id
    to every ClickHouse and PostgreSQL service call, preventing data leakage."""

    def test_overview_queries_scoped_to_org(self, client):
        """Acme context → all overview service calls receive 'org_acme'."""
        with _patch_redis_cache(), \
             patch("app.routers.overview.ch_service") as mock_ch, \
             patch("app.routers.overview.pg_service") as mock_pg:
            mock_ch.query_overview_kpis.return_value = MOCK_KPIS
            mock_ch.query_usage_trend.return_value = MOCK_USAGE_TREND
            mock_ch.query_team_breakdown.return_value = MOCK_TEAM_BREAKDOWN
            mock_pg.get_team_names = AsyncMock(return_value=MOCK_TEAM_NAMES)

            resp = client.get("/api/metrics/overview")
            assert resp.status_code == 200

            for call_name in ("query_overview_kpis", "query_usage_trend", "query_team_breakdown"):
                call_args = getattr(mock_ch, call_name).call_args
                assert call_args[0][0] == "org_acme", f"{call_name} received wrong org_id"

            mock_pg.get_team_names.assert_called_once_with("org_acme")

    def test_overview_queries_scoped_to_globex(self, globex_client):
        """Globex context → all overview service calls receive 'org_globex'."""
        with _patch_redis_cache(), \
             patch("app.routers.overview.ch_service") as mock_ch, \
             patch("app.routers.overview.pg_service") as mock_pg:
            mock_ch.query_overview_kpis.return_value = MOCK_KPIS
            mock_ch.query_usage_trend.return_value = MOCK_USAGE_TREND
            mock_ch.query_team_breakdown.return_value = MOCK_TEAM_BREAKDOWN
            mock_pg.get_team_names = AsyncMock(return_value={})

            resp = globex_client.get("/api/metrics/overview")
            assert resp.status_code == 200

            for call_name in ("query_overview_kpis", "query_usage_trend", "query_team_breakdown"):
                call_args = getattr(mock_ch, call_name).call_args
                assert call_args[0][0] == "org_globex", f"{call_name} received wrong org_id"

            mock_pg.get_team_names.assert_called_once_with("org_globex")

    def test_cost_queries_scoped_to_org(self, client):
        """Acme context → all cost service calls receive 'org_acme'."""
        with _patch_redis_cache(), \
             patch("app.routers.cost.ch_service") as mock_ch, \
             patch("app.routers.cost.pg_service") as mock_pg:
            mock_ch.query_cost_trend.return_value = {"granularity": "day", "data": []}
            mock_ch.query_cost_breakdown.return_value = []
            mock_ch.query_cost_per_run_trend.return_value = {"granularity": "day", "data": []}
            mock_ch.query_token_breakdown.return_value = {
                "input_tokens": 0, "output_tokens": 0, "by_model": [],
            }
            mock_ch.query_current_month_spend.return_value = 0.0
            mock_pg.get_org = AsyncMock(return_value=MOCK_ORG)

            resp = client.get("/api/metrics/cost")
            assert resp.status_code == 200

            for call_name in ("query_cost_trend", "query_cost_breakdown",
                              "query_cost_per_run_trend", "query_token_breakdown"):
                call_args = getattr(mock_ch, call_name).call_args
                assert call_args[0][0] == "org_acme", f"{call_name} received wrong org_id"

            mock_ch.query_current_month_spend.assert_called_once_with("org_acme")

    def test_performance_queries_scoped_to_org(self, client):
        """Acme context → all performance service calls receive 'org_acme'."""
        with _patch_redis_cache(), \
             patch("app.routers.performance.ch_service") as mock_ch:
            mock_ch.query_success_rate_trend.return_value = {"granularity": "day", "data": []}
            mock_ch.query_latency_trend.return_value = {"granularity": "day", "data": []}
            mock_ch.query_error_breakdown.return_value = []
            mock_ch.query_availability.return_value = {"uptime_pct": 99.0}
            mock_ch.query_queue_wait_trend.return_value = {"granularity": "day", "data": []}

            resp = client.get("/api/metrics/performance")
            assert resp.status_code == 200

            for call_name in ("query_success_rate_trend", "query_latency_trend",
                              "query_error_breakdown", "query_availability",
                              "query_queue_wait_trend"):
                call_args = getattr(mock_ch, call_name).call_args
                assert call_args[0][0] == "org_acme", f"{call_name} received wrong org_id"

    def test_org_endpoint_scoped_to_org(self, client):
        """Acme context → org endpoint queries use 'org_acme'."""
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

            mock_pg.get_org.assert_called_once_with("org_acme")
            mock_pg.get_teams.assert_called_once_with("org_acme")
            mock_pg.get_projects.assert_called_once_with("org_acme")
            mock_pg.get_total_licensed_users.assert_called_once_with("org_acme")


# API-I09: Cache key isolation — different orgs never share cache entries
class TestCacheKeyIsolation:
    """Verify that make_cache_key produces distinct keys for different org_ids,
    ensuring one org's cached data is never served to another."""

    def test_same_endpoint_different_orgs_different_keys(self):
        from app.services.redis_cache import make_cache_key

        filters = {"start": "2026-02-09T00:00:00Z", "end": "2026-03-11T00:00:00Z"}
        acme_key = make_cache_key("org_acme", "overview", filters)
        globex_key = make_cache_key("org_globex", "overview", filters)

        assert acme_key != globex_key
        assert "org_acme" in acme_key
        assert "org_globex" in globex_key

    def test_cache_key_contains_org_id_prefix(self):
        from app.services.redis_cache import make_cache_key

        for endpoint in ("overview", "usage", "cost", "performance", "org"):
            key = make_cache_key("org_acme", endpoint, {"start": "2026-02-09T00:00:00Z", "end": "2026-03-11T00:00:00Z"})
            assert key.startswith("metrics:org_acme:"), (
                f"Cache key for {endpoint} missing org_id prefix: {key}"
            )

    def test_cache_hit_for_acme_not_served_to_globex(self, client, globex_client):
        """Simulate: Acme request caches data, then Globex request must miss."""
        acme_cached = {
            "kpi_cards": {
                "total_runs": {"value": 9999, "change_pct": 1.0},
                "active_users": {"value": 10, "change_pct": None},
                "total_cost": {"value": 100.0, "change_pct": None},
                "success_rate": {"value": 90.0, "change_pct": None},
            },
            "usage_trend": [],
            "usage_trend_granularity": "day",
            "team_breakdown": [],
        }

        # Acme request: cache hit returns the cached data
        with patch("app.routers.overview.redis_cache") as mock_cache:
            mock_cache.make_cache_key.return_value = "metrics:org_acme:overview:abc"
            mock_cache.get_cached.return_value = acme_cached
            resp = client.get("/api/metrics/overview")
            assert resp.status_code == 200
            assert resp.json()["kpi_cards"]["total_runs"]["value"] == 9999

        # Globex request: different cache key → cache miss → fresh query
        with _patch_redis_cache(), \
             patch("app.routers.overview.ch_service") as mock_ch, \
             patch("app.routers.overview.pg_service") as mock_pg:
            mock_ch.query_overview_kpis.return_value = MOCK_KPIS
            mock_ch.query_usage_trend.return_value = MOCK_USAGE_TREND
            mock_ch.query_team_breakdown.return_value = MOCK_TEAM_BREAKDOWN
            mock_pg.get_team_names = AsyncMock(return_value={})

            resp = globex_client.get("/api/metrics/overview")
            assert resp.status_code == 200
            # Globex sees fresh query data (5000), not Acme's cached data (9999)
            assert resp.json()["kpi_cards"]["total_runs"]["value"] == 5000


# API-I10: Static analysis — all ClickHouse query functions filter by org_id
class TestClickHouseOrgIdFiltering:
    """Verify via static analysis that every ClickHouse query function in the
    service layer includes org_id filtering, preventing accidental cross-org
    data exposure."""

    def test_all_query_functions_accept_org_id_parameter(self):
        """Every query_* function must accept org_id as its first parameter."""
        from app.services import clickhouse as ch

        query_funcs = [
            name for name, obj in inspect.getmembers(ch, inspect.isfunction)
            if name.startswith("query_")
        ]
        assert len(query_funcs) > 0, "No query functions found"

        for name in query_funcs:
            func = getattr(ch, name)
            params = list(inspect.signature(func).parameters.keys())
            assert params[0] == "org_id", (
                f"{name}() first parameter is '{params[0]}', expected 'org_id'"
            )

    def test_all_query_functions_contain_org_id_where_clause(self):
        """Every query_* function must contain 'org_id' in a WHERE clause
        within its SQL string."""
        from app.services import clickhouse as ch

        query_funcs = [
            name for name, obj in inspect.getmembers(ch, inspect.isfunction)
            if name.startswith("query_")
        ]

        org_id_pattern = re.compile(r"WHERE\b.*org_id", re.IGNORECASE | re.DOTALL)

        for name in query_funcs:
            source = inspect.getsource(getattr(ch, name))
            assert org_id_pattern.search(source), (
                f"{name}() does not contain org_id in a WHERE clause"
            )


# Mock widget query results
MOCK_WIDGET_TIMESERIES = {
    "type": "timeseries",
    "metric": "run_count",
    "granularity": "day",
    "summary": {"value": 5000.0, "change_pct": 5.2},
    "data": [
        {"timestamp": "2025-01-01T00:00:00", "value": 100.0, "is_partial": False},
        {"timestamp": "2025-01-02T00:00:00", "value": 120.0, "is_partial": True},
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


# API-I11: POST /api/metrics/widget returns timeseries response
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
            })
            assert resp.status_code == 200
            data = resp.json()

            assert data["type"] == "timeseries"
            assert data["metric"] == "run_count"
            assert "summary" in data
            assert data["summary"]["value"] == 5000.0
            assert data["summary"]["change_pct"] == 5.2
            assert len(data["data"]) == 2
            assert data["data"][0]["timestamp"] == "2025-01-01T00:00:00"

            # Verify build_widget_query was called with correct args
            call_kwargs = mock_query.call_args[1]
            assert call_kwargs["org_id"] == "org_acme"
            assert call_kwargs["metric"] == "run_count"
            assert call_kwargs["breakdown"] is None
            assert call_kwargs["filters"] is None
            assert "start" in call_kwargs
            assert "end" in call_kwargs


# API-I12: POST /api/metrics/widget with breakdown returns breakdown response
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
                "filters": {
                    "teams": ["platform"],
                    "agent_types": ["coding"],
                },
            })
            assert resp.status_code == 200

            call_kwargs = mock_query.call_args[1]
            assert call_kwargs["org_id"] == "org_acme"
            assert call_kwargs["metric"] == "cost"
            assert call_kwargs["breakdown"] is None
            assert call_kwargs["filters"] == {"teams": ["platform"], "agent_types": ["coding"]}
            assert "start" in call_kwargs
            assert "end" in call_kwargs


# API-I13: POST /api/metrics/widget validates request body
class TestWidgetValidation:
    def test_invalid_metric_returns_422(self, client):
        resp = client.post("/api/metrics/widget", json={
            "metric": "nonexistent",
        })
        assert resp.status_code == 422

    def test_start_after_end_returns_422(self, client):
        resp = client.post("/api/metrics/widget", json={
            "metric": "run_count",
            "start": "2026-03-10T00:00:00Z",
            "end": "2026-03-05T00:00:00Z",
        })
        assert resp.status_code == 422

    def test_invalid_breakdown_returns_422(self, client):
        resp = client.post("/api/metrics/widget", json={
            "metric": "run_count",
            "breakdown": "nonexistent",
        })
        assert resp.status_code == 422

    def test_missing_metric_returns_422(self, client):
        resp = client.post("/api/metrics/widget", json={})
        assert resp.status_code == 422

    def test_widget_cache_hit(self, client):
        cached_data = MOCK_WIDGET_TIMESERIES
        with patch("app.routers.widget.redis_cache") as mock_cache:
            mock_cache.make_cache_key.return_value = "test_widget_key"
            mock_cache.get_cached.return_value = cached_data

            resp = client.post("/api/metrics/widget", json={
                "metric": "run_count",
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
            })
            assert resp.status_code == 503


# API-I14: Widget NaN handling — quantile/avg on empty data must not produce 500
class TestWidgetNanHandling:
    """ClickHouse quantile() and avg() return nan on empty result sets.
    Python's json.dumps rejects float('nan') with ValueError, causing a 500.
    These tests verify that the centralized NanSafeJSONResponse serializer
    converts NaN to null at the HTTP boundary, preventing 500 errors."""

    def test_nan_timeseries_endpoint_returns_200(self, client):
        """Endpoint must return 200 with null values when build_widget_query
        produces NaN (from empty ClickHouse quantile/avg results)."""
        nan_response = {
            "type": "timeseries",
            "metric": "latency_p50",
            "summary": {"value": float("nan"), "change_pct": None},
            "data": [{"timestamp": "2025-01-15", "value": float("nan"), "is_partial": False}],
        }
        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_query.return_value = nan_response

            resp = client.post("/api/metrics/widget", json={
                "metric": "latency_p50",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["summary"]["value"] is None
            assert data["data"][0]["value"] is None

    def test_nan_breakdown_endpoint_returns_200(self, client):
        """Breakdown response with NaN values must serialize to null."""
        nan_response = {
            "type": "breakdown",
            "metric": "queue_wait_avg",
            "dimension": "team",
            "data": [
                {"label": "platform", "value": float("nan")},
                {"label": "backend", "value": float("inf")},
            ],
        }
        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_query.return_value = nan_response

            resp = client.post("/api/metrics/widget", json={
                "metric": "queue_wait_avg",
                "breakdown": "team",
            })
            assert resp.status_code == 200
            data = resp.json()
            for pt in data["data"]:
                assert pt["value"] is None

    def test_all_nan_prone_metrics_return_200(self, client):
        """All metrics using quantile/avg must return 200 even with NaN data."""
        nan_metrics = ["latency_p50", "latency_p95", "latency_p99", "queue_wait_avg", "queue_wait_p95"]

        for metric in nan_metrics:
            nan_response = {
                "type": "timeseries",
                "metric": metric,
                "summary": {"value": float("nan"), "change_pct": float("nan")},
                "data": [],
            }
            with patch("app.routers.widget.redis_cache") as mock_cache, \
                 patch("app.routers.widget.build_widget_query") as mock_query:
                mock_cache.make_cache_key.return_value = "test_key"
                mock_cache.get_cached.return_value = None
                mock_cache.set_cached = MagicMock()
                mock_query.return_value = nan_response

                resp = client.post("/api/metrics/widget", json={
                    "metric": metric,
                })
                assert resp.status_code == 200, f"{metric} returned {resp.status_code}"
                data = resp.json()
                assert data["summary"]["value"] is None
                assert data["summary"]["change_pct"] is None

    def test_finite_values_pass_through_unchanged(self, client):
        """Normal finite values must not be affected by NaN sanitization."""
        normal_response = {
            "type": "timeseries",
            "metric": "latency_p50",
            "summary": {"value": 123.45, "change_pct": -2.3},
            "data": [{"timestamp": "2025-01-15", "value": 99.9, "is_partial": False}],
        }
        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_query.return_value = normal_response

            resp = client.post("/api/metrics/widget", json={
                "metric": "latency_p50",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["summary"]["value"] == 123.45
            assert data["summary"]["change_pct"] == -2.3
            assert data["data"][0]["value"] == 99.9


# Mock data for batch widget tests
MOCK_WIDGET_COST_TIMESERIES = {
    "type": "timeseries",
    "metric": "cost",
    "granularity": "day",
    "summary": {"value": 1847.50, "change_pct": -3.2},
    "data": [
        {"timestamp": "2025-01-01T00:00:00", "value": 62.30, "is_partial": False},
    ],
}


# API-I15: POST /api/metrics/widget/batch returns batch timeseries response
class TestWidgetBatchTimeseries:
    def test_batch_returns_results_for_each_metric(self, client):
        def mock_build(org_id, metric, start, end, breakdown, filters):
            if metric == "run_count":
                return MOCK_WIDGET_TIMESERIES
            return MOCK_WIDGET_COST_TIMESERIES

        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_query.side_effect = mock_build

            resp = client.post("/api/metrics/widget/batch", json={
                "metrics": ["run_count", "cost"],
            })
            assert resp.status_code == 200
            data = resp.json()

            assert "results" in data
            assert "run_count" in data["results"]
            assert "cost" in data["results"]
            assert data["results"]["run_count"]["type"] == "timeseries"
            assert data["results"]["run_count"]["metric"] == "run_count"
            assert data["results"]["cost"]["type"] == "timeseries"
            assert data["results"]["cost"]["metric"] == "cost"
            assert mock_query.call_count == 2


# API-I16: POST /api/metrics/widget/batch with breakdown returns breakdown response
class TestWidgetBatchBreakdown:
    def test_batch_breakdown_response(self, client):
        mock_breakdown_cost = {
            "type": "breakdown",
            "metric": "cost",
            "dimension": "team",
            "data": [{"label": "platform", "value": 850.0}],
        }
        mock_breakdown_runs = {
            "type": "breakdown",
            "metric": "run_count",
            "dimension": "team",
            "data": [{"label": "platform", "value": 5000}],
        }

        def mock_build(org_id, metric, start, end, breakdown, filters):
            if metric == "run_count":
                return mock_breakdown_runs
            return mock_breakdown_cost

        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = None
            mock_cache.set_cached = MagicMock()
            mock_query.side_effect = mock_build

            resp = client.post("/api/metrics/widget/batch", json={
                "metrics": ["run_count", "cost"],
                "breakdown": "team",
            })
            assert resp.status_code == 200
            data = resp.json()

            assert data["results"]["run_count"]["type"] == "breakdown"
            assert data["results"]["run_count"]["dimension"] == "team"
            assert data["results"]["cost"]["type"] == "breakdown"


# API-I17: POST /api/metrics/widget/batch validation errors
class TestWidgetBatchValidation:
    def test_empty_metrics_returns_422(self, client):
        resp = client.post("/api/metrics/widget/batch", json={
            "metrics": [],
        })
        assert resp.status_code == 422

    def test_invalid_metric_in_batch_returns_422(self, client):
        resp = client.post("/api/metrics/widget/batch", json={
            "metrics": ["run_count", "nonexistent"],
        })
        assert resp.status_code == 422

    def test_duplicate_metrics_returns_422(self, client):
        resp = client.post("/api/metrics/widget/batch", json={
            "metrics": ["run_count", "cost", "run_count"],
        })
        assert resp.status_code == 422

    def test_more_than_10_metrics_returns_422(self, client):
        resp = client.post("/api/metrics/widget/batch", json={
            "metrics": [
                "run_count", "active_users", "cost", "cost_per_run",
                "success_rate", "failure_rate", "error_rate",
                "latency_p50", "latency_p95", "latency_p99",
                "tokens_input",
            ],
        })
        assert resp.status_code == 422

    def test_missing_metrics_returns_422(self, client):
        resp = client.post("/api/metrics/widget/batch", json={})
        assert resp.status_code == 422


# API-I18: POST /api/metrics/widget/batch per-metric caching
class TestWidgetBatchCache:
    def test_cache_hit_avoids_query(self, client):
        """When all metrics are cached, build_widget_query is never called."""
        cached_run_count = MOCK_WIDGET_TIMESERIES
        cached_cost = MOCK_WIDGET_COST_TIMESERIES

        call_count = 0

        def mock_get_cached(key):
            if "run_count" in key:
                return cached_run_count
            if "cost" in key:
                return cached_cost
            return None

        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            # Use real-ish cache key generation to differentiate metrics
            mock_cache.make_cache_key.side_effect = lambda org, ep, params: f"key:{params.get('metric', 'unknown')}"
            mock_cache.get_cached.side_effect = mock_get_cached
            mock_cache.set_cached = MagicMock()

            resp = client.post("/api/metrics/widget/batch", json={
                "metrics": ["run_count", "cost"],
            })
            assert resp.status_code == 200
            data = resp.json()

            assert data["results"]["run_count"]["metric"] == "run_count"
            assert data["results"]["cost"]["metric"] == "cost"
            mock_query.assert_not_called()

    def test_partial_cache_hit(self, client):
        """When some metrics are cached and others aren't, only uncached are queried."""
        def mock_get_cached(key):
            if "run_count" in key:
                return MOCK_WIDGET_TIMESERIES
            return None

        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.side_effect = lambda org, ep, params: f"key:{params.get('metric', 'unknown')}"
            mock_cache.get_cached.side_effect = mock_get_cached
            mock_cache.set_cached = MagicMock()
            mock_query.return_value = MOCK_WIDGET_COST_TIMESERIES

            resp = client.post("/api/metrics/widget/batch", json={
                "metrics": ["run_count", "cost"],
            })
            assert resp.status_code == 200

            # Only cost should have been queried
            assert mock_query.call_count == 1
            call_kwargs = mock_query.call_args[1]
            assert call_kwargs["metric"] == "cost"


# API-I19: POST /api/metrics/widget/batch requires auth
class TestWidgetBatchAuth:
    def test_batch_requires_auth(self):
        """Without auth override, batch endpoint returns 401."""
        app.dependency_overrides.clear()
        unauthenticated_client = TestClient(app, raise_server_exceptions=False)
        resp = unauthenticated_client.post("/api/metrics/widget/batch", json={
            "metrics": ["run_count", "cost"],
        })
        assert resp.status_code == 401


# API-I20: POST /api/metrics/widget/batch query failure returns 503
class TestWidgetBatchFailure:
    def test_query_failure_returns_503(self, client):
        with patch("app.routers.widget.redis_cache") as mock_cache, \
             patch("app.routers.widget.build_widget_query") as mock_query:
            mock_cache.make_cache_key.return_value = "test_key"
            mock_cache.get_cached.return_value = None
            mock_query.side_effect = Exception("ClickHouse down")

            resp = client.post("/api/metrics/widget/batch", json={
                "metrics": ["run_count"],
            })
            assert resp.status_code == 503
