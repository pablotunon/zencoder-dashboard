from fastapi import APIRouter, Depends

from app.auth.dependencies import get_org_context
from app.config import settings
from app.models.auth import OrgContext
from app.models.requests import MetricFilters, get_metric_filters
from app.models.responses import (
    KpiCard,
    KpiCards,
    OverviewResponse,
    TeamBreakdown,
    TimeSeriesPoint,
)
from app.services import clickhouse as ch_service
from app.services import postgres as pg_service
from app.services import redis_cache

router = APIRouter()


@router.get("/api/metrics/overview", response_model=OverviewResponse)
async def get_overview(
    filters: MetricFilters = Depends(get_metric_filters),
    ctx: OrgContext = Depends(get_org_context),
):
    cache_key = redis_cache.make_cache_key(ctx.org_id, "overview", filters.model_dump(exclude_none=True))
    cached = redis_cache.get_cached(cache_key)
    if cached:
        return cached

    kpis = ch_service.query_overview_kpis(ctx.org_id, filters)
    usage_trend_data = ch_service.query_usage_trend(ctx.org_id, filters)
    team_data = ch_service.query_team_breakdown(ctx.org_id, filters)
    active_runs = redis_cache.get_active_runs(ctx.org_id)

    # Enrich team breakdown with names from PostgreSQL
    team_names = await pg_service.get_team_names(ctx.org_id)

    response = OverviewResponse(
        kpi_cards=KpiCards(
            total_runs=KpiCard(value=kpis["total_runs"], change_pct=kpis["total_runs_change"], period=filters.period),
            active_users=KpiCard(value=kpis["active_users"], change_pct=kpis["active_users_change"], period=filters.period),
            total_cost=KpiCard(value=kpis["total_cost"], change_pct=kpis["total_cost_change"], period=filters.period),
            success_rate=KpiCard(value=kpis["success_rate"], change_pct=kpis["success_rate_change"], period=filters.period),
        ),
        usage_trend=[TimeSeriesPoint(**pt) for pt in usage_trend_data],
        team_breakdown=[
            TeamBreakdown(
                team_id=t["team_id"],
                team_name=team_names.get(t["team_id"], t["team_id"]),
                runs=t["runs"],
                active_users=t["active_users"],
                cost=t["cost"],
                success_rate=t["success_rate"],
            )
            for t in team_data
        ],
        active_runs_count=active_runs,
    )

    redis_cache.set_cached(cache_key, response.model_dump(), settings.cache_ttl_overview)
    return response
