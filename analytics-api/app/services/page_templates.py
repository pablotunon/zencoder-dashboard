"""
Default page templates seeded for new users.

Each template matches the layout from the original pre-built pages
(Overview, Usage, Cost, Performance) converted to DashboardRow[] JSON.
"""


def _time_range(period: str = "30d") -> dict:
    return {"useGlobal": False, "period": period}


TEMPLATES: list[dict] = [
    {
        "name": "Overview",
        "icon": "chart-bar",
        "layout": [
            {
                "id": "overview-kpis",
                "columns": 4,
                "widgets": [
                    {"id": "overview-kpi-runs", "title": "Total Runs", "chartType": "kpi", "metrics": ["run_count"], "timeRange": _time_range()},
                    {"id": "overview-kpi-users", "title": "Active Users", "chartType": "kpi", "metrics": ["active_users"], "timeRange": _time_range()},
                    {"id": "overview-kpi-cost", "title": "Total Cost", "chartType": "kpi", "metrics": ["cost"], "timeRange": _time_range()},
                    {"id": "overview-kpi-success", "title": "Success Rate", "chartType": "kpi", "metrics": ["success_rate"], "timeRange": _time_range()},
                ],
            },
            {
                "id": "overview-trend",
                "columns": 1,
                "widgets": [
                    {"id": "overview-usage-trend", "title": "Usage Trend", "chartType": "area", "metrics": ["run_count"], "timeRange": _time_range()},
                ],
            },
            {
                "id": "overview-team",
                "columns": 1,
                "widgets": [
                    {"id": "overview-team-breakdown", "title": "Team Breakdown", "chartType": "table", "metrics": ["run_count", "active_users", "cost", "success_rate"], "breakdownDimension": "team", "timeRange": _time_range()},
                ],
            },
        ],
    },
    {
        "name": "Usage & Adoption",
        "icon": "users",
        "layout": [
            {
                "id": "usage-top",
                "columns": 2,
                "widgets": [
                    {"id": "usage-adoption-stat", "title": "Adoption Rate", "chartType": "stat", "metrics": ["active_users"], "orgMetric": "licensed_users", "timeRange": _time_range()},
                    {"id": "usage-agent-type-pie", "title": "Agent Type Distribution", "chartType": "pie", "metrics": ["run_count"], "breakdownDimension": "agent_type", "timeRange": _time_range()},
                ],
            },
            {
                "id": "usage-trend",
                "columns": 1,
                "widgets": [
                    {"id": "usage-active-users-trend", "title": "Active Users Trend", "chartType": "active_users_trend", "metrics": [], "timeRange": _time_range()},
                ],
            },
            {
                "id": "usage-bottom",
                "columns": 2,
                "widgets": [
                    {"id": "usage-top-users", "title": "Top Users", "chartType": "top_users", "metrics": [], "timeRange": _time_range()},
                    {"id": "usage-project-breakdown", "title": "Project Breakdown", "chartType": "table", "metrics": ["run_count", "active_users", "cost"], "breakdownDimension": "project", "timeRange": _time_range()},
                ],
            },
        ],
    },
    {
        "name": "Cost & Efficiency",
        "icon": "currency-dollar",
        "layout": [
            {
                "id": "cost-budget",
                "columns": 1,
                "widgets": [
                    {"id": "cost-budget-gauge", "title": "Budget Utilization", "chartType": "gauge", "metrics": ["cost"], "orgMetric": "monthly_budget", "timeRange": _time_range()},
                ],
            },
            {
                "id": "cost-trends",
                "columns": 2,
                "widgets": [
                    {"id": "cost-trend", "title": "Cost Trend", "chartType": "area", "metrics": ["cost"], "timeRange": _time_range()},
                    {"id": "cost-per-run-trend", "title": "Cost Per Run", "chartType": "line", "metrics": ["cost_per_run"], "timeRange": _time_range()},
                ],
            },
            {
                "id": "cost-breakdowns",
                "columns": 3,
                "widgets": [
                    {"id": "cost-by-team", "title": "Cost by Team", "chartType": "bar", "metrics": ["cost"], "breakdownDimension": "team", "timeRange": _time_range()},
                    {"id": "cost-by-project", "title": "Cost by Project", "chartType": "bar", "metrics": ["cost"], "breakdownDimension": "project", "timeRange": _time_range()},
                    {"id": "cost-by-agent-type", "title": "Cost by Agent Type", "chartType": "bar", "metrics": ["cost"], "breakdownDimension": "agent_type", "timeRange": _time_range()},
                ],
            },
            {
                "id": "cost-tokens",
                "columns": 1,
                "widgets": [
                    {"id": "cost-token-table", "title": "Token Usage by Model", "chartType": "table", "metrics": ["tokens_input", "tokens_output"], "breakdownDimension": "model", "timeRange": _time_range()},
                ],
            },
        ],
    },
    {
        "name": "Performance & Reliability",
        "icon": "bolt",
        "layout": [
            {
                "id": "perf-kpi",
                "columns": 1,
                "widgets": [
                    {"id": "perf-success-kpi", "title": "Success Rate", "chartType": "kpi", "metrics": ["success_rate"], "timeRange": _time_range()},
                ],
            },
            {
                "id": "perf-rates-latency",
                "columns": 2,
                "widgets": [
                    {"id": "perf-rate-trend", "title": "Success / Failure / Error Rate", "chartType": "area", "metrics": ["success_rate", "failure_rate", "error_rate"], "timeRange": _time_range()},
                    {"id": "perf-latency-trend", "title": "Latency Percentiles", "chartType": "line", "metrics": ["latency_p50", "latency_p95", "latency_p99"], "timeRange": _time_range()},
                ],
            },
            {
                "id": "perf-errors-queue",
                "columns": 2,
                "widgets": [
                    {"id": "perf-error-pie", "title": "Error Distribution", "chartType": "pie", "metrics": ["error_rate"], "breakdownDimension": "error_category", "timeRange": _time_range()},
                    {"id": "perf-queue-wait", "title": "Queue Wait Time", "chartType": "line", "metrics": ["queue_wait_avg", "queue_wait_p95"], "timeRange": _time_range()},
                ],
            },
        ],
    },
]
