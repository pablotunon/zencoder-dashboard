-- Cost trend (bucketed)
-- {bucket_fn} is resolved dynamically (toStartOfMinute, toStartOfHour, toDate, toStartOfWeek)
SELECT
    {bucket_fn}(started_at) AS timestamp,
    sum(cost_usd) AS cost
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY timestamp
ORDER BY timestamp;

-- Cost breakdown by dimension (team_id | project_id | agent_type)
SELECT
    {group_col} AS dimension_value,
    sum(cost_usd) AS cost,
    count() AS runs,
    sum(cost_usd) / greatest(count(), 1) AS cost_per_run
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY dimension_value
ORDER BY cost DESC;

-- Cost per run trend (bucketed)
SELECT
    {bucket_fn}(started_at) AS timestamp,
    sum(cost_usd) / greatest(count(), 1) AS avg_cost_per_run
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY timestamp
ORDER BY timestamp;

-- Token breakdown (totals)
SELECT
    sum(tokens_input) AS input_tokens,
    sum(tokens_output) AS output_tokens
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s;

-- Token breakdown by model
SELECT
    model,
    sum(tokens_input) AS input_tokens,
    sum(tokens_output) AS output_tokens
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY model
ORDER BY input_tokens + output_tokens DESC;

-- Current month spend (for budget tracking)
SELECT sum(cost_usd) AS spend
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(month_start)s
  AND toDate(started_at) <= %(today)s;
