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
        return {"data": json.dumps(event_dict)}

    def _base_event(self, **overrides) -> dict:
        base = {
            "run_id": "550e8400-e29b-41d4-a716-446655440000",
            "org_id": "org_acme",
            "team_id": "team_platform",
            "user_id": "user_001",
            "project_id": "proj_001",
            "agent_type": "coding",
            "event_type": "run_completed",
            "timestamp": "2024-01-15T10:30:00Z",
        }
        base.update(overrides)
        return base

    def test_parse_completed_event(self):
        """Parse a fully-populated run_completed event."""
        raw = self._make_raw(self._base_event(
            duration_ms=45000, tokens_input=25000, tokens_output=5000,
            model="claude-sonnet-4-20250514", cost_usd=0.15,
            error_category=None, tools_used=["file_read", "file_write"],
            queue_wait_ms=500,
        ))
        event = parse_event(raw)
        assert isinstance(event, AgentEvent)
        assert event.run_id == "550e8400-e29b-41d4-a716-446655440000"
        assert event.org_id == "org_acme"
        assert event.event_type == "run_completed"
        assert event.duration_ms == 45000
        assert event.cost_usd == 0.15

    @pytest.mark.parametrize("event_type,has_duration", [
        ("run_started", False),
        ("run_failed", True),
    ])
    def test_parse_event_types(self, event_type, has_duration):
        """Parse different event types with appropriate optional fields."""
        extras = {"event_type": event_type}
        if has_duration:
            extras.update(duration_ms=60000, tokens_input=10000,
                          tokens_output=2000, model="gpt-4o", cost_usd=0.06,
                          error_category="timeout", queue_wait_ms=1500)
        raw = self._make_raw(self._base_event(**extras))
        event = parse_event(raw)
        assert event.event_type == event_type
        if not has_duration:
            assert event.duration_ms is None

    def test_parse_missing_required_field_raises(self):
        """Missing required field raises KeyError."""
        event = self._base_event()
        del event["org_id"]
        with pytest.raises(KeyError):
            parse_event(self._make_raw(event))

    def test_parse_invalid_json_raises(self):
        """Invalid JSON in data field raises JSONDecodeError."""
        with pytest.raises(json.JSONDecodeError):
            parse_event({"data": "not valid json{{{"})
