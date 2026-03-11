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
from app.routers._helpers import get_cached_or_none, query_clickhouse, safe_pg_query, set_cache
from app.services import clickhouse as ch_service
from app.services import postgres as pg_service

router = APIRouter()


@router.get("/api/metrics/overview", response_model=OverviewResponse)
async def get_overview(
    filters: MetricFilters = Depends(get_metric_filters),
    ctx: OrgContext = Depends(get_org_context),
):
    filters_dict = filters.model_dump(exclude_none=True)
    cached = get_cached_or_none(ctx.org_id, "overview", filters_dict)
    if cached:
        return cached

    kpis, usage_trend_data, team_data = query_clickhouse(
        lambda: (
            ch_service.query_overview_kpis(ctx.org_id, filters),
            ch_service.query_usage_trend(ctx.org_id, filters),
            ch_service.query_team_breakdown(ctx.org_id, filters),
        ),
        context="overview metrics",
    )

    team_names = await safe_pg_query(
        lambda: pg_service.get_team_names(ctx.org_id),
        default={},
        context="team names",
    )

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

    set_cache(ctx.org_id, "overview", response.model_dump(), settings.cache_ttl_overview, filters_dict)
    return response
