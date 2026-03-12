import { randomUUID } from "crypto";
import type { OrgDefinition, UserRecord, ProjectRecord } from "./org.js";

export type AgentType =
  | "coding"
  | "review"
  | "testing"
  | "ci"
  | "debugging"
  | "general";
type EventType = "run_started" | "run_completed" | "run_failed";
export type ErrorCategory =
  | "timeout"
  | "rate_limit"
  | "context_overflow"
  | "tool_error"
  | "internal_error";

type UserRating = "positive" | "negative";

export interface AgentEvent {
  run_id: string;
  org_id: string;
  team_id: string;
  user_id: string;
  project_id: string;
  agent_type: AgentType;
  event_type: EventType;
  timestamp: string; // ISO 8601
  duration_ms?: number;
  tokens_input?: number;
  tokens_output?: number;
  model?: string;
  cost_usd?: number;
  error_category?: ErrorCategory;
  tools_used?: string[];
  queue_wait_ms?: number;
  user_rating?: UserRating;
}

export const AGENT_TYPE_WEIGHTS: Record<AgentType, number> = {
  coding: 0.4,
  review: 0.2,
  testing: 0.15,
  ci: 0.1,
  debugging: 0.1,
  general: 0.05,
};

const AGENT_TYPES: AgentType[] = Object.keys(AGENT_TYPE_WEIGHTS) as AgentType[];

const DEFAULT_SUCCESS_RATE = 0.87;

/**
 * Per-team overrides for event generation characteristics.
 * Fields are optional — absent fields fall back to org/global defaults.
 */
export interface TeamEventProfile {
  agentTypeWeights?: Partial<Record<AgentType, number>>;
  modelWeights?: { models: string[]; weights: number[] };
  preferredTools?: string[];
}

/**
 * Per-org event generation characteristics.
 * Orgs not listed here use defaults.
 */
export interface OrgEventProfile {
  baseDailyEvents: number;
  successRate: number;
  teamProfiles?: Record<string, TeamEventProfile>;
}

const ORG_EVENT_PROFILES: Record<string, OrgEventProfile> = {
  org_acme: {
    baseDailyEvents: 200,
    successRate: 0.87,
    teamProfiles: {
      team_platform: {
        agentTypeWeights: { coding: 0.25, review: 0.15, testing: 0.15, ci: 0.25, debugging: 0.15, general: 0.05 },
        preferredTools: ["terminal", "docker", "git", "database_query"],
      },
      team_backend: {
        agentTypeWeights: { coding: 0.35, review: 0.20, testing: 0.20, ci: 0.15, debugging: 0.05, general: 0.05 },
        preferredTools: ["terminal", "file_read", "file_write", "database_query", "git"],
      },
      team_frontend: {
        agentTypeWeights: { coding: 0.55, review: 0.20, testing: 0.10, ci: 0.05, debugging: 0.05, general: 0.05 },
        preferredTools: ["file_read", "file_write", "linter", "test_runner", "web_search"],
      },
      team_data: {
        agentTypeWeights: { coding: 0.30, review: 0.10, testing: 0.15, ci: 0.10, debugging: 0.10, general: 0.25 },
        preferredTools: ["database_query", "terminal", "file_read", "file_write"],
      },
      team_mobile: {
        agentTypeWeights: { coding: 0.50, review: 0.20, testing: 0.15, ci: 0.05, debugging: 0.05, general: 0.05 },
        preferredTools: ["file_read", "file_write", "linter", "test_runner"],
      },
    },
  },
  org_globex: {
    baseDailyEvents: 120,
    successRate: 0.90,
    teamProfiles: {
      team_globex_eng: {
        agentTypeWeights: { coding: 0.40, review: 0.20, testing: 0.15, ci: 0.10, debugging: 0.10, general: 0.05 },
        preferredTools: ["file_read", "file_write", "terminal", "git", "code_search"],
      },
      team_globex_product: {
        agentTypeWeights: { coding: 0.30, review: 0.30, testing: 0.10, ci: 0.05, debugging: 0.05, general: 0.20 },
        preferredTools: ["web_search", "file_read", "code_search"],
        modelWeights: { models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "gpt-4o", "gpt-4o-mini"], weights: [0.5, 0.3, 0.15, 0.05] },
      },
      team_globex_devops: {
        agentTypeWeights: { coding: 0.20, review: 0.10, testing: 0.10, ci: 0.35, debugging: 0.15, general: 0.10 },
        preferredTools: ["docker", "terminal", "git", "database_query"],
      },
    },
  },
};

const DEFAULT_ORG_EVENT_PROFILE: OrgEventProfile = {
  baseDailyEvents: 200,
  successRate: DEFAULT_SUCCESS_RATE,
};

export function getOrgEventProfile(orgId: string): OrgEventProfile {
  return ORG_EVENT_PROFILES[orgId] ?? DEFAULT_ORG_EVENT_PROFILE;
}

