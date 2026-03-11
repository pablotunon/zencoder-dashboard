"""
Database access layer for user_pages (CRUD, slug generation, seeding, reorder).
"""
import json
import logging
import re
import uuid
from typing import Any

from app.services import postgres as pg_service
from app.services.page_templates import TEMPLATE_LIST

logger = logging.getLogger(__name__)


def _generate_slug(name: str) -> str:
    """Convert a page name to a URL-friendly slug."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "page"


async def _unique_slug(user_id: str, base_slug: str, exclude_page_id: str | None = None) -> str:
    """Return a slug unique for this user, appending -2, -3, etc. on collision."""
    pool = await pg_service.get_pool()
    slug = base_slug
    suffix = 2
    while True:
        if exclude_page_id:
            row = await pool.fetchrow(
                "SELECT 1 FROM user_pages WHERE user_id = $1 AND slug = $2 AND page_id != $3",
                user_id, slug, exclude_page_id,
            )
        else:
            row = await pool.fetchrow(
                "SELECT 1 FROM user_pages WHERE user_id = $1 AND slug = $2",
                user_id, slug,
            )
        if row is None:
            return slug
        slug = f"{base_slug}-{suffix}"
        suffix += 1


def _row_to_dict(row) -> dict[str, Any]:
    """Convert an asyncpg Record to a dict with layout parsed from JSON string if needed."""
    d = dict(row)
    # asyncpg returns JSONB as Python objects already, but handle string case
    if isinstance(d.get("layout"), str):
        d["layout"] = json.loads(d["layout"])
    return d


async def get_user_pages(user_id: str) -> list[dict[str, Any]]:
    """All pages for a user, ordered by sort_order."""
    pool = await pg_service.get_pool()
    rows = await pool.fetch(
        """SELECT page_id, name, slug, icon, sort_order
           FROM user_pages
           WHERE user_id = $1
           ORDER BY sort_order, created_at""",
        user_id,
    )
    return [dict(row) for row in rows]


async def get_page_by_slug(user_id: str, slug: str) -> dict[str, Any] | None:
    """Single page lookup by slug."""
    pool = await pg_service.get_pool()
    row = await pool.fetchrow(
        """SELECT page_id, name, slug, icon, layout, sort_order
           FROM user_pages
           WHERE user_id = $1 AND slug = $2""",
        user_id, slug,
    )
    if row is None:
        return None
    return _row_to_dict(row)


async def create_page(
    user_id: str,
    org_id: str,
    name: str,
    icon: str = "squares-2x2",
    layout: list | None = None,
) -> dict[str, Any]:
    """Create a new page. Returns the created page dict."""
    pool = await pg_service.get_pool()
    page_id = str(uuid.uuid4())
    slug = await _unique_slug(user_id, _generate_slug(name))

    # Determine sort_order (append at end)
    max_order = await pool.fetchval(
        "SELECT COALESCE(MAX(sort_order), -1) FROM user_pages WHERE user_id = $1",
        user_id,
    )
    sort_order = max_order + 1

    layout_json = json.dumps(layout or [])
    row = await pool.fetchrow(
        """INSERT INTO user_pages (page_id, user_id, org_id, name, slug, icon, layout, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
           RETURNING page_id, name, slug, icon, layout, sort_order""",
        page_id, user_id, org_id, name, slug, icon, layout_json, sort_order,
    )
    return _row_to_dict(row)


async def update_page(
    user_id: str,
    slug: str,
    *,
    name: str | None = None,
    icon: str | None = None,
    layout: list | None = None,
) -> dict[str, Any] | None:
    """Partial update of a page. Returns updated page or None if not found."""
    pool = await pg_service.get_pool()

    # Fetch current page
    current = await pool.fetchrow(
        "SELECT page_id, name, slug, icon FROM user_pages WHERE user_id = $1 AND slug = $2",
        user_id, slug,
    )
    if current is None:
        return None

    page_id = current["page_id"]
    new_name = name if name is not None else current["name"]
    new_icon = icon if icon is not None else current["icon"]

    # Recalculate slug if name changed
    new_slug = current["slug"]
    if name is not None and name != current["name"]:
        new_slug = await _unique_slug(user_id, _generate_slug(name), exclude_page_id=page_id)

    sets = ["name = $3", "icon = $4", "slug = $5", "updated_at = NOW()"]
    params: list[Any] = [user_id, page_id, new_name, new_icon, new_slug]

    if layout is not None:
        sets.append(f"layout = ${len(params) + 1}::jsonb")
        params.append(json.dumps(layout))

    query = f"""UPDATE user_pages SET {', '.join(sets)}
                WHERE user_id = $1 AND page_id = $2
                RETURNING page_id, name, slug, icon, layout, sort_order"""

    row = await pool.fetchrow(query, *params)
    if row is None:
        return None
    return _row_to_dict(row)


async def delete_page(user_id: str, slug: str) -> bool:
    """Delete a page by slug. Returns True if deleted."""
    pool = await pg_service.get_pool()
    result = await pool.execute(
        "DELETE FROM user_pages WHERE user_id = $1 AND slug = $2",
        user_id, slug,
    )
    return result == "DELETE 1"


async def reorder_pages(user_id: str, page_ids: list[str]) -> None:
    """Batch update sort_order based on the order of page_ids."""
    pool = await pg_service.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for idx, page_id in enumerate(page_ids):
                await conn.execute(
                    "UPDATE user_pages SET sort_order = $1, updated_at = NOW() WHERE user_id = $2 AND page_id = $3",
                    idx, user_id, page_id,
                )


async def get_page_count(user_id: str) -> int:
    """Count pages for a user (used for seeding check)."""
    pool = await pg_service.get_pool()
    count = await pool.fetchval(
        "SELECT COUNT(*) FROM user_pages WHERE user_id = $1",
        user_id,
    )
    return count or 0


async def seed_default_pages(user_id: str, org_id: str) -> list[dict[str, Any]]:
    """Create the default template pages if user has zero pages."""
    count = await get_page_count(user_id)
    if count > 0:
        return []

    pages = []
    for template in TEMPLATE_LIST:
        page = await create_page(
            user_id=user_id,
            org_id=org_id,
            name=template.name,
            icon=template.icon,
            layout=template.layout,
        )
        pages.append(page)
    return pages
