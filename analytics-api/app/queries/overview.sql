-- Overview KPI query
-- Returns total_runs, active_users, total_cost, success_rate for a given org and period
SELECT
    count() AS total_runs,
    uniq(user_id) AS active_users,
    sum(cost_usd) AS total_cost,
    countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s;

-- Usage trend query
-- Returns daily runs and cost for the period
SELECT
    toDate(started_at) AS date,
    count() AS runs,
    sum(cost_usd) AS cost
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
GROUP BY date
ORDER BY date;

-- Team breakdown query
SELECT
    team_id,
    count() AS runs,
    uniq(user_id) AS active_users,
    sum(cost_usd) AS cost,
    countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
GROUP BY team_id
ORDER BY runs DESC;
