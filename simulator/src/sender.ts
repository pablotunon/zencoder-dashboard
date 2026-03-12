import type { AgentEvent } from "./generators/events.js";

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 500;
const BATCH_SIZE = 50;

interface IngestResponse {
  accepted: number;
  rejected: number;
  errors: Array<{ index: number; error: string }>;
}

/**
 * Send a batch of events to the ingestion service with retry logic.
 */
async function sendBatchWithRetry(
  ingestionUrl: string,
  events: AgentEvent[],
  attempt = 1,
): Promise<IngestResponse> {
  const url = `${ingestionUrl}/ingest/events`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });

    if (response.status === 503 && attempt <= MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[sender] 503 from ingestion, retry ${attempt}/${MAX_RETRIES} in ${backoff}ms`,
      );
      await sleep(backoff);
      return sendBatchWithRetry(ingestionUrl, events, attempt + 1);
    }

    if (!response.ok && response.status !== 202) {
      const text = await response.text();
      throw new Error(
        `Ingestion returned ${response.status}: ${text}`,
      );
    }

    return (await response.json()) as IngestResponse;
  } catch (error: unknown) {
    if (
      attempt <= MAX_RETRIES &&
      error instanceof Error &&
      (error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed"))
    ) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[sender] Connection error, retry ${attempt}/${MAX_RETRIES} in ${backoff}ms: ${error.message}`,
      );
      await sleep(backoff);
      return sendBatchWithRetry(ingestionUrl, events, attempt + 1);
    }
    throw error;
  }
}

/**
 * Send a large array of events in batches of BATCH_SIZE.
 * Returns total accepted/rejected counts.
 */
export async function sendEvents(
  ingestionUrl: string,
  events: AgentEvent[],
): Promise<{ accepted: number; rejected: number }> {
  let totalAccepted = 0;
  let totalRejected = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const result = await sendBatchWithRetry(ingestionUrl, batch);
    totalAccepted += result.accepted;
    totalRejected += result.rejected;

    if (result.rejected > 0) {
      console.warn(
        `[sender] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.accepted} accepted, ${result.rejected} rejected`,
      );
      for (const err of result.errors) {
        console.warn(`  [${err.index}]: ${err.error}`);
      }
    }
  }

  return { accepted: totalAccepted, rejected: totalRejected };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
