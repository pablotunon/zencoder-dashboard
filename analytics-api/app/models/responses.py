from pydantic import BaseModel


# --- Shared ---


class KpiCard(BaseModel):
    value: float
    change_pct: float | None = None
    period: str


class TimeSeriesPoint(BaseModel):
    date: str
    runs: int = 0
    cost: float = 0.0


# --- Overview ---


class KpiCards(BaseModel):
    total_runs: KpiCard
    active_users: KpiCard
    total_cost: KpiCard
    success_rate: KpiCard


class TeamBreakdown(BaseModel):
    team_id: str
    team_name: str
    runs: int
    active_users: int
    cost: float
    success_rate: float


class OverviewResponse(BaseModel):
    kpi_cards: KpiCards
    usage_trend: list[TimeSeriesPoint]
    team_breakdown: list[TeamBreakdown]
    active_runs_count: int


# --- Usage ---


class AdoptionRate(BaseModel):
    value: float
    licensed_users: int
    active_users: int


class ActiveUsersTrendPoint(BaseModel):
    date: str
    dau: int = 0
    wau: int = 0
    mau: int = 0


class AgentTypeBreakdown(BaseModel):
    agent_type: str
    runs: int
    percentage: float


class TopUser(BaseModel):
    user_id: str
    name: str
    avatar_url: str | None = None
    team_name: str
    runs: int
    last_active: str | None = None


class ProjectBreakdown(BaseModel):
    project_id: str
    project_name: str
    runs: int
    active_users: int
    cost: float


class UsageResponse(BaseModel):
    adoption_rate: AdoptionRate
    active_users_trend: list[ActiveUsersTrendPoint]
    agent_type_breakdown: list[AgentTypeBreakdown]
    top_users: list[TopUser]
    project_breakdown: list[ProjectBreakdown]


# --- Cost ---


class CostTrendPoint(BaseModel):
    date: str
    cost: float


class CostBreakdownItem(BaseModel):
    dimension_value: str
    cost: float
    runs: int
    cost_per_run: float


class CostPerRunTrendPoint(BaseModel):
    date: str
    avg_cost_per_run: float


class TokenBreakdownByModel(BaseModel):
    model: str
    input_tokens: int
    output_tokens: int


class TokenBreakdown(BaseModel):
    input_tokens: int
    output_tokens: int
    by_model: list[TokenBreakdownByModel]


class Budget(BaseModel):
    monthly_budget: float | None
    current_spend: float
    projected_spend: float
    utilization_pct: float | None


class CostResponse(BaseModel):
    cost_trend: list[CostTrendPoint]
    cost_breakdown: list[CostBreakdownItem]
    cost_per_run_trend: list[CostPerRunTrendPoint]
    token_breakdown: TokenBreakdown
    budget: Budget


# --- Performance ---


class SuccessRateTrendPoint(BaseModel):
    date: str
    success_rate: float
    failure_rate: float
    error_rate: float


class LatencyTrendPoint(BaseModel):
    date: str
    p50: float
    p95: float
    p99: float


class ErrorBreakdownItem(BaseModel):
    error_category: str
    count: int
    percentage: float


class QueueWaitTrendPoint(BaseModel):
    date: str
    avg_wait_ms: float
    p95_wait_ms: float


class Availability(BaseModel):
    uptime_pct: float
    period: str


class PerformanceResponse(BaseModel):
    success_rate_trend: list[SuccessRateTrendPoint]
    latency_trend: list[LatencyTrendPoint]
    error_breakdown: list[ErrorBreakdownItem]
    availability: Availability
    queue_wait_trend: list[QueueWaitTrendPoint]


# --- Org ---


class TeamInfo(BaseModel):
    team_id: str
    name: str
    slug: str


class ProjectInfo(BaseModel):
    project_id: str
    name: str
    repository_url: str | None = None
    team_id: str


class OrgResponse(BaseModel):
    org_id: str
    name: str
    plan: str
    monthly_budget: float | None = None
    teams: list[TeamInfo]
    projects: list[ProjectInfo]
