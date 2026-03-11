-- AgentHub Analytics — ClickHouse Tables

CREATE TABLE IF NOT EXISTS agent_runs (
    run_id UUID,
    org_id String,
    team_id String,
    user_id String,
    project_id String,
    agent_type LowCardinality(String),
    status LowCardinality(String),
    started_at DateTime64(3),
    completed_at Nullable(DateTime64(3)),
    duration_ms UInt64,
    tokens_input UInt64,
    tokens_output UInt64,
    model LowCardinality(String),
    cost_usd Float64,
    error_category LowCardinality(Nullable(String)),
    queue_wait_ms UInt64,
    user_rating LowCardinality(Nullable(String))
) ENGINE = MergeTree()
ORDER BY (org_id, started_at, team_id)
PARTITION BY toYYYYMM(started_at);
