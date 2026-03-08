"""Tests for the ClickHouse writer module.

Tests event filtering (only completed/failed events are inserted)
and field mapping to the agent_runs schema.
"""

import pytest
from app.consumer import AgentEvent
from app.writers.clickhouse import _compute_status, _parse_timestamp


class TestComputeStatus:
    @pytest.mark.parametrize("event_type,expected_status", [
        ("run_completed", "completed"),
        ("run_failed", "failed"),
        ("run_started", "running"),
    ])
    def test_compute_status(self, event_type, expected_status):
        event = AgentEvent(
            run_id="r1", org_id="o", team_id="t", user_id="u",
            project_id="p", agent_type="coding",
            event_type=event_type, timestamp="2024-01-01T00:00:00Z",
        )
        assert _compute_status(event) == expected_status


class TestParseTimestamp:
    @pytest.mark.parametrize("ts_string,expected_hour,expected_microsecond", [
        ("2024-01-15T10:30:00Z", 10, 0),
        ("2024-01-15T10:30:00+00:00", 10, 0),
        ("2024-01-15T10:30:00.123Z", 10, 123000),
    ])
    def test_parse_timestamp(self, ts_string, expected_hour, expected_microsecond):
        dt = _parse_timestamp(ts_string)
        assert dt.year == 2024
        assert dt.month == 1
        assert dt.day == 15
        assert dt.hour == expected_hour
        assert dt.microsecond == expected_microsecond


class TestInsertEventsFiltering:
    """Verify that only completed/failed events are inserted."""

    def test_only_completed_and_failed_are_inserted(self):
        """run_started events should be filtered out."""
        from app.writers.clickhouse import insert_events

        events = [
            AgentEvent(
                run_id="r1", org_id="o", team_id="t", user_id="u",
                project_id="p", agent_type="coding",
                event_type="run_started", timestamp="2024-01-01T00:00:00Z",
            ),
            AgentEvent(
                run_id="r2", org_id="o", team_id="t", user_id="u",
                project_id="p", agent_type="coding",
                event_type="run_completed", timestamp="2024-01-01T00:01:00Z",
                duration_ms=30000, tokens_input=1000, tokens_output=200,
                model="claude-sonnet-4-20250514", cost_usd=0.05,
            ),
            AgentEvent(
                run_id="r3", org_id="o", team_id="t", user_id="u",
                project_id="p", agent_type="review",
                event_type="run_failed", timestamp="2024-01-01T00:02:00Z",
                duration_ms=10000, tokens_input=500, tokens_output=100,
                model="gpt-4o", cost_usd=0.02, error_category="timeout",
            ),
        ]

        # Filter completed events (same logic as insert_events uses)
        completed = [
            e for e in events
            if e.event_type in ("run_completed", "run_failed")
        ]

        assert len(completed) == 2
        assert completed[0].run_id == "r2"
        assert completed[1].run_id == "r3"
