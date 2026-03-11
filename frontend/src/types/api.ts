// Shared enum types
export type Period = "7d" | "30d" | "90d";
export type AgentType =
  | "coding"
  | "review"
  | "testing"
  | "ci"
  | "debugging"
  | "general";
export type UserRole = "admin" | "team_lead" | "viewer";

// Filter parameters shared across metric endpoints
export interface MetricFilters {
  period?: Period;
  teams?: string[];
  projects?: string[];
  agent_types?: AgentType[];
  group_by?: "team" | "project" | "agent_type";
}

// --- Usage ---

export interface AdoptionRate {
  value: number;
  licensed_users: number;
  active_users: number;
}

export interface ActiveUsersTrendPoint {
  date: string;
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
