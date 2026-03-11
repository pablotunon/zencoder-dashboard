"""Tests for aggregation/rollup computation logic.

AGG-U02: Daily rollup computation: run counts.
AGG-U03: Daily rollup computation: latency percentiles.
AGG-U04: Daily rollup computation: active user count.
AGG-U05: Daily rollup computation: cost aggregation.
"""


def compute_percentile(values: list[float], p: float) -> float:
    """Compute percentile matching ClickHouse's quantile() behavior.

    Uses linear interpolation (same as Python's statistics.quantiles
    with method='inclusive' for common percentiles).
    """
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    if n == 0:
        return 0.0
    if n == 1:
        return sorted_vals[0]
    # Use linear interpolation
    idx = p * (n - 1)
    lo = int(idx)
    hi = lo + 1
    if hi >= n:
        return sorted_vals[-1]
    frac = idx - lo
    return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])


class TestRollupComputation:
    """Tests for the rollup computation logic.

    These tests validate the expected aggregation behavior that the
    ClickHouse SQL queries in aggregator.py implement. They test the
    logic of the aggregation, not the ClickHouse queries directly.
    """

    def _make_events(self) -> list[dict]:
        """Create a set of 100 test events with known properties."""
        events = []
        for i in range(100):
            is_success = i < 87  # 87% success rate
            user_id = f"user_{(i % 15) + 1:03d}"
            team_id = f"team_{(i % 3) + 1}"

            events.append({
                "run_id": f"run_{i:04d}",
                "org_id": "org_acme",
                "team_id": team_id,
                "user_id": user_id,
                "project_id": f"proj_{(i % 5) + 1}",
                "agent_type": "coding" if i % 2 == 0 else "review",
                "status": "completed" if is_success else "failed",
                "duration_ms": 10000 + i * 1000,  # 10s to 109s
                "tokens_input": 1000 + i * 100,
                "tokens_output": 200 + i * 50,
                "cost_usd": 0.01 * (i + 1),
                "queue_wait_ms": 100 + i * 50,
            })
        return events

    def test_run_counts(self):
        """AGG-U02: 100 events with 87 success → totals correct."""
        events = self._make_events()

        total_runs = len(events)
        successful_runs = sum(1 for e in events if e["status"] == "completed")
        failed_runs = sum(1 for e in events if e["status"] == "failed")

        assert total_runs == 100
        assert successful_runs == 87
        assert failed_runs == 13
        assert successful_runs + failed_runs == total_runs

    def test_latency_percentiles(self):
        """AGG-U03: Known durations → p50/p95/p99 calculated correctly."""
        events = self._make_events()
        durations = [e["duration_ms"] for e in events]

        p50 = compute_percentile(durations, 0.5)
        p95 = compute_percentile(durations, 0.95)
        p99 = compute_percentile(durations, 0.99)

        # Verify ordering invariant: p50 ≤ p95 ≤ p99
        assert p50 <= p95 <= p99

        # Known values for our arithmetic sequence:
        # durations = [10000, 11000, ..., 109000]
        # p50 = median ≈ 59500
        assert 59000 <= p50 <= 60000
        # p95 ≈ 104050
        assert 103000 <= p95 <= 106000
        # p99 ≈ 108010
        assert 107000 <= p99 <= 110000

    def test_active_user_count(self):
        """AGG-U04: 100 events from 15 unique users → active_users = 15."""
        events = self._make_events()

        unique_users = len({e["user_id"] for e in events})

        assert unique_users == 15

    def test_cost_aggregation(self):
        """AGG-U05: Sum of individual costs matches total_cost."""
        events = self._make_events()

        individual_costs = [e["cost_usd"] for e in events]
        total_cost = sum(individual_costs)

        # Expected: sum of 0.01 * (1 + 2 + ... + 100) = 0.01 * 5050 = 50.50
        assert abs(total_cost - 50.50) < 0.01

        # Verify per-team cost sums are consistent
        team_costs: dict[str, float] = {}
        for e in events:
            team_costs[e["team_id"]] = team_costs.get(e["team_id"], 0) + e["cost_usd"]

        assert abs(sum(team_costs.values()) - total_cost) < 0.01

    def test_team_breakdown(self):
        """Verify events are distributed across teams."""
        events = self._make_events()

        team_counts: dict[str, int] = {}
        for e in events:
            team_counts[e["team_id"]] = team_counts.get(e["team_id"], 0) + 1

        # 100 events across 3 teams (round-robin: i % 3)
        assert len(team_counts) == 3
        # team_1: 34, team_2: 33, team_3: 33
        for team_id, count in team_counts.items():
            assert count >= 33
            assert count <= 34

    def test_agent_type_breakdown(self):
        """Verify agent type distribution."""
        events = self._make_events()

        type_counts: dict[str, int] = {}
        for e in events:
            type_counts[e["agent_type"]] = type_counts.get(e["agent_type"], 0) + 1

        # Even/odd split: coding 50, review 50
        assert type_counts["coding"] == 50
        assert type_counts["review"] == 50

    def test_project_breakdown(self):
        """Verify project distribution and active users per project."""
        events = self._make_events()

        project_users: dict[str, set] = {}
        project_costs: dict[str, float] = {}
        for e in events:
            pid = e["project_id"]
            if pid not in project_users:
                project_users[pid] = set()
                project_costs[pid] = 0.0
            project_users[pid].add(e["user_id"])
            project_costs[pid] += e["cost_usd"]

        # 5 projects
        assert len(project_users) == 5

        # Each project should have active users
        for pid, users in project_users.items():
            assert len(users) > 0

        # Total cost across projects should match
        total_project_cost = sum(project_costs.values())
        total_event_cost = sum(e["cost_usd"] for e in events)
        assert abs(total_project_cost - total_event_cost) < 0.01
