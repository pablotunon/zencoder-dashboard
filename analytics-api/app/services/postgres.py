import logging
from typing import Any

import asyncpg

from app.config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            host=settings.postgres_host,
            port=settings.postgres_port,
            database=settings.postgres_db,
            user=settings.postgres_user,
            password=settings.postgres_password,
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_org(org_id: str) -> dict[str, Any] | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT org_id, name, plan, monthly_budget, logo_url FROM organizations WHERE org_id = $1",
        org_id,
    )
    if row is None:
        return None
    return dict(row)


async def get_teams(org_id: str) -> list[dict[str, Any]]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT team_id, name, slug FROM teams WHERE org_id = $1 ORDER BY name",
        org_id,
    )
    return [dict(row) for row in rows]


async def get_projects(org_id: str) -> list[dict[str, Any]]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT project_id, name, repository_url, team_id FROM projects WHERE org_id = $1 ORDER BY name",
        org_id,
    )
    return [dict(row) for row in rows]


async def get_users(org_id: str) -> list[dict[str, Any]]:
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT u.user_id, u.name, u.avatar_url, u.team_id, t.name AS team_name
           FROM users u
           JOIN teams t ON u.team_id = t.team_id
           WHERE u.org_id = $1 AND u.is_active = TRUE
           ORDER BY u.name""",
        org_id,
    )
    return [dict(row) for row in rows]


async def get_team_names(org_id: str) -> dict[str, str]:
    """Return team_id -> team_name mapping."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT team_id, name FROM teams WHERE org_id = $1",
        org_id,
    )
    return {row["team_id"]: row["name"] for row in rows}


async def get_project_names(org_id: str) -> dict[str, str]:
    """Return project_id -> project_name mapping."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT project_id, name FROM projects WHERE org_id = $1",
        org_id,
    )
    return {row["project_id"]: row["name"] for row in rows}


async def get_total_licensed_users(org_id: str) -> int:
    pool = await get_pool()
    count = await pool.fetchval(
        "SELECT count(*) FROM users WHERE org_id = $1 AND is_active = TRUE",
        org_id,
    )
    return count or 0


async def get_user_by_email(email: str) -> dict[str, Any] | None:
    """Look up a user by email (globally unique)."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """SELECT u.user_id, u.org_id, u.team_id, u.name, u.email, u.avatar_url,
                  u.role, u.password_hash, u.is_active,
                  o.name AS org_name, o.plan AS org_plan
           FROM users u
           JOIN organizations o ON u.org_id = o.org_id
           WHERE u.email = $1""",
        email,
    )
    if row is None:
        return None
    return dict(row)


async def check_connection() -> bool:
    try:
        pool = await get_pool()
        await pool.fetchval("SELECT 1")
        return True
    except Exception:
        logger.exception("PostgreSQL health check failed")
        return False
