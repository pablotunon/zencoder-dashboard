import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.services import clickhouse as ch_service
from app.services import postgres as pg_service
from app.services import redis_cache

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/health")
async def health():
    ch_ok = False
    try:
        client = ch_service.get_client()
        client.query("SELECT 1")
        ch_ok = True
    except Exception:
        logger.warning("ClickHouse health check failed")

    pg_ok = await pg_service.check_connection()
    redis_ok = redis_cache.check_connection()

    all_ok = ch_ok and pg_ok and redis_ok
    status = "ok" if all_ok else "degraded"

    body = {
        "status": status,
        "dependencies": {
            "clickhouse": "connected" if ch_ok else "disconnected",
            "postgres": "connected" if pg_ok else "disconnected",
            "redis": "connected" if redis_ok else "disconnected",
        },
    }

    return body
