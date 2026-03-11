"""Redis Streams consumer for agent events."""

import json
import logging
from dataclasses import dataclass
from typing import Optional

import redis

from app.config import Config

logger = logging.getLogger(__name__)


@dataclass
class AgentEvent:
    """Parsed agent event from Redis Stream."""

    run_id: str
    org_id: str
    team_id: str
    user_id: str
    project_id: str
    agent_type: str
    event_type: str
    timestamp: str
    duration_ms: Optional[int] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    model: Optional[str] = None
    cost_usd: Optional[float] = None
    error_category: Optional[str] = None
    queue_wait_ms: Optional[int] = None
    user_rating: Optional[str] = None


def parse_event(raw_data: dict[str, str]) -> AgentEvent:
    """Parse a raw Redis Stream message into an AgentEvent.

    The ingestion service publishes events with a single 'data' field
    containing a JSON-serialized AgentEvent.
    """
    event_json = raw_data.get("data", "{}")
    data = json.loads(event_json)

    return AgentEvent(
        run_id=data["run_id"],
        org_id=data["org_id"],
        team_id=data["team_id"],
        user_id=data["user_id"],
        project_id=data["project_id"],
        agent_type=data["agent_type"],
        event_type=data["event_type"],
        timestamp=data["timestamp"],
        duration_ms=data.get("duration_ms"),
        tokens_input=data.get("tokens_input"),
        tokens_output=data.get("tokens_output"),
        model=data.get("model"),
        cost_usd=data.get("cost_usd"),
        error_category=data.get("error_category"),
        queue_wait_ms=data.get("queue_wait_ms"),
        user_rating=data.get("user_rating"),
    )


def ensure_consumer_group(r: redis.Redis, config: Config) -> None:
    """Create the consumer group if it doesn't exist."""
    try:
        r.xgroup_create(
            config.STREAM_KEY,
            config.CONSUMER_GROUP,
            id="0",
            mkstream=True,
        )
        logger.info(
            "Created consumer group '%s' on stream '%s'",
            config.CONSUMER_GROUP,
            config.STREAM_KEY,
        )
    except redis.ResponseError as e:
        if "BUSYGROUP" in str(e):
            # Group already exists
            pass
        else:
            raise


def read_events(
    r: redis.Redis, config: Config
) -> list[tuple[str, AgentEvent]]:
    """Read a batch of events from the Redis Stream.

    Returns a list of (message_id, AgentEvent) tuples.
    """
    results = r.xreadgroup(
        groupname=config.CONSUMER_GROUP,
        consumername=config.CONSUMER_NAME,
        streams={config.STREAM_KEY: ">"},
        count=config.BATCH_SIZE,
        block=config.BLOCK_MS,
    )

    events: list[tuple[str, AgentEvent]] = []
    if not results:
        return events

    for _stream_name, messages in results:
        for message_id, raw_data in messages:
            try:
                event = parse_event(raw_data)
                events.append((message_id, event))
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(
                    "Failed to parse event %s: %s", message_id, e
                )
                # ACK malformed messages so they don't block the stream
                r.xack(config.STREAM_KEY, config.CONSUMER_GROUP, message_id)

    return events


def ack_events(
    r: redis.Redis, config: Config, message_ids: list[str]
) -> None:
    """Acknowledge processed messages."""
    if message_ids:
        r.xack(config.STREAM_KEY, config.CONSUMER_GROUP, *message_ids)
