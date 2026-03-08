"""Tests for the enrichment module.

AGG-U06: Enrichment: user → team mapping.
"""

import pytest
from app.config import Config
from app.enrichment import EnrichmentCache


class TestEnrichmentCache:
    """AGG-U06: user_id resolved to correct team_id via PostgreSQL data."""

    def _make_cache_with_data(self) -> EnrichmentCache:
        config = Config()
        cache = EnrichmentCache(config)
        cache._user_team_map = {
            "user_001": "team_platform", "user_002": "team_platform",
            "user_003": "team_backend", "user_004": "team_frontend",
            "user_005": "team_data",
        }
        cache._project_team_map = {
            "proj_001": "team_platform", "proj_002": "team_backend",
            "proj_003": "team_frontend",
        }
        cache._last_refresh = 999999999999.0
        return cache

    @pytest.mark.parametrize("user_id,expected_team", [
        ("user_001", "team_platform"),
        ("user_003", "team_backend"),
        ("user_004", "team_frontend"),
        ("user_unknown", None),
    ])
    def test_user_team_lookup(self, user_id, expected_team):
        cache = self._make_cache_with_data()
        assert cache.get_team_for_user(user_id) == expected_team

    @pytest.mark.parametrize("project_id,expected_team", [
        ("proj_001", "team_platform"),
        ("proj_002", "team_backend"),
        ("proj_unknown", None),
    ])
    def test_project_team_lookup(self, project_id, expected_team):
        cache = self._make_cache_with_data()
        assert cache.get_team_for_project(project_id) == expected_team
