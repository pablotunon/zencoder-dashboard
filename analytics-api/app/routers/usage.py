from fastapi import APIRouter, Depends

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
from app.routers._helpers import get_cached_or_none, query_clickhouse, safe_pg_query, set_cache
from app.services import clickhouse as ch_service
from app.services import postgres as pg_service

router = APIRouter()


@router.get("/api/metrics/usage", response_model=UsageResponse)
async def get_usage(
    filters: MetricFilters = Depends(get_metric_filters),
    ctx: OrgContext = Depends(get_org_context),
):
    filters_dict = filters.model_dump(exclude_none=True)
    cached = get_cached_or_none(ctx.org_id, "usage", filters_dict)
    if cached:
        return cached

    active_users_trend_data, agent_type_data, top_users_data, project_data, kpis = query_clickhouse(
        lambda: (
            ch_service.query_active_users_trend(ctx.org_id, filters),
            ch_service.query_agent_type_breakdown(ctx.org_id, filters),
            ch_service.query_top_users(ctx.org_id, filters),
            ch_service.query_project_breakdown(ctx.org_id, filters),
            ch_service.query_overview_kpis(ctx.org_id, filters),
        ),
        context="usage metrics",
    )

    licensed_users = await safe_pg_query(
        lambda: pg_service.get_total_licensed_users(ctx.org_id),
        default=0,
        context="licensed users",
    )
    user_info = await safe_pg_query(
        lambda: pg_service.get_users(ctx.org_id),
        default=[],
        context="user info",
    )
    project_names = await safe_pg_query(
        lambda: pg_service.get_project_names(ctx.org_id),
        default={},
        context="project names",
    )

    user_map = {u["user_id"]: u for u in user_info}

    active_users_count = kpis["active_users"]
    # Cap active users at licensed count — ClickHouse may include user_ids
    # not present in the PostgreSQL users table (e.g. from test data or
    # eventual-consistency lag).
    if licensed_users > 0:
        active_users_count = min(active_users_count, licensed_users)
    adoption = active_users_count / licensed_users * 100 if licensed_users > 0 else 0

    response = UsageResponse(
        adoption_rate=AdoptionRate(
            value=round(adoption, 1),
            licensed_users=licensed_users,
            active_users=active_users_count,
        ),
        active_users_trend=[ActiveUsersTrendPoint(**pt) for pt in active_users_trend_data["data"]],
        active_users_trend_granularity=active_users_trend_data["granularity"],
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

    set_cache(ctx.org_id, "usage", response.model_dump(), settings.cache_ttl_metrics, filters_dict)
    return response
