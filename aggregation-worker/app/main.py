"""Aggregation Worker — main entry point.

Consumes events from Redis Streams and inserts raw data into ClickHouse.
"""

import logging
import signal
import sys
import time

import redis as redis_lib

from app.config import Config
from app.consumer import ack_events, ensure_consumer_group, read_events
from app.enrichment import EnrichmentCache
from app.writers.clickhouse import create_client as create_ch_client
from app.writers.clickhouse import insert_events
from app.writers.redis_cache import invalidate_metrics_cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class Worker:
    def __init__(self, config: Config):
        self.config = config
        self._running = True

    def stop(self, signum=None, frame=None):
        logger.info("Shutdown signal received, stopping...")
        self._running = False

    def run(self) -> None:
        config = self.config

        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)

        # Connect to Redis
        r = redis_lib.Redis(
            host=config.REDIS_HOST,
            port=config.REDIS_PORT,
            decode_responses=True,
        )

        # Wait for Redis to be ready
        self._wait_for_redis(r)

        # Ensure consumer group exists
        ensure_consumer_group(r, config)

        # Create ClickHouse client
        ch_client = self._create_ch_client_with_retry(config)

        # Initialize enrichment cache
        enrichment = EnrichmentCache(config)
        enrichment.refresh()

        logger.info("Aggregation worker started")

        total_processed = 0

        while self._running:
            try:
                # Refresh enrichment cache periodically
                enrichment.refresh()

                # Read batch from Redis Stream
                events = read_events(r, config)

                if events:
                    message_ids = [mid for mid, _ in events]
                    event_objects = [evt for _, evt in events]

                    try:
                        # Insert raw events into ClickHouse
                        inserted = insert_events(ch_client, event_objects)

                        # Collect unique org_ids for cache invalidation
                        org_ids = {e.org_id for e in event_objects}
                        for org_id in org_ids:
                            invalidate_metrics_cache(r, org_id)

                        # ACK after successful processing
                        ack_events(r, config, message_ids)
                        total_processed += len(events)

                        if inserted > 0:
                            logger.info(
                                "Processed %d events (%d inserted into ClickHouse, total: %d)",
                                len(events),
                                inserted,
                                total_processed,
                            )
                    except Exception:
                        # Don't ACK on failure — events will be reprocessed
                        logger.exception(
                            "Failed to process batch of %d events",
                            len(events),
                        )

            except redis_lib.ConnectionError:
                logger.error("Redis connection lost, reconnecting in 5s...")
                time.sleep(5)
            except Exception:
                logger.exception("Unexpected error in consumer loop")
                time.sleep(1)

        logger.info(
            "Worker stopped. Total events processed: %d", total_processed
        )

    def _wait_for_service(self, name: str, connect_fn, max_attempts: int = 30, sleep_seconds: int = 2):
        """Try calling *connect_fn* up to *max_attempts* times, exiting on failure."""
        for attempt in range(max_attempts):
            try:
                result = connect_fn()
                logger.info("Connected to %s", name)
                return result
            except Exception:
                logger.info(
                    "Waiting for %s (attempt %d/%d)...",
                    name, attempt + 1, max_attempts,
                )
                time.sleep(sleep_seconds)
        logger.error("Could not connect to %s after %d attempts", name, max_attempts)
        sys.exit(1)

    def _wait_for_redis(self, r: redis_lib.Redis) -> None:
        """Wait for Redis to be available."""
        self._wait_for_service("Redis", r.ping)

    def _create_ch_client_with_retry(self, config: Config):
        """Create ClickHouse client with retry logic."""
        def connect():
            client = create_ch_client(config)
            client.query("SELECT 1")
            return client
        return self._wait_for_service("ClickHouse", connect)


def main():
    config = Config()
    worker = Worker(config)
    worker.run()


if __name__ == "__main__":
    main()
