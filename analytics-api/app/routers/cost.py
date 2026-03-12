from datetime import date

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_org_context
from app.config import settings
from app.models.auth import OrgContext
from app.models.requests import MetricFilters, get_metric_filters
from app.models.responses import (
    Budget,
    CostBreakdownItem,
    CostPerRunTrendPoint,
    CostResponse,
    CostTrendPoint,
    TokenBreakdown,
    TokenBreakdownByModel,
)
from app.routers._helpers import get_cached_or_none, query_clickhouse, safe_pg_query, set_cache
from app.services import clickhouse as ch_service
from app.services import postgres as pg_service

router = APIRouter()


@router.get("/api/metrics/cost", response_model=CostResponse)
async def get_cost(
    filters: MetricFilters = Depends(get_metric_filters),
    ctx: OrgContext = Depends(get_org_context),
):
    filters_dict = filters.model_dump(exclude_none=True)
    cached = get_cached_or_none(ctx.org_id, "cost", filters_dict)
    if cached:
        return cached

    cost_trend_data, cost_breakdown_data, cost_per_run_data, token_data, current_spend = query_clickhouse(
        lambda: (
            ch_service.query_cost_trend(ctx.org_id, filters),
            ch_service.query_cost_breakdown(ctx.org_id, filters),
            ch_service.query_cost_per_run_trend(ctx.org_id, filters),
            ch_service.query_token_breakdown(ctx.org_id, filters),
            ch_service.query_current_month_spend(ctx.org_id),
        ),
        context="cost metrics",
    )

    org = await safe_pg_query(
        lambda: pg_service.get_org(ctx.org_id),
        default=None,
        context="org budget info",
    )

    monthly_budget = float(org["monthly_budget"]) if org and org.get("monthly_budget") else None

    today = date.today()
    days_in_month = 30
    days_elapsed = today.day
    daily_rate = current_spend / days_elapsed if days_elapsed > 0 else 0
    projected_spend = round(daily_rate * days_in_month, 2)
    utilization_pct = round(current_spend / monthly_budget * 100, 1) if monthly_budget else None

    response = CostResponse(
        cost_trend=[CostTrendPoint(**pt) for pt in cost_trend_data["data"]],
        cost_trend_granularity=cost_trend_data["granularity"],
        cost_breakdown=[CostBreakdownItem(**cb) for cb in cost_breakdown_data],
        cost_per_run_trend=[CostPerRunTrendPoint(**cpr) for cpr in cost_per_run_data["data"]],
        cost_per_run_trend_granularity=cost_per_run_data["granularity"],
        token_breakdown=TokenBreakdown(
            input_tokens=token_data["input_tokens"],
            output_tokens=token_data["output_tokens"],
            by_model=[TokenBreakdownByModel(**m) for m in token_data["by_model"]],
        ),
        budget=Budget(
            monthly_budget=monthly_budget,
            current_spend=round(current_spend, 2),
            projected_spend=projected_spend,
            utilization_pct=utilization_pct,
        ),
    )

    set_cache(ctx.org_id, "cost", response.model_dump(), settings.cache_ttl_metrics, filters_dict)
    return response
