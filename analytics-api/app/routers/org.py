import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_org_context
from app.models.auth import OrgContext
from app.models.responses import OrgResponse, ProjectInfo, TeamInfo
from app.services import postgres as pg_service
from app.services import redis_cache
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/orgs/current", response_model=OrgResponse)
async def get_current_org(ctx: OrgContext = Depends(get_org_context)):
    cache_key = redis_cache.make_cache_key(ctx.org_id, "org")
    cached = redis_cache.get_cached(cache_key)
    if cached:
        return cached

    try:
        org = await pg_service.get_org(ctx.org_id)
    except Exception:
        logger.exception("PostgreSQL query failed for org data")
        raise HTTPException(status_code=503, detail="Organization data temporarily unavailable")

    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    try:
        teams = await pg_service.get_teams(ctx.org_id)
        projects = await pg_service.get_projects(ctx.org_id)
    except Exception:
        logger.exception("PostgreSQL query failed for teams/projects")
        teams = []
        projects = []

    response = OrgResponse(
        org_id=org["org_id"],
        name=org["name"],
        plan=org["plan"],
        monthly_budget=float(org["monthly_budget"]) if org["monthly_budget"] else None,
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

    redis_cache.set_cached(cache_key, response.model_dump(), settings.cache_ttl_org)
    return response
