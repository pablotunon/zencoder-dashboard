"""Enrich events with org/team data from PostgreSQL.

Caches user→team and project→team mappings in memory,
refreshing periodically.
"""

import logging
import time

import psycopg2

from app.config import Config

logger = logging.getLogger(__name__)

# Refresh cache every 5 minutes
CACHE_TTL_SECONDS = 300


class EnrichmentCache:
    """In-memory cache for user→team and project→team mappings."""

    def __init__(self, config: Config):
        self.config = config
        self._user_team_map: dict[str, str] = {}
        self._project_team_map: dict[str, str] = {}
        self._last_refresh: float = 0

    def _connect(self) -> psycopg2.extensions.connection:
        return psycopg2.connect(
            host=self.config.POSTGRES_HOST,
            port=self.config.POSTGRES_PORT,
            dbname=self.config.POSTGRES_DB,
            user=self.config.POSTGRES_USER,
            password=self.config.POSTGRES_PASSWORD,
        )

    def refresh(self) -> None:
        """Load mappings from PostgreSQL."""
        now = time.time()
        if now - self._last_refresh < CACHE_TTL_SECONDS:
            return

        try:
            conn = self._connect()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT user_id, team_id FROM users")
                    self._user_team_map = {
                        row[0]: row[1] for row in cur.fetchall()
                    }

                    cur.execute("SELECT project_id, team_id FROM projects")
                    self._project_team_map = {
                        row[0]: row[1] for row in cur.fetchall()
                    }
            finally:
                conn.close()

            self._last_refresh = now
            logger.info(
                "Refreshed enrichment cache: %d users, %d projects",
                len(self._user_team_map),
                len(self._project_team_map),
            )
        except psycopg2.Error as e:
            logger.error("Failed to refresh enrichment cache: %s", e)

    def get_team_for_user(self, user_id: str) -> str | None:
        """Look up the team_id for a user."""
        return self._user_team_map.get(user_id)

    def get_team_for_project(self, project_id: str) -> str | None:
        """Look up the team_id for a project."""
        return self._project_team_map.get(project_id)
