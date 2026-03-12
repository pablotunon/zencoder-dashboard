import os


class Config:
    # Redis
    REDIS_HOST: str = os.environ.get("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.environ.get("REDIS_PORT", "6379"))

    # ClickHouse
    CLICKHOUSE_HOST: str = os.environ.get("CLICKHOUSE_HOST", "localhost")
    CLICKHOUSE_PORT: int = int(os.environ.get("CLICKHOUSE_PORT", "8123"))
    CLICKHOUSE_DB: str = os.environ.get("CLICKHOUSE_DB", "default")
    CLICKHOUSE_USER: str = os.environ.get("CLICKHOUSE_USER", "default")
    CLICKHOUSE_PASSWORD: str = os.environ.get("CLICKHOUSE_PASSWORD", "")

    # Consumer
    STREAM_KEY: str = "agent_events"
    CONSUMER_GROUP: str = "aggregation_workers"
    CONSUMER_NAME: str = os.environ.get("CONSUMER_NAME", "worker-1")
    BATCH_SIZE: int = int(os.environ.get("BATCH_SIZE", "100"))
    BLOCK_MS: int = 5000  # Block for 5 seconds on XREADGROUP
