export interface Config {
  ingestionUrl: string;
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  backfillDays: number;
  liveEventsPerSec: number;
}

export function loadConfig(): Config {
  return {
    ingestionUrl:
      process.env.INGESTION_URL || "http://localhost:8001",
    postgres: {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB || "agenthub",
      user: process.env.POSTGRES_USER || "agenthub",
      password: process.env.POSTGRES_PASSWORD || "agenthub_dev",
    },
    backfillDays: parseInt(
      process.env.SIMULATOR_BACKFILL_DAYS || "90",
      10,
    ),
    liveEventsPerSec: parseInt(
      process.env.SIMULATOR_LIVE_EVENTS_PER_SEC || "3",
      10,
    ),
  };
}
