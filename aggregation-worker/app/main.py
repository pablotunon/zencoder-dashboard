"""Aggregation Worker — main entry point.

Consumes events from Redis Streams, inserts raw data into ClickHouse,
and periodically computes daily rollup aggregates.
"""

import logging
import signal
import sys
import time

import redis as redis_lib

from app.aggregator import compute_rollups
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
        self._last_rollup: float = 0

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

                # Periodic rollup computation
                now = time.time()
                if now - self._last_rollup >= config.ROLLUP_INTERVAL_SECONDS:
                    try:
                        compute_rollups(ch_client)
                        self._last_rollup = now
                    except Exception:
                        logger.exception("Failed to compute rollups")

            except redis_lib.ConnectionError:
                logger.error("Redis connection lost, reconnecting in 5s...")
                time.sleep(5)
            except Exception:
                logger.exception("Unexpected error in consumer loop")
                time.sleep(1)

        logger.info(
            "Worker stopped. Total events processed: %d", total_processed
        )

    def _wait_for_redis(self, r: redis_lib.Redis) -> None:
        """Wait for Redis to be available."""
        for attempt in range(30):
            try:
                r.ping()
                logger.info("Connected to Redis")
                return
            except redis_lib.ConnectionError:
                logger.info(
                    "Waiting for Redis (attempt %d/30)...", attempt + 1
                )
                time.sleep(2)
        logger.error("Could not connect to Redis after 30 attempts")
        sys.exit(1)

    def _create_ch_client_with_retry(self, config: Config):
        """Create ClickHouse client with retry logic."""
        for attempt in range(30):
            try:
                client = create_ch_client(config)
                # Test the connection
                client.query("SELECT 1")
                logger.info("Connected to ClickHouse")
                return client
            except Exception:
                logger.info(
                    "Waiting for ClickHouse (attempt %d/30)...", attempt + 1
                )
                time.sleep(2)
        logger.error("Could not connect to ClickHouse after 30 attempts")
        sys.exit(1)


def main():
    config = Config()
    worker = Worker(config)
    worker.run()


if __name__ == "__main__":
    main()
