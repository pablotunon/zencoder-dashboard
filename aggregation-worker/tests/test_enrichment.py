"""Tests for the enrichment module.

AGG-U06: Enrichment: user → team mapping.
"""

from unittest.mock import MagicMock, patch

from app.config import Config
from app.enrichment import EnrichmentCache


class TestEnrichmentCache:
    """AGG-U06: user_id resolved to correct team_id via PostgreSQL data."""

    def _make_cache_with_data(self) -> EnrichmentCache:
        """Create an enrichment cache pre-populated with test data."""
        config = Config()
        cache = EnrichmentCache(config)

        # Directly set the internal maps (bypassing PostgreSQL)
        cache._user_team_map = {
            "user_001": "team_platform",
            "user_002": "team_platform",
            "user_003": "team_backend",
            "user_004": "team_frontend",
            "user_005": "team_data",
        }
        cache._project_team_map = {
            "proj_001": "team_platform",
            "proj_002": "team_backend",
            "proj_003": "team_frontend",
        }
        cache._last_refresh = 999999999999.0  # Far future so no auto-refresh
        return cache

    def test_user_team_lookup(self):
        """Known user_id resolves to correct team_id."""
        cache = self._make_cache_with_data()

        assert cache.get_team_for_user("user_001") == "team_platform"
        assert cache.get_team_for_user("user_003") == "team_backend"
        assert cache.get_team_for_user("user_004") == "team_frontend"

    def test_unknown_user_returns_none(self):
        """Unknown user_id returns None."""
        cache = self._make_cache_with_data()

        assert cache.get_team_for_user("user_unknown") is None

    def test_project_team_lookup(self):
        """Known project_id resolves to correct team_id."""
        cache = self._make_cache_with_data()

        assert cache.get_team_for_project("proj_001") == "team_platform"
        assert cache.get_team_for_project("proj_002") == "team_backend"

    def test_unknown_project_returns_none(self):
        """Unknown project_id returns None."""
        cache = self._make_cache_with_data()

        assert cache.get_team_for_project("proj_unknown") is None
