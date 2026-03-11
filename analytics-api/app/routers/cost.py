import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

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
from app.services import clickhouse as ch_service
from app.services import postgres as pg_service
from app.services import redis_cache

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/metrics/cost", response_model=CostResponse)
async def get_cost(
    filters: MetricFilters = Depends(get_metric_filters),
    ctx: OrgContext = Depends(get_org_context),
):
    cache_key = redis_cache.make_cache_key(ctx.org_id, "cost", filters.model_dump(exclude_none=True))
    cached = redis_cache.get_cached(cache_key)
    if cached:
        return cached

    try:
        cost_trend_data = ch_service.query_cost_trend(ctx.org_id, filters)
        cost_breakdown_data = ch_service.query_cost_breakdown(ctx.org_id, filters)
        cost_per_run_data = ch_service.query_cost_per_run_trend(ctx.org_id, filters)
        token_data = ch_service.query_token_breakdown(ctx.org_id, filters)
        current_spend = ch_service.query_current_month_spend(ctx.org_id)
    except Exception:
        logger.exception("ClickHouse query failed for cost metrics")
        raise HTTPException(status_code=503, detail="Analytics data temporarily unavailable")

    try:
        org = await pg_service.get_org(ctx.org_id)
    except Exception:
        logger.exception("PostgreSQL query failed for org budget info")
        org = None

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

    redis_cache.set_cached(cache_key, response.model_dump(), settings.cache_ttl_metrics)
    return response