export const ERROR_DISTRIBUTION: Record<ErrorCategory, number> = {
  timeout: 0.3,
  rate_limit: 0.15,
  context_overflow: 0.25,
  tool_error: 0.2,
  internal_error: 0.1,
};

const ERROR_CATEGORIES: ErrorCategory[] = Object.keys(
  ERROR_DISTRIBUTION,
) as ErrorCategory[];

const MODELS = ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "gpt-4o", "gpt-4o-mini"];
const MODEL_WEIGHTS = [0.4, 0.3, 0.2, 0.1];

const TOOLS = [
  "file_read",
  "file_write",
  "terminal",
  "web_search",
  "code_search",
  "linter",
  "test_runner",
  "git",
  "docker",
  "database_query",
];

// ── Event generation ranges ─────────────────────────────────────────────

const DURATION_MIN_MS = 5_000;
const DURATION_MAX_MS = 300_000;
const CI_DURATION_MIN_MS = 30_000;
const CI_DURATION_MAX_MS = 300_000;

const QUEUE_WAIT_MIN_MS = 100;
const QUEUE_WAIT_MAX_MS = 10_000;

const TOKENS_INPUT_MIN = 500;
const TOKENS_INPUT_MAX = 50_000;
const TOKENS_OUTPUT_MIN = 100;
const TOKENS_OUTPUT_MAX = 10_000;

const COST_PER_INPUT_TOKEN = 0.000003;
const COST_PER_OUTPUT_TOKEN = 0.000015;

const RATING_PROBABILITY = 0.15;
const POSITIVE_RATING_IF_SUCCEEDED = 0.8;
const POSITIVE_RATING_IF_FAILED = 0.3;

/**
 * Pick a random item from a weighted distribution.
 */
export function weightedRandom<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Generate a right-skewed random value between min and max.
 *
 * Uses a power-curve transformation: Math.random()^skew maps [0,1] → [0,1]
 * with values clustered toward 0 when skew > 1. This produces many small
 * values with a long tail — matching real-world telemetry distributions.
 *
 * A ~2% chance of "outlier" pushes the value to between 80-100% of the range,
 * simulating occasional extreme runs (very long duration, massive token counts).
 *
 * @param min   Lower bound (inclusive)
 * @param max   Upper bound (inclusive)
 * @param skew  Exponent controlling skew (higher = more skewed toward min)
 */
export function skewedRandom(min: number, max: number, skew: number): number {
  // ~2% chance of an outlier near the high end
  if (Math.random() < 0.02) {
    return min + (max - min) * (0.8 + Math.random() * 0.2);
  }
  const u = Math.random();
  const skewed = Math.pow(u, skew);
  return min + (max - min) * skewed;
}

/**
 * Pick a random agent type according to configured weights.
 * Accepts optional team-level weight overrides.
 */
export function pickAgentType(overrides?: Partial<Record<AgentType, number>>): AgentType {
  if (overrides) {
    // Fill in any missing agent types with 0 weight
    const types = AGENT_TYPES;
    const weights = types.map((t) => overrides[t] ?? 0);
    return weightedRandom(types, weights);
  }
  return weightedRandom(
    AGENT_TYPES,
    AGENT_TYPES.map((t) => AGENT_TYPE_WEIGHTS[t]),
  );
}

/**
 * Pick an error category for a failed run.
 */
export function pickErrorCategory(): ErrorCategory {
  return weightedRandom(
    ERROR_CATEGORIES,
    ERROR_CATEGORIES.map((c) => ERROR_DISTRIBUTION[c]),
  );
}

/**
 * Pick a model according to weights.
 * Accepts optional team-level overrides.
 */
function pickModel(overrides?: { models: string[]; weights: number[] }): string {
  if (overrides) {
    return weightedRandom(overrides.models, overrides.weights);
  }
  return weightedRandom(MODELS, MODEL_WEIGHTS);
}

/**
 * Pick a user rating for a completed run.
 *
 * Most runs go unrated (~85%). Of the rated ones, successful runs skew
 * positive (~80% thumbs-up) while failed runs skew negative (~70% thumbs-down).
 */
function pickUserRating(succeeded: boolean): UserRating | undefined {
  if (Math.random() > RATING_PROBABILITY) return undefined;

  const positiveChance = succeeded ? POSITIVE_RATING_IF_SUCCEEDED : POSITIVE_RATING_IF_FAILED;
  return Math.random() < positiveChance ? "positive" : "negative";
}

/**
 * Pick a random subset of tools used.
 *
 * When preferredTools are specified, picks from them ~70% of the time
 * and from the full tool list ~30%, producing a team-specific fingerprint
 * while still allowing any tool to appear occasionally.
 */
