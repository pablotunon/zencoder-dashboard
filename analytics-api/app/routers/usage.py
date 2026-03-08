import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_org_context
from app.config import settings
from app.models.auth import OrgContext
from app.models.requests import MetricFilters, get_metric_filters
from app.models.responses import (
    ActiveUsersTrendPoint,
    AdoptionRate,
    AgentTypeBreakdown,
    ProjectBreakdown,
    TopUser,
    UsageResponse,
)
from app.services import clickhouse as ch_service
from app.services import postgres as pg_service
from app.services import redis_cache

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/metrics/usage", response_model=UsageResponse)
async def get_usage(
    filters: MetricFilters = Depends(get_metric_filters),
    ctx: OrgContext = Depends(get_org_context),
):
    cache_key = redis_cache.make_cache_key(ctx.org_id, "usage", filters.model_dump(exclude_none=True))
    cached = redis_cache.get_cached(cache_key)
    if cached:
        return cached

    try:
        active_users_trend_data = ch_service.query_active_users_trend(ctx.org_id, filters)
        agent_type_data = ch_service.query_agent_type_breakdown(ctx.org_id, filters)
        top_users_data = ch_service.query_top_users(ctx.org_id, filters)
        project_data = ch_service.query_project_breakdown(ctx.org_id, filters)
        kpis = ch_service.query_overview_kpis(ctx.org_id, filters)
    except Exception:
        logger.exception("ClickHouse query failed for usage metrics")
        raise HTTPException(status_code=503, detail="Analytics data temporarily unavailable")

    try:
        licensed_users = await pg_service.get_total_licensed_users(ctx.org_id)
        user_info = await pg_service.get_users(ctx.org_id)
        project_names = await pg_service.get_project_names(ctx.org_id)
    except Exception:
        logger.exception("PostgreSQL query failed for usage enrichment")
        licensed_users = 0
        user_info = []
        project_names = {}

    user_map = {u["user_id"]: u for u in user_info}

    active_users_count = kpis["active_users"]
    adoption = active_users_count / licensed_users * 100 if licensed_users > 0 else 0

    response = UsageResponse(
        adoption_rate=AdoptionRate(
            value=round(adoption, 1),
            licensed_users=licensed_users,
            active_users=active_users_count,
        ),
        active_users_trend=[ActiveUsersTrendPoint(**pt) for pt in active_users_trend_data],
        agent_type_breakdown=[AgentTypeBreakdown(**at) for at in agent_type_data],
        top_users=[
            TopUser(
                user_id=u["user_id"],
                name=user_map.get(u["user_id"], {}).get("name", u["user_id"]),
                avatar_url=user_map.get(u["user_id"], {}).get("avatar_url"),
                team_name=user_map.get(u["user_id"], {}).get("team_name", "Unknown"),
                runs=u["runs"],
                last_active=u.get("last_active"),
            )
            for u in top_users_data
        ],
        project_breakdown=[
            ProjectBreakdown(
                project_id=p["project_id"],
                project_name=project_names.get(p["project_id"], p["project_id"]),
                runs=p["runs"],
                active_users=p["active_users"],
                cost=p["cost"],
            )
            for p in project_data
        ],
    )

    redis_cache.set_cached(cache_key, response.model_dump(), settings.cache_ttl_metrics)
    return response
