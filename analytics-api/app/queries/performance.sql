-- Success/failure rate trend
SELECT
    toDate(started_at) AS date,
    countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS success_rate,
    countIf(status = 'failed') * 100.0 / greatest(count(), 1) AS failure_rate,
    countIf(status = 'failed' AND error_category IS NOT NULL) * 100.0 / greatest(count(), 1) AS error_rate
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
GROUP BY date
ORDER BY date;

-- Latency percentiles trend
SELECT
    toDate(started_at) AS date,
    quantile(0.5)(duration_ms) AS p50,
    quantile(0.95)(duration_ms) AS p95,
    quantile(0.99)(duration_ms) AS p99
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
  AND duration_ms > 0
GROUP BY date
ORDER BY date;

-- Error breakdown
SELECT
    error_category,
    count() AS cnt
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
  AND status = 'failed'
  AND error_category IS NOT NULL
GROUP BY error_category
ORDER BY cnt DESC;

-- Queue wait trend
SELECT
    toDate(started_at) AS date,
    avg(queue_wait_ms) AS avg_wait_ms,
    quantile(0.95)(queue_wait_ms) AS p95_wait_ms
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s
  AND queue_wait_ms > 0
GROUP BY date
ORDER BY date;

-- Availability (success rate as proxy)
SELECT
    countIf(status = 'completed') * 100.0 / greatest(count(), 1) AS uptime_pct
FROM agent_runs
WHERE org_id = %(org_id)s
  AND toDate(started_at) >= %(start)s
  AND toDate(started_at) < %(end)s;
