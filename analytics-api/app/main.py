import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.routers import auth, cost, health, org, overview, performance, usage
from app.services import clickhouse as ch_service
from app.services import postgres as pg_service
from app.services import redis_cache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Analytics API — connecting to stores")
    try:
        ch_service.get_client()
        logger.info("ClickHouse connected")
    except Exception:
        logger.warning("ClickHouse not available at startup — will retry on first request")

    try:
        await pg_service.get_pool()
        logger.info("PostgreSQL connected")
    except Exception:
        logger.warning("PostgreSQL not available at startup — will retry on first request")

    try:
        redis_cache.get_client().ping()
        logger.info("Redis connected")
    except Exception:
        logger.warning("Redis not available at startup — will retry on first request")

    yield

    logger.info("Shutting down Analytics API")
    ch_service.close_client()
    await pg_service.close_pool()
    redis_cache.close_client()


app = FastAPI(
    title="AgentHub Analytics API",
    description="Backend-for-Frontend API serving pre-aggregated analytics from ClickHouse, PostgreSQL, and Redis.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(org.router)
app.include_router(overview.router)
app.include_router(usage.router)
app.include_router(cost.router)
app.include_router(performance.router)
