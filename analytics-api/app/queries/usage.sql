-- Active users trend (DAU)
SELECT
    toDate(started_at) AS date,
    uniq(user_id) AS dau
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
GROUP BY date
ORDER BY date;

-- Agent type breakdown
SELECT
    agent_type,
    count() AS runs
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
GROUP BY agent_type
ORDER BY runs DESC;

-- Top users
SELECT
    user_id,
    count() AS runs,
    max(started_at) AS last_active
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
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
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
GROUP BY project_id
ORDER BY runs DESC;
