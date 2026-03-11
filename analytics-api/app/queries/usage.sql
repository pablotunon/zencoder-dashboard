-- Active users trend (bucketed)
-- {bucket_fn} is resolved dynamically (toStartOfMinute, toStartOfHour, toDate, toStartOfWeek)
SELECT
    {bucket_fn}(started_at) AS timestamp,
    uniq(user_id) AS dau
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY timestamp
ORDER BY timestamp;

-- Agent type breakdown
SELECT
    agent_type,
    count() AS runs
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY agent_type
ORDER BY runs DESC;

-- Top users
SELECT
    user_id,
    count() AS runs,
    max(started_at) AS last_active
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY user_id
ORDER BY runs DESC
LIMIT %(limit)s;

-- Project breakdown
SELECT
    project_id,
    count() AS runs,
    uniq(user_id) AS active_users,
    sum(cost_usd) AS cost
FROM agent_runs
WHERE org_id = %(org_id)s
  AND started_at >= %(start)s
  AND started_at < %(end)s
GROUP BY project_id
ORDER BY runs DESC;
