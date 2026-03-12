export interface Config {
  ingestionUrl: string;
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
  };
  backfillDays: number;
  /** When set, overrides the derived live rate. Undefined means "derive from backfill parameters". */
  liveEventsPerSecOverride: number | undefined;
}

export function loadConfig(): Config {
  const envLiveRate = process.env.SIMULATOR_LIVE_EVENTS_PER_SEC;
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
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    },
    backfillDays: parseInt(
      process.env.SIMULATOR_BACKFILL_DAYS || "90",
      10,
    ),
    liveEventsPerSecOverride: envLiveRate ? parseInt(envLiveRate, 10) : undefined,
  };
}
