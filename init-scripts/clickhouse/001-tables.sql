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
    queue_wait_ms UInt64
) ENGINE = MergeTree()
ORDER BY (org_id, started_at, team_id)
PARTITION BY toYYYYMM(started_at);

CREATE TABLE IF NOT EXISTS daily_team_metrics (
    date Date,
    org_id String,
    team_id String,
    total_runs UInt64,
    successful_runs UInt64,
    failed_runs UInt64,
    active_users UInt64,
    total_cost Float64,
    total_tokens_input UInt64,
    total_tokens_output UInt64,
    avg_duration_ms Float64,
    p50_duration_ms Float64,
    p95_duration_ms Float64,
    p99_duration_ms Float64,
    avg_queue_wait_ms Float64
) ENGINE = ReplacingMergeTree()
ORDER BY (org_id, date, team_id);

CREATE TABLE IF NOT EXISTS daily_agent_type_metrics (
    date Date,
    org_id String,
    agent_type LowCardinality(String),
    total_runs UInt64,
    successful_runs UInt64,
    total_cost Float64
) ENGINE = ReplacingMergeTree()
ORDER BY (org_id, date, agent_type);

CREATE TABLE IF NOT EXISTS daily_project_metrics (
    date Date,
    org_id String,
    project_id String,
    total_runs UInt64,
    active_users UInt64,
    total_cost Float64
) ENGINE = ReplacingMergeTree()
ORDER BY (org_id, date, project_id);
