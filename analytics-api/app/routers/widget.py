import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_org_context
from app.config import settings
from app.models.auth import OrgContext
from app.models.requests import WidgetQueryRequest
from app.services import postgres as pg_service
from app.services import redis_cache
from app.services.widget_query import (
    DIMENSION_REGISTRY,
    METRIC_REGISTRY,
    build_widget_query,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/metrics/widget")
async def query_widget(
    body: WidgetQueryRequest,
    ctx: OrgContext = Depends(get_org_context),
):
    if body.metric not in METRIC_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unknown metric: {body.metric}")
    if body.breakdown and body.breakdown not in DIMENSION_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unknown breakdown dimension: {body.breakdown}")

    cache_filters = body.model_dump(exclude_none=True)
    cache_key = redis_cache.make_cache_key(ctx.org_id, "widget", cache_filters)
    cached = redis_cache.get_cached(cache_key)
    if cached:
        return cached

    filters_dict = body.filters.model_dump(exclude_none=True) if body.filters else None

    try:
        result = build_widget_query(
            org_id=ctx.org_id,
            metric=body.metric,
            start=body.start,
            end=body.end,
            breakdown=body.breakdown,
            filters=filters_dict,
        )
    except Exception:
        logger.exception("Widget query failed for metric=%s breakdown=%s", body.metric, body.breakdown)
        raise HTTPException(status_code=503, detail="Analytics data temporarily unavailable")

    if result.get("type") == "breakdown" and body.breakdown in ("team", "project"):
        try:
            name_fetcher = pg_service.get_team_names if body.breakdown == "team" else pg_service.get_project_names
            names = await name_fetcher(ctx.org_id)
            for item in result["data"]:
                item["label"] = names.get(item["label"], item["label"])
        except Exception:
            logger.exception("PostgreSQL lookup failed for %s names", body.breakdown)

    redis_cache.set_cached(cache_key, result, settings.cache_ttl_metrics)
    return result