function pickTools(preferredTools?: string[]): string[] {
  const count = 1 + Math.floor(Math.random() * 4); // 1-4 tools
  if (preferredTools && preferredTools.length > 0) {
    const selected: string[] = [];
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.7) {
        // Pick from preferred tools
        selected.push(preferredTools[Math.floor(Math.random() * preferredTools.length)]);
      } else {
        // Pick from all tools
        selected.push(TOOLS[Math.floor(Math.random() * TOOLS.length)]);
      }
    }
    // Deduplicate while preserving count
    return [...new Set(selected)];
  }
  const shuffled = [...TOOLS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Pick a random user, weighted by team size.
 */
function pickUser(
  users: UserRecord[],
  teamWeights: Map<string, number>,
): UserRecord {
  // First pick a team weighted by size
  const teamIds = [...teamWeights.keys()];
  const weights = teamIds.map((t) => teamWeights.get(t)!);
  const teamId = weightedRandom(teamIds, weights);

  // Then pick a random user from that team
  const teamUsers = users.filter((u) => u.team_id === teamId);
  return teamUsers[Math.floor(Math.random() * teamUsers.length)];
}

/**
 * Pick a random project from the user's org.
 */
function pickProject(projects: ProjectRecord[]): ProjectRecord {
  return projects[Math.floor(Math.random() * projects.length)];
}

export interface EventGeneratorContext {
  org: OrgDefinition;
  users: UserRecord[];
  projects: ProjectRecord[];
  teamWeights: Map<string, number>;
}

export function createEventGeneratorContext(
  org: OrgDefinition,
  users: UserRecord[],
  projects: ProjectRecord[],
): EventGeneratorContext {
  const teamWeights = new Map<string, number>();
  for (const team of org.teams) {
    teamWeights.set(team.id, team.size);
  }
  return { org, users, projects, teamWeights };
}

/**
 * Generate a complete agent run (start + completed/failed events) at a given timestamp.
 * Returns 2 events: a run_started and either run_completed or run_failed.
 *
 * Uses team-specific profiles (agent type weights, model weights, preferred tools)
 * when available, falling back to global defaults.
 * Numeric metrics use skewed distributions for realistic long-tail behavior.
 */
export function generateRunEvents(
  ctx: EventGeneratorContext,
  timestamp: Date,
): AgentEvent[] {
  const runId = randomUUID();
  const user = pickUser(ctx.users, ctx.teamWeights);
  const project = pickProject(ctx.projects);
  const profile = getOrgEventProfile(ctx.org.id);

  // Resolve team-specific overrides
  const teamProfile = profile.teamProfiles?.[user.team_id];

  const agentType = pickAgentType(teamProfile?.agentTypeWeights);
  const model = pickModel(teamProfile?.modelWeights);
  const succeeded = Math.random() < profile.successRate;

  // Duration: skewed toward shorter runs (skew=2.5 → median ~30s)
  // CI runs have a higher minimum floor
  const baseDuration =
    agentType === "ci"
      ? skewedRandom(CI_DURATION_MIN_MS, CI_DURATION_MAX_MS, 2.0)
      : skewedRandom(DURATION_MIN_MS, DURATION_MAX_MS, 2.5);
  const durationMs = Math.round(baseDuration);

  // Queue wait: skewed toward fast queue times (skew=3 → median ~500ms)
  const queueWaitMs = Math.round(skewedRandom(QUEUE_WAIT_MIN_MS, QUEUE_WAIT_MAX_MS, 3));

  // Tokens: skewed toward smaller counts (skew=2.5 → median ~3k input, ~500 output)
  const tokensInput = Math.round(skewedRandom(TOKENS_INPUT_MIN, TOKENS_INPUT_MAX, 2.5));
  const tokensOutput = Math.round(skewedRandom(TOKENS_OUTPUT_MIN, TOKENS_OUTPUT_MAX, 2.5));

  // Cost: rough approximation based on tokens
  const costUsd =
    Math.round(
      (tokensInput * COST_PER_INPUT_TOKEN + tokensOutput * COST_PER_OUTPUT_TOKEN) * 100,
    ) / 100;

  const tools = pickTools(teamProfile?.preferredTools);

  const startEvent: AgentEvent = {
    run_id: runId,
    org_id: ctx.org.id,
    team_id: user.team_id,
    user_id: user.user_id,
    project_id: project.project_id,
    agent_type: agentType,
    event_type: "run_started",
    timestamp: timestamp.toISOString(),
    queue_wait_ms: queueWaitMs,
  };

  const completedAt = new Date(timestamp.getTime() + durationMs);

  const userRating = pickUserRating(succeeded);

  const endEvent: AgentEvent = {
    run_id: runId,
    org_id: ctx.org.id,
    team_id: user.team_id,
    user_id: user.user_id,
    project_id: project.project_id,
    agent_type: agentType,
    event_type: succeeded ? "run_completed" : "run_failed",
    timestamp: completedAt.toISOString(),
    duration_ms: durationMs,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    model,
    cost_usd: costUsd,
    tools_used: tools,
    queue_wait_ms: queueWaitMs,
    ...(succeeded ? {} : { error_category: pickErrorCategory() }),
    ...(userRating ? { user_rating: userRating } : {}),
  };

  return [startEvent, endEvent];
}
