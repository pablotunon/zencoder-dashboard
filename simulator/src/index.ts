import { loadConfig } from "./config.js";
import { seedDatabase } from "./seed-data.js";
import {
  generateRunEvents,
  createEventGeneratorContext,
  type AgentEvent,
} from "./generators/events.js";
import {
  expectedEventsForDay,
  distributeEventsAcrossHours,
} from "./generators/patterns.js";
import { sendEvents } from "./sender.js";

const BASE_DAILY_EVENTS = 200; // ~200 agent runs on a typical weekday

async function main() {
  const config = loadConfig();
  console.log("[simulator] Starting AgentHub Event Simulator");
  console.log(
    `[simulator] Ingestion URL: ${config.ingestionUrl}`,
  );
  console.log(
    `[simulator] Backfill days: ${config.backfillDays}`,
  );

  // Step 1: Seed PostgreSQL with org structure
  console.log("\n[simulator] === Phase 1: Seeding PostgreSQL ===");
  const { orgs, users, projects } = await seedDatabase(config);

  // Step 2: Historical backfill
  console.log("\n[simulator] === Phase 2: Historical Backfill ===");
  const now = new Date();

  for (const org of orgs) {
    const orgUsers = users.filter((u) => u.org_id === org.id);
    const orgProjects = projects.filter((p) => p.org_id === org.id);
    const ctx = createEventGeneratorContext(org, orgUsers, orgProjects);

    console.log(
      `[simulator] Generating ${config.backfillDays} days of history for ${org.name}...`,
    );

    let totalEvents = 0;

    for (let daysAgo = config.backfillDays; daysAgo >= 1; daysAgo--) {
      const dayDate = new Date(now);
      dayDate.setUTCDate(dayDate.getUTCDate() - daysAgo);
      dayDate.setUTCHours(0, 0, 0, 0);

      const dayEventCount = expectedEventsForDay(dayDate, BASE_DAILY_EVENTS);
      const hourDistribution = distributeEventsAcrossHours(dayEventCount);

      const dayEvents: AgentEvent[] = [];

      for (let hour = 0; hour < 24; hour++) {
        const count = hourDistribution[hour];
        for (let i = 0; i < count; i++) {
          // Random minute/second within this hour
          const minute = Math.floor(Math.random() * 60);
          const second = Math.floor(Math.random() * 60);
          const timestamp = new Date(dayDate);
          timestamp.setUTCHours(hour, minute, second);

          const events = generateRunEvents(ctx, timestamp);
          dayEvents.push(...events);
        }
      }

      // Send all events for this day
      if (dayEvents.length > 0) {
        const result = await sendEvents(config.ingestionUrl, dayEvents);
        totalEvents += result.accepted;
      }

      // Progress log every 10 days
      if (daysAgo % 10 === 0) {
        console.log(
          `[simulator] ${org.name}: ${config.backfillDays - daysAgo + 1}/${config.backfillDays} days done (${totalEvents} events sent)`,
        );
      }
    }

    console.log(
      `[simulator] ${org.name}: Backfill complete. ${totalEvents} total events sent.`,
    );
  }

  // Step 3: Live mode
  console.log("\n[simulator] === Phase 3: Live Mode ===");
  console.log(
    `[simulator] Generating ~${config.liveEventsPerSec} events/sec...`,
  );

  // Pick the first org for live mode (single org in Phase A)
  const liveOrg = orgs[0];
  const liveUsers = users.filter((u) => u.org_id === liveOrg.id);
  const liveProjects = projects.filter(
    (p) => p.org_id === liveOrg.id,
  );
  const liveCtx = createEventGeneratorContext(
    liveOrg,
    liveUsers,
    liveProjects,
  );

  // Generate events at the configured rate
  const intervalMs = 1000 / config.liveEventsPerSec;

  const runLiveLoop = async () => {
    while (true) {
      try {
        const events = generateRunEvents(liveCtx, new Date());
        await sendEvents(config.ingestionUrl, events);
      } catch (error) {
        console.error("[simulator] Live mode error:", error);
      }
      await sleep(intervalMs);
    }
  };

  await runLiveLoop();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[simulator] Fatal error:", error);
  process.exit(1);
});
