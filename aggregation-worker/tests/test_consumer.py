"""Tests for the consumer module.

AGG-U01: Event parsing from Redis Stream format.
AGG-U06: Enrichment: user → team mapping.
"""

import json

import pytest

from app.consumer import AgentEvent, parse_event


class TestParseEvent:
    """AGG-U01: Event parsing from Redis Stream format."""

    def _make_raw(self, event_dict: dict) -> dict[str, str]:
        """Wrap an event dict in the Redis Stream format (single 'data' field)."""
        return {"data": json.dumps(event_dict)}

    def test_parse_completed_event(self):
        """Parse a fully-populated run_completed event."""
        raw = self._make_raw({
            "run_id": "550e8400-e29b-41d4-a716-446655440000",
            "org_id": "org_acme",
            "team_id": "team_platform",
            "user_id": "user_001",
            "project_id": "proj_001",
            "agent_type": "coding",
            "event_type": "run_completed",
            "timestamp": "2024-01-15T10:30:00Z",
            "duration_ms": 45000,
            "tokens_input": 25000,
            "tokens_output": 5000,
            "model": "claude-sonnet-4-20250514",
            "cost_usd": 0.15,
            "error_category": None,
            "tools_used": ["file_read", "file_write"],
            "queue_wait_ms": 500,
        })

        event = parse_event(raw)

        assert isinstance(event, AgentEvent)
        assert event.run_id == "550e8400-e29b-41d4-a716-446655440000"
        assert event.org_id == "org_acme"
        assert event.team_id == "team_platform"
        assert event.user_id == "user_001"
        assert event.project_id == "proj_001"
        assert event.agent_type == "coding"
        assert event.event_type == "run_completed"
        assert event.timestamp == "2024-01-15T10:30:00Z"
        assert event.duration_ms == 45000
        assert event.tokens_input == 25000
        assert event.tokens_output == 5000
        assert event.model == "claude-sonnet-4-20250514"
        assert event.cost_usd == 0.15
        assert event.error_category is None
        assert event.tools_used == ["file_read", "file_write"]
        assert event.queue_wait_ms == 500

    def test_parse_started_event(self):
        """Parse a run_started event with minimal fields."""
        raw = self._make_raw({
            "run_id": "550e8400-e29b-41d4-a716-446655440001",
            "org_id": "org_acme",
            "team_id": "team_backend",
            "user_id": "user_002",
            "project_id": "proj_002",
            "agent_type": "review",
            "event_type": "run_started",
            "timestamp": "2024-01-15T10:30:00Z",
        })

        event = parse_event(raw)

        assert event.event_type == "run_started"
        assert event.duration_ms is None
        assert event.tokens_input is None
        assert event.cost_usd is None

    def test_parse_failed_event_with_error(self):
        """Parse a run_failed event with error_category."""
        raw = self._make_raw({
            "run_id": "550e8400-e29b-41d4-a716-446655440002",
            "org_id": "org_acme",
            "team_id": "team_data",
            "user_id": "user_003",
            "project_id": "proj_003",
            "agent_type": "testing",
            "event_type": "run_failed",
            "timestamp": "2024-01-15T10:35:00Z",
            "duration_ms": 60000,
            "tokens_input": 10000,
            "tokens_output": 2000,
            "model": "gpt-4o",
            "cost_usd": 0.06,
            "error_category": "timeout",
            "queue_wait_ms": 1500,
        })

        event = parse_event(raw)

        assert event.event_type == "run_failed"
        assert event.error_category == "timeout"
        assert event.cost_usd == 0.06

    def test_parse_missing_required_field_raises(self):
        """Missing required field raises KeyError."""
        raw = self._make_raw({
            "run_id": "550e8400-e29b-41d4-a716-446655440003",
            # Missing org_id
            "team_id": "team_frontend",
            "user_id": "user_004",
            "project_id": "proj_004",
            "agent_type": "coding",
            "event_type": "run_completed",
            "timestamp": "2024-01-15T10:30:00Z",
        })

        with pytest.raises(KeyError):
            parse_event(raw)

    def test_parse_invalid_json_raises(self):
        """Invalid JSON in data field raises JSONDecodeError."""
        raw = {"data": "not valid json{{{"}

        with pytest.raises(json.JSONDecodeError):
            parse_event(raw)
