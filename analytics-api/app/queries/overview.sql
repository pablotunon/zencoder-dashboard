-- Overview KPI query
-- Returns total_runs, active_users, total_cost, success_rate for a given org and date range
SELECT
    count() AS total_runs,
    uniq(user_id) AS active_users,
    sum(cost_usd) AS total_cost,
    countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s;

-- Usage trend query
-- Returns bucketed runs and cost for the date range
-- {bucket_fn} is resolved dynamically (toStartOfMinute, toStartOfHour, toDate, toStartOfWeek)
SELECT
    {bucket_fn}(started_at) AS timestamp,
    count() AS runs,
    sum(cost_usd) AS cost
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY timestamp
ORDER BY timestamp;

-- Team breakdown query
SELECT
    team_id,
    count() AS runs,
    uniq(user_id) AS active_users,
    sum(cost_usd) AS cost,
    countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY team_id
ORDER BY runs DESC;
