"""Update real-time counters in Redis.

Note: The ingestion service already handles INCR/DECR of active_runs
and today_runs counters on event receipt. The worker's role here is
primarily to ensure counters stay consistent — for example, reconciling
after restarts or correcting drift.

For Phase A, the worker does not duplicate the counter updates that the
ingestion service already performs. This module is available for future
use (e.g., Phase D WebSocket notifications via Pub/Sub).
"""

import logging

import redis as redis_lib

logger = logging.getLogger(__name__)


def invalidate_metrics_cache(
    r: redis_lib.Redis, org_id: str
) -> None:
    """Invalidate cached API responses for an org after new data arrives.

    Deletes all metrics cache keys for the org so the analytics API
    serves fresh data on next request.
    """
    pattern = f"metrics:{org_id}:*"
    cursor = 0
    deleted = 0
    while True:
        cursor, keys = r.scan(cursor=cursor, match=pattern, count=100)
        if keys:
            r.delete(*keys)
            deleted += len(keys)
        if cursor == 0:
            break

    if deleted:
        logger.debug(
            "Invalidated %d cache keys for org '%s'", deleted, org_id
        )
