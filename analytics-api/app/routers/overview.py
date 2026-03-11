import logging

from fastapi import APIRouter, Depends, HTTPException

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

logger = logging.getLogger(__name__)
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

    try:
        kpis = ch_service.query_overview_kpis(ctx.org_id, filters)
        usage_trend_data = ch_service.query_usage_trend(ctx.org_id, filters)
        team_data = ch_service.query_team_breakdown(ctx.org_id, filters)
    except Exception:
        logger.exception("ClickHouse query failed for overview metrics")
        raise HTTPException(status_code=503, detail="Analytics data temporarily unavailable")

    try:
        team_names = await pg_service.get_team_names(ctx.org_id)
    except Exception:
        logger.exception("PostgreSQL query failed for team names")
        team_names = {}

    response = OverviewResponse(
        kpi_cards=KpiCards(
            total_runs=KpiCard(value=kpis["total_runs"], change_pct=kpis["total_runs_change"]),
            active_users=KpiCard(value=kpis["active_users"], change_pct=kpis["active_users_change"]),
            total_cost=KpiCard(value=kpis["total_cost"], change_pct=kpis["total_cost_change"]),
            success_rate=KpiCard(value=kpis["success_rate"], change_pct=kpis["success_rate_change"]),
        ),
        usage_trend=[TimeSeriesPoint(**pt) for pt in usage_trend_data["data"]],
        usage_trend_granularity=usage_trend_data["granularity"],
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
    )

    redis_cache.set_cached(cache_key, response.model_dump(), settings.cache_ttl_overview)
    return response
