"""Shared helpers to reduce boilerplate in metric router endpoints."""

import logging
from typing import Any, Callable, TypeVar

from fastapi import HTTPException

from app.services import redis_cache

logger = logging.getLogger(__name__)

T = TypeVar("T")


def get_cached_or_none(org_id: str, endpoint: str, filters_dict: dict[str, Any] | None = None) -> Any | None:
    """Check the Redis cache and return the cached value, or None on miss."""
    cache_key = redis_cache.make_cache_key(org_id, endpoint, filters_dict)
    return redis_cache.get_cached(cache_key)


def set_cache(org_id: str, endpoint: str, data: dict[str, Any], ttl: int, filters_dict: dict[str, Any] | None = None) -> None:
    """Store a response in the Redis cache."""
    cache_key = redis_cache.make_cache_key(org_id, endpoint, filters_dict)
    redis_cache.set_cached(cache_key, data, ttl)


def query_clickhouse(fn: Callable[[], T], context: str) -> T:
    """Call *fn* and translate ClickHouse failures into HTTP 503."""
    try:
        return fn()
    except Exception:
        logger.exception("ClickHouse query failed for %s", context)
        raise HTTPException(status_code=503, detail="Analytics data temporarily unavailable")


async def safe_pg_query(fn: Callable, default: T, context: str) -> T:
    """Await *fn* and return *default* on failure (non-critical enrichment)."""
    try:
        return await fn()
    except Exception:
        logger.exception("PostgreSQL query failed for %s", context)
        return default
