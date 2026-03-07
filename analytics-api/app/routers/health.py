from fastapi import APIRouter

from app.services import clickhouse as ch_service
from app.services import postgres as pg_service
from app.services import redis_cache

router = APIRouter()


@router.get("/api/health")
async def health():
    ch_ok = False
    try:
        client = ch_service.get_client()
        client.query("SELECT 1")
        ch_ok = True
    except Exception:
        pass

    pg_ok = await pg_service.check_connection()
    redis_ok = redis_cache.check_connection()

    status = "ok" if (ch_ok and pg_ok and redis_ok) else "degraded"

    return {
        "status": status,
        "dependencies": {
            "clickhouse": "connected" if ch_ok else "disconnected",
            "postgres": "connected" if pg_ok else "disconnected",
            "redis": "connected" if redis_ok else "disconnected",
        },
    }
