// Shared types
export interface DateRange {
  start: string; // ISO 8601 timestamp
  end: string; // ISO 8601 timestamp
}

export type Granularity = "minute" | "hour" | "day" | "week";

export type AgentType =
  | "coding"
  | "review"
  | "testing"
  | "ci"
  | "debugging"
  | "general";
export type ErrorCategory =
  | "timeout"
  | "rate_limit"
  | "context_overflow"
  | "tool_error"
  | "internal_error";
export type UserRole = "admin" | "team_lead" | "viewer";

// Filter parameters shared across metric endpoints
export interface MetricFilters {
  start?: string;
  end?: string;
  teams?: string[];
  projects?: string[];
  agent_types?: AgentType[];
  group_by?: "team" | "project" | "agent_type";
}

// --- Overview ---

export interface KpiCard {
  value: number;
  change_pct: number | null;
  period: string;
}

export interface KpiCards {
  total_runs: KpiCard;
  active_users: KpiCard;
  total_cost: KpiCard;
  success_rate: KpiCard;
}

export interface TimeSeriesPoint {
  timestamp: string;
  runs: number;
  cost: number;
  is_partial?: boolean;
}

export interface TeamBreakdown {
  team_id: string;
  team_name: string;
  runs: number;
  active_users: number;
  cost: number;
  success_rate: number;
}

export interface OverviewResponse {
  kpi_cards: KpiCards;
  usage_trend: TimeSeriesPoint[];
  team_breakdown: TeamBreakdown[];
}

// --- Usage ---

export interface AdoptionRate {
  value: number;
  licensed_users: number;
  active_users: number;
}

export interface ActiveUsersTrendPoint {
  timestamp: string;
  dau: number;
  wau: number;
  mau: number;
  is_partial?: boolean;
}

export interface AgentTypeBreakdown {
  agent_type: string;
  runs: number;
  percentage: number;
}

export interface TopUser {
  user_id: string;
  name: string;
  avatar_url: string | null;
  team_name: string;
  runs: number;
  last_active: string | null;
}

export interface ProjectBreakdown {
  project_id: string;
  project_name: string;
  runs: number;
  active_users: number;
  cost: number;
}

export interface UsageResponse {
  adoption_rate: AdoptionRate;
  active_users_trend: ActiveUsersTrendPoint[];
  agent_type_breakdown: AgentTypeBreakdown[];
  top_users: TopUser[];
  project_breakdown: ProjectBreakdown[];
}

// --- Cost ---

export interface CostTrendPoint {
  timestamp: string;
  cost: number;
  is_partial?: boolean;
}

export interface CostBreakdownItem {
  dimension_value: string;
  cost: number;
  runs: number;
  cost_per_run: number;
}

export interface CostPerRunTrendPoint {
  timestamp: string;
  avg_cost_per_run: number;
  is_partial?: boolean;
}

export interface TokenBreakdownByModel {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export interface TokenBreakdown {
  input_tokens: number;
  output_tokens: number;
  by_model: TokenBreakdownByModel[];
}

export interface Budget {
  monthly_budget: number | null;
  current_spend: number;
  projected_spend: number;
  utilization_pct: number | null;
}

export interface CostResponse {
  cost_trend: CostTrendPoint[];
  cost_breakdown: CostBreakdownItem[];
  cost_per_run_trend: CostPerRunTrendPoint[];
  token_breakdown: TokenBreakdown;
  budget: Budget;
}

// --- Performance ---

export interface SuccessRateTrendPoint {
  timestamp: string;
  success_rate: number;
  failure_rate: number;
  error_rate: number;
  is_partial?: boolean;
}

export interface LatencyTrendPoint {
  timestamp: string;
  p50: number;
  p95: number;
  p99: number;
  is_partial?: boolean;
}

export interface ErrorBreakdownItem {
  error_category: string;
  count: number;
  percentage: number;
}

export interface QueueWaitTrendPoint {
  timestamp: string;
  avg_wait_ms: number;
  p95_wait_ms: number;
  is_partial?: boolean;
}

export interface Availability {
  uptime_pct: number;
  period: string;
}

export interface PerformanceResponse {
  success_rate_trend: SuccessRateTrendPoint[];
  latency_trend: LatencyTrendPoint[];
  error_breakdown: ErrorBreakdownItem[];
  availability: Availability;
  queue_wait_trend: QueueWaitTrendPoint[];
}

// --- Org ---

export interface TeamInfo {
  team_id: string;
  name: string;
  slug: string;
}

export interface ProjectInfo {
  project_id: string;
  name: string;
  repository_url: string | null;
  team_id: string;
}

export interface OrgResponse {
  org_id: string;
  name: string;
  plan: string;
  monthly_budget: number | null;
  licensed_users: number;
  teams: TeamInfo[];
  projects: ProjectInfo[];
}

// --- Health ---

export interface HealthResponse {
  status: "ok" | "degraded";
  dependencies: {
    clickhouse: string;
    postgres: string;
    redis: string;
  };
}
