import { describe, it, expect } from "vitest";
import {
  generateRunEvents,
  createEventGeneratorContext,
  pickAgentType,
  pickErrorCategory,
  weightedRandom,
  getOrgEventProfile,
  AGENT_TYPE_WEIGHTS,
  ERROR_DISTRIBUTION,
  type AgentType,
  type ErrorCategory,
} from "../generators/events.js";
import { ORGS, generateUsers, generateProjects } from "../generators/org.js";

function makeCtx() {
  const org = ORGS[0];
  const users = generateUsers(org, 42);
  const projects = generateProjects(org);
  return createEventGeneratorContext(org, users, projects);
}

// SIM-U01: Generated events have all required fields
describe("SIM-U01: Event schema completeness", () => {
  it("should generate events with all required fields", () => {
    const ctx = makeCtx();
    const events = generateRunEvents(ctx, new Date("2025-01-15T12:00:00Z"));

    expect(events).toHaveLength(2);

    const [startEvent, endEvent] = events;

    // Start event required fields
    expect(startEvent.run_id).toBeDefined();
    expect(startEvent.org_id).toBe("org_acme");
    expect(startEvent.team_id).toBeDefined();
    expect(startEvent.user_id).toBeDefined();
    expect(startEvent.project_id).toBeDefined();
    expect(startEvent.agent_type).toBeDefined();
    expect(startEvent.event_type).toBe("run_started");
    expect(startEvent.timestamp).toBeDefined();

    // End event required fields
    expect(endEvent.run_id).toBe(startEvent.run_id);
    expect(endEvent.org_id).toBe("org_acme");
    expect(endEvent.event_type).toMatch(/^run_(completed|failed)$/);
    expect(endEvent.duration_ms).toBeGreaterThan(0);
    expect(endEvent.tokens_input).toBeGreaterThan(0);
    expect(endEvent.tokens_output).toBeGreaterThan(0);
    expect(endEvent.model).toBeDefined();
    expect(endEvent.cost_usd).toBeGreaterThanOrEqual(0);
    expect(endEvent.tools_used).toBeDefined();
    expect(endEvent.tools_used!.length).toBeGreaterThan(0);
  });

  it("should set error_category only on failed events", () => {
    const ctx = makeCtx();

    // Generate enough events to get both successes and failures
    let foundCompleted = false;
    let foundFailed = false;

    for (let i = 0; i < 200; i++) {
      const events = generateRunEvents(
        ctx,
        new Date("2025-01-15T12:00:00Z"),
      );
      const endEvent = events[1];

      if (endEvent.event_type === "run_completed") {
        expect(endEvent.error_category).toBeUndefined();
        foundCompleted = true;
      } else if (endEvent.event_type === "run_failed") {
        expect(endEvent.error_category).toBeDefined();
        foundFailed = true;
      }

      if (foundCompleted && foundFailed) break;
    }

    expect(foundCompleted).toBe(true);
    expect(foundFailed).toBe(true);
  });
});

// SIM-U02: Agent type distribution matches configured weights
describe("SIM-U02: Agent type distribution", () => {
  it("should distribute agent types approximately matching weights", () => {
    const counts: Record<string, number> = {};
    const n = 10000;

    for (let i = 0; i < n; i++) {
      const type = pickAgentType();
      counts[type] = (counts[type] || 0) + 1;
    }

    // Check each type is within ±5% of expected
    for (const [type, weight] of Object.entries(AGENT_TYPE_WEIGHTS)) {
      const actual = (counts[type] || 0) / n;
      const expected = weight;
      expect(actual).toBeCloseTo(expected, 1); // within 0.05
    }
  });
});

// SIM-U03: Temporal patterns (tested in patterns.test.ts)
// SIM-U04: Team activity proportional to team size
describe("SIM-U04: Team activity proportional to team size", () => {
  it("should generate more events for larger teams", () => {
    const ctx = makeCtx();
    const teamCounts: Record<string, number> = {};

    for (let i = 0; i < 2000; i++) {
      const events = generateRunEvents(
        ctx,
        new Date("2025-01-15T12:00:00Z"),
      );
      const teamId = events[0].team_id;
      teamCounts[teamId] = (teamCounts[teamId] || 0) + 1;
    }

    // Platform (size 15) should have more events than Mobile (size 5)
    const platform = teamCounts["team_platform"] || 0;
    const mobile = teamCounts["team_mobile"] || 0;

    expect(platform).toBeGreaterThan(mobile);
    // Platform should be roughly 3x mobile (15/5), allow wide tolerance
    expect(platform / mobile).toBeGreaterThan(1.5);
    expect(platform / mobile).toBeLessThan(6);
  });
});

// SIM-U05: Seeded faker produces deterministic org structure
describe("SIM-U05: Deterministic org generation", () => {
  it("should produce same users with same seed", () => {
    const org = ORGS[0];
    const users1 = generateUsers(org, 42);
    const users2 = generateUsers(org, 42);

    expect(users1).toHaveLength(users2.length);
    for (let i = 0; i < users1.length; i++) {
      expect(users1[i].user_id).toBe(users2[i].user_id);
      expect(users1[i].name).toBe(users2[i].name);
      expect(users1[i].email).toBe(users2[i].email);
      expect(users1[i].team_id).toBe(users2[i].team_id);
      expect(users1[i].role).toBe(users2[i].role);
    }
  });

  it("should produce different users with different seed", () => {
    const org = ORGS[0];
    const users1 = generateUsers(org, 42);
    const users2 = generateUsers(org, 99);

    // Names should differ (very unlikely to match with different seeds)
    const names1 = users1.map((u) => u.name);
    const names2 = users2.map((u) => u.name);
    expect(names1).not.toEqual(names2);
  });
});

// SIM-U06: Error distribution matches configured rates
describe("SIM-U06: Error distribution", () => {
  it("should distribute error categories matching configured rates", () => {
    const counts: Record<string, number> = {};
    const n = 10000;

    for (let i = 0; i < n; i++) {
      const cat = pickErrorCategory();
      counts[cat] = (counts[cat] || 0) + 1;
    }

    for (const [category, weight] of Object.entries(ERROR_DISTRIBUTION)) {
      const actual = (counts[category] || 0) / n;
      expect(actual).toBeCloseTo(weight, 1); // within 0.05
    }
  });
});

// Additional: weightedRandom correctness
describe("weightedRandom", () => {
  it("should return items proportionally to weights", () => {
    const items = ["a", "b", "c"];
    const weights = [0.7, 0.2, 0.1];
    const counts: Record<string, number> = {};
    const n = 10000;

    for (let i = 0; i < n; i++) {
      const item = weightedRandom(items, weights);
      counts[item] = (counts[item] || 0) + 1;
    }

    expect(counts["a"]! / n).toBeCloseTo(0.7, 1);
    expect(counts["b"]! / n).toBeCloseTo(0.2, 1);
    expect(counts["c"]! / n).toBeCloseTo(0.1, 1);
  });
});

// Additional: success rate validation
describe("Success rate", () => {
  it("should succeed approximately at org-specific rate", () => {
    const ctx = makeCtx();
    const profile = getOrgEventProfile(ctx.org.id);
    let succeeded = 0;
    const n = 2000;

    for (let i = 0; i < n; i++) {
      const events = generateRunEvents(
        ctx,
        new Date("2025-01-15T12:00:00Z"),
      );
      if (events[1].event_type === "run_completed") succeeded++;
    }

    const rate = succeeded / n;
    expect(rate).toBeCloseTo(profile.successRate, 1);
  });
});
