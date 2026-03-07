import hashlib
import json
import logging
from typing import Any

import redis

from app.config import settings

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            decode_responses=True,
        )
    return _client


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def make_cache_key(org_id: str, endpoint: str, filters: dict[str, Any] | None = None) -> str:
    """Generate deterministic cache key: metrics:{org_id}:{endpoint}:{hash(filters)}."""
    if filters:
        # Sort keys for deterministic hashing
        filter_str = json.dumps(filters, sort_keys=True, default=str)
        filter_hash = hashlib.md5(filter_str.encode()).hexdigest()[:12]
    else:
        filter_hash = "none"
    return f"metrics:{org_id}:{endpoint}:{filter_hash}"


def get_cached(key: str) -> Any | None:
    try:
        client = get_client()
        data = client.get(key)
        if data:
            return json.loads(data)
    except Exception:
        logger.warning("Redis cache get failed for key %s", key)
    return None


def set_cached(key: str, value: Any, ttl: int) -> None:
    try:
        client = get_client()
        client.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        logger.warning("Redis cache set failed for key %s", key)


def get_active_runs(org_id: str) -> int:
    try:
        client = get_client()
        val = client.get(f"rt:{org_id}:active_runs")
        return int(val) if val else 0
    except Exception:
        logger.warning("Failed to get active runs count")
        return 0


def check_connection() -> bool:
    try:
        client = get_client()
        return client.ping()
    except Exception:
        logger.exception("Redis health check failed")
        return False
