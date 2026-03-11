import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_org_context
from app.config import settings
from app.models.auth import OrgContext
from app.models.responses import OrgResponse, ProjectInfo, TeamInfo
from app.routers._helpers import get_cached_or_none, safe_pg_query, set_cache
from app.services import postgres as pg_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/orgs/current", response_model=OrgResponse)
async def get_current_org(ctx: OrgContext = Depends(get_org_context)):
    cached = get_cached_or_none(ctx.org_id, "org")
    if cached:
        return cached

    try:
        org = await pg_service.get_org(ctx.org_id)
    except Exception:
        logger.exception("PostgreSQL query failed for org data")
        raise HTTPException(status_code=503, detail="Organization data temporarily unavailable")

    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    teams, projects, licensed_users = (
        await safe_pg_query(lambda: pg_service.get_teams(ctx.org_id), default=[], context="teams"),
        await safe_pg_query(lambda: pg_service.get_projects(ctx.org_id), default=[], context="projects"),
        await safe_pg_query(lambda: pg_service.get_total_licensed_users(ctx.org_id), default=0, context="licensed users"),
    )

    response = OrgResponse(
        org_id=org["org_id"],
        name=org["name"],
        plan=org["plan"],
        monthly_budget=float(org["monthly_budget"]) if org["monthly_budget"] else None,
        licensed_users=licensed_users,
        teams=[TeamInfo(team_id=t["team_id"], name=t["name"], slug=t["slug"]) for t in teams],
        projects=[
            ProjectInfo(
                project_id=p["project_id"],
                name=p["name"],
                repository_url=p.get("repository_url"),
                team_id=p["team_id"],
            )
            for p in projects
        ],
    )

    set_cache(ctx.org_id, "org", response.model_dump(), settings.cache_ttl_org)
    return response
