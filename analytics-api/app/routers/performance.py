from fastapi import APIRouter, Depends

from app.auth.dependencies import get_org_context
from app.config import settings
from app.models.auth import OrgContext
from app.models.requests import MetricFilters, get_metric_filters
from app.models.responses import (
    Availability,
    ErrorBreakdownItem,
    LatencyTrendPoint,
    PerformanceResponse,
    QueueWaitTrendPoint,
    SuccessRateTrendPoint,
)
from app.routers._helpers import get_cached_or_none, query_clickhouse, set_cache
from app.services import clickhouse as ch_service

router = APIRouter()


@router.get("/api/metrics/performance", response_model=PerformanceResponse)
async def get_performance(
    filters: MetricFilters = Depends(get_metric_filters),
    ctx: OrgContext = Depends(get_org_context),
):
    filters_dict = filters.model_dump(exclude_none=True)
    cached = get_cached_or_none(ctx.org_id, "performance", filters_dict)
    if cached:
        return cached

    success_data, latency_data, error_data, availability_data, queue_wait_data = query_clickhouse(
        lambda: (
            ch_service.query_success_rate_trend(ctx.org_id, filters),
            ch_service.query_latency_trend(ctx.org_id, filters),
            ch_service.query_error_breakdown(ctx.org_id, filters),
            ch_service.query_availability(ctx.org_id, filters),
            ch_service.query_queue_wait_trend(ctx.org_id, filters),
        ),
        context="performance metrics",
    )

    response = PerformanceResponse(
        success_rate_trend=[SuccessRateTrendPoint(**pt) for pt in success_data["data"]],
        success_rate_trend_granularity=success_data["granularity"],
        latency_trend=[LatencyTrendPoint(**pt) for pt in latency_data["data"]],
        latency_trend_granularity=latency_data["granularity"],
        error_breakdown=[ErrorBreakdownItem(**eb) for eb in error_data],
        availability=Availability(**availability_data),
        queue_wait_trend=[QueueWaitTrendPoint(**qw) for qw in queue_wait_data["data"]],
        queue_wait_trend_granularity=queue_wait_data["granularity"],
    )

    set_cache(ctx.org_id, "performance", response.model_dump(), settings.cache_ttl_metrics, filters_dict)
    return response
