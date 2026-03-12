import { loadConfig } from "./config.js";
import { seedDatabase } from "./seed-data.js";
import {
  generateRunEvents,
  createEventGeneratorContext,
  getOrgEventProfile,
  type AgentEvent,
  type EventGeneratorContext,
} from "./generators/events.js";
import {
  expectedEventsForDay,
  distributeEventsAcrossHours,
} from "./generators/patterns.js";
import { sendEvents, sleep } from "./sender.js";

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
    const profile = getOrgEventProfile(org.id);

    console.log(
      `[simulator] Generating ${config.backfillDays} days of history for ${org.name} (~${profile.baseDailyEvents} events/day)...`,
    );

    let totalEvents = 0;

    for (let daysAgo = config.backfillDays; daysAgo >= 1; daysAgo--) {
      const dayDate = new Date(now);
      dayDate.setUTCDate(dayDate.getUTCDate() - daysAgo);
      dayDate.setUTCHours(0, 0, 0, 0);

      const dayEventCount = expectedEventsForDay(dayDate, profile.baseDailyEvents);
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

  // Step 3: Live mode — generate events for all orgs (round-robin)
  console.log("\n[simulator] === Phase 3: Live Mode ===");
  console.log(
    `[simulator] Generating ~${config.liveEventsPerSec} events/sec across ${orgs.length} org(s)...`,
  );

  const liveContexts: EventGeneratorContext[] = orgs.map((org) => {
    const orgUsers = users.filter((u) => u.org_id === org.id);
    const orgProjects = projects.filter((p) => p.org_id === org.id);
    return createEventGeneratorContext(org, orgUsers, orgProjects);
  });

  // Generate events at the configured rate, rotating across orgs
  const intervalMs = 1000 / config.liveEventsPerSec;
  let orgIndex = 0;

  const runLiveLoop = async () => {
    while (true) {
      try {
        const ctx = liveContexts[orgIndex % liveContexts.length];
        orgIndex++;
        const events = generateRunEvents(ctx, new Date());
        await sendEvents(config.ingestionUrl, events);
      } catch (error) {
        console.error("[simulator] Live mode error:", error);
      }
      await sleep(intervalMs);
    }
  };

  await runLiveLoop();
}

main().catch((error) => {
  console.error("[simulator] Fatal error:", error);
  process.exit(1);
});
