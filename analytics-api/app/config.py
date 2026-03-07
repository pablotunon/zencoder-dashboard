from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ClickHouse
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_db: str = "default"

    # PostgreSQL
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "agenthub"
    postgres_user: str = "agenthub"
    postgres_password: str = "agenthub_dev"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379

    # Cache TTLs (seconds)
    cache_ttl_overview: int = 30
    cache_ttl_metrics: int = 300  # 5 minutes
    cache_ttl_org: int = 600  # 10 minutes

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
