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

export type UserRating = "positive" | "negative";

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

export const DEFAULT_SUCCESS_RATE = 0.87;

/**
 * Per-org event generation characteristics.
 * Orgs not listed here use defaults.
 */
export interface OrgEventProfile {
  baseDailyEvents: number;
  successRate: number;
}

export const ORG_EVENT_PROFILES: Record<string, OrgEventProfile> = {
  org_acme: { baseDailyEvents: 200, successRate: 0.87 },
  org_globex: { baseDailyEvents: 120, successRate: 0.90 },
};

export const DEFAULT_ORG_EVENT_PROFILE: OrgEventProfile = {
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
 * Pick a random agent type according to configured weights.
 */
export function pickAgentType(): AgentType {
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
 */
function pickModel(): string {
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
 */
function pickTools(): string[] {
  const count = 1 + Math.floor(Math.random() * 4); // 1-4 tools
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
 */
export function generateRunEvents(
  ctx: EventGeneratorContext,
  timestamp: Date,
): AgentEvent[] {
  const runId = randomUUID();
  const user = pickUser(ctx.users, ctx.teamWeights);
  const project = pickProject(ctx.projects);
  const agentType = pickAgentType();
  const model = pickModel();
  const profile = getOrgEventProfile(ctx.org.id);
  const succeeded = Math.random() < profile.successRate;

  // Duration: 5s-5min for most, 30s-5min for CI
  const baseDuration =
    agentType === "ci"
      ? CI_DURATION_MIN_MS + Math.random() * (CI_DURATION_MAX_MS - CI_DURATION_MIN_MS)
      : DURATION_MIN_MS + Math.random() * (DURATION_MAX_MS - DURATION_MIN_MS);
  const durationMs = Math.round(baseDuration);

  // Queue wait
  const queueWaitMs = Math.round(QUEUE_WAIT_MIN_MS + Math.random() * (QUEUE_WAIT_MAX_MS - QUEUE_WAIT_MIN_MS));

  // Tokens
  const tokensInput = Math.round(TOKENS_INPUT_MIN + Math.random() * (TOKENS_INPUT_MAX - TOKENS_INPUT_MIN));
  const tokensOutput = Math.round(TOKENS_OUTPUT_MIN + Math.random() * (TOKENS_OUTPUT_MAX - TOKENS_OUTPUT_MIN));

  // Cost: rough approximation based on tokens
  const costUsd =
    Math.round(
      (tokensInput * COST_PER_INPUT_TOKEN + tokensOutput * COST_PER_OUTPUT_TOKEN) * 100,
    ) / 100;

  const tools = pickTools();

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
