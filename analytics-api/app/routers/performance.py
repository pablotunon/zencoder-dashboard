import logging

from fastapi import APIRouter, Depends, HTTPException

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
from app.services import clickhouse as ch_service
from app.services import redis_cache

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/metrics/performance", response_model=PerformanceResponse)
async def get_performance(
    filters: MetricFilters = Depends(get_metric_filters),
    ctx: OrgContext = Depends(get_org_context),
):
    cache_key = redis_cache.make_cache_key(ctx.org_id, "performance", filters.model_dump(exclude_none=True))
    cached = redis_cache.get_cached(cache_key)
    if cached:
        return cached

    try:
        success_data = ch_service.query_success_rate_trend(ctx.org_id, filters)
        latency_data = ch_service.query_latency_trend(ctx.org_id, filters)
        error_data = ch_service.query_error_breakdown(ctx.org_id, filters)
        availability_data = ch_service.query_availability(ctx.org_id, filters)
        queue_wait_data = ch_service.query_queue_wait_trend(ctx.org_id, filters)
    except Exception:
        logger.exception("ClickHouse query failed for performance metrics")
        raise HTTPException(status_code=503, detail="Analytics data temporarily unavailable")

    response = PerformanceResponse(
        success_rate_trend=[SuccessRateTrendPoint(**pt) for pt in success_data],
        latency_trend=[LatencyTrendPoint(**pt) for pt in latency_data],
        error_breakdown=[ErrorBreakdownItem(**eb) for eb in error_data],
        availability=Availability(**availability_data),
        queue_wait_trend=[QueueWaitTrendPoint(**qw) for qw in queue_wait_data],
    )

    redis_cache.set_cached(cache_key, response.model_dump(), settings.cache_ttl_metrics)
    return response
