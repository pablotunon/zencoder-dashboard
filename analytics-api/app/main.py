import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routers import cost, health, org, overview, performance, usage
from app.services import clickhouse as ch_service
from app.services import postgres as pg_service
from app.services import redis_cache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Analytics API — connecting to stores")
    # Initialize connections
    try:
        ch_service.get_client()
        logger.info("ClickHouse connected")
    except Exception:
        logger.warning("ClickHouse not available at startup")

    try:
        await pg_service.get_pool()
        logger.info("PostgreSQL connected")
    except Exception:
        logger.warning("PostgreSQL not available at startup")

    try:
        redis_cache.get_client().ping()
        logger.info("Redis connected")
    except Exception:
        logger.warning("Redis not available at startup")

    yield

    # Cleanup
    logger.info("Shutting down Analytics API")
    ch_service.close_client()
    await pg_service.close_pool()
    redis_cache.close_client()


app = FastAPI(title="AgentHub Analytics API", lifespan=lifespan)

app.include_router(health.router)
app.include_router(org.router)
app.include_router(overview.router)
app.include_router(usage.router)
app.include_router(cost.router)
app.include_router(performance.router)
