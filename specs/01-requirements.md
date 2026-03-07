# AgentHub Analytics — Requirements Specification

## 1. Product Overview

AgentHub Analytics is a customer-facing, organizational-level analytics dashboard for a cloud platform that allows engineering teams to run AI agents (coding agents, CI agents, review agents, etc.) in the cloud. The dashboard provides engineering leadership with visibility into how their organization uses these agents, what it costs, and whether agents are delivering value.

## 2. Target Users

### Primary Persona: Engineering Manager / Director of Engineering
- Needs to justify the platform investment to leadership
- Wants to understand adoption across teams
- Needs cost visibility and budget tracking
- Asks: "Are the agents helping? How much are we spending? Which teams use them most?"

### Secondary Persona: Platform Engineer / DevOps Lead
- Responsible for the organization's agent infrastructure
- Monitors reliability, error rates, and performance
- Asks: "Are there reliability issues? What's the error rate trend? Are agents queue-starved?"

### Tertiary Persona: Team Lead
- Wants a team-scoped view of agent usage
- Compares their team's adoption to the organization average
- Asks: "How does my team's usage compare? What agent types are we using most?"

## 3. Functional Requirements

### FR-1: Dashboard Overview Page
The default landing page displays a high-level summary of the organization's agent usage for a selectable time period.

**FR-1.1** Display KPI summary cards:
- Total agent runs (current period)
- Active users (DAU/WAU/MAU)
- Total cost (current period, with % change from prior period)
- Success rate (% of runs completed successfully)

**FR-1.2** Display a usage trend chart (area/line chart) showing daily agent runs over the selected period, with the ability to overlay cost on a secondary axis.

**FR-1.3** Display a team breakdown table showing per-team metrics: runs, active users, cost, success rate, sorted by any column.

**FR-1.4** Display an activity feed or "live" indicator showing the count of currently active agent runs. Initially via polling (Phase A); upgraded to WebSocket push in Phase D.

### FR-2: Usage & Adoption Page
A deep-dive into how the organization is adopting agents.

**FR-2.1** Adoption rate metric: percentage of licensed users who have run at least one agent in the selected period.

**FR-2.2** Daily/weekly active users trend chart.

**FR-2.3** Breakdown by agent type (coding, review, testing, CI, debugging, general) as a donut or bar chart.

**FR-2.4** Top users table: ranked list of most active users with run count, last active timestamp.

**FR-2.5** Breakdown by project: which repositories/projects are using agents most.

### FR-3: Cost & Efficiency Page
Visibility into spending and cost efficiency.

**FR-3.1** Cost over time chart (daily/weekly granularity) with team/project filtering.

**FR-3.2** Cost breakdown by dimension: by team, by agent type, by project (selectable via tabs or toggle).

**FR-3.3** Cost per agent run trend (average cost per run over time).

**FR-3.4** Token consumption breakdown: input tokens vs. output tokens, by model.

**FR-3.5** Budget tracking: display budget vs. actual spend with a progress bar and projected end-of-period spend.

### FR-4: Performance & Reliability Page
Operational health of agent runs.

**FR-4.1** Success/failure/error rate trend chart over time.

**FR-4.2** Latency percentiles: p50, p95, p99 run duration over time.

**FR-4.3** Error breakdown by error category (timeout, rate_limit, context_overflow, tool_error, internal_error).

**FR-4.4** Agent availability metric (uptime percentage for the platform).

**FR-4.5** Queue wait time trend (time between run request and run start).

### FR-5: Global Filtering & Controls

**FR-5.1** Date range selector: preset ranges (7d, 30d, 90d) and custom range picker.

**FR-5.2** Team filter: multi-select dropdown to filter all views by one or more teams.

**FR-5.3** Project filter: multi-select dropdown to filter by project/repository.

**FR-5.4** Agent type filter: filter by agent type (coding, review, testing, CI, debugging, general).

**FR-5.5** All filters apply globally across all pages and persist during navigation.

### FR-6: Navigation & Layout

**FR-6.1** Sidebar navigation with links to: Overview, Usage & Adoption, Cost & Efficiency, Performance & Reliability.

**FR-6.2** Organization name and logo displayed in the sidebar header.

**FR-6.3** Global filter bar displayed below the top navigation, above page content.

**FR-6.4** Responsive layout that works on desktop (primary) and tablet (secondary). Mobile is not a requirement.

### FR-7: Authentication & Authorization (Phase B)

**FR-7.1** Login page with email/password authentication.

**FR-7.2** Session management: JWT or session-cookie based, with configurable expiration.

**FR-7.3** Role-based access control with at least three roles:
- **Org Admin**: full access to all dashboard pages, all teams, all data.
- **Team Lead**: access to all pages, but data scoped to their team(s) by default (can view org-wide if permitted).
- **Viewer**: read-only access to the dashboard with org-wide data.

**FR-7.4** Unauthenticated requests to any `/api/*` endpoint return 401. Unauthorized access to restricted data returns 403.

**FR-7.5** The frontend redirects unauthenticated users to the login page and stores the intended destination for post-login redirect.

**FR-7.6** User profile display in the sidebar (name, avatar, role) with a logout action.

### FR-8: Multi-Tenancy (Phase C)

**FR-8.1** Complete tenant isolation: an authenticated user can only access data belonging to their organization. No API endpoint, query, or cache key can leak data across organizations.

**FR-8.2** The Ingestion Service validates that `org_id` in incoming events corresponds to a registered organization.

**FR-8.3** All ClickHouse queries, PostgreSQL queries, and Redis cache keys include `org_id` as a mandatory filter/prefix.

**FR-8.4** The Event Simulator can seed multiple organizations (at least 2) with independent data to demonstrate tenant isolation.

**FR-8.5** An org-switching UI or login flow allows a demo user to switch between organizations and see different data.

### FR-9: Real-Time WebSocket Push (Phase D — Nice to Have)

**FR-9.1** A WebSocket endpoint provides live updates for metrics that benefit from real-time data:
- Active agent runs count (updates on every run start/complete).
- Live event feed (last N events as they're ingested).

**FR-9.2** The frontend subscribes to the WebSocket on the Overview page and updates the active runs indicator and optional live feed without polling.

**FR-9.3** WebSocket connections are authenticated and scoped to the user's organization.

**FR-9.4** The system gracefully degrades: if the WebSocket connection fails, the frontend falls back to polling (TanStack Query refetch interval).

**FR-9.5** The WebSocket server reads from Redis Pub/Sub (or Redis Streams) to receive events to broadcast.

## 4. Non-Functional Requirements

### NFR-1: Architecture
- The system must consist of independently deployable services orchestrated via Docker Compose locally.
- Each service must have its own Dockerfile and be runnable as a standalone container.
- The architecture must map cleanly to production cloud deployment (ECS, managed databases, CDN).

### NFR-2: Performance
- Dashboard pages must load in under 2 seconds with cached data.
- The Analytics API must respond within 500ms for standard queries (pre-aggregated data).
- The Ingestion Service must handle at least 1,000 events/second sustained throughput.

### NFR-3: Data
- The system must use realistic mock data that demonstrates all dashboard features.
- Mock data must cover at least: 5 teams, 50 users, 10 projects, 90 days of history.
- Data must include realistic distributions (weekday/weekend patterns, team size variations, error rate fluctuations).

### NFR-4: Developer Experience
- `docker compose up` must start the entire system from a clean state.
- Database schemas must be applied automatically on startup (migrations or init scripts).
- The event simulator must begin generating data automatically, populating the dashboard within 60 seconds.

### NFR-5: Code Quality
- All services must include Dockerfiles following multi-stage build best practices.
- API endpoints must be documented (OpenAPI for REST services).
- Environment configuration must use `.env` files with documented defaults.

## 5. Phased Feature Delivery

### Phase A (Core — built first)
The initial implementation delivers the full dashboard with mock data, polling-based updates, and a single demo organization. Authentication is stubbed (a middleware that injects a hardcoded org context), but the data model and API contracts are tenant-aware from day one so that multi-tenancy, auth, and WebSocket can be added without refactoring.

### Phase B (Authentication & Authorization)
See FR-7 below. Adds login/logout, session management, and role-based access control.

### Phase C (Multi-Tenancy)
See FR-8 below. Enforces tenant isolation end-to-end: ingestion rejects events for unknown orgs, queries are always scoped to the authenticated org, and the simulator seeds multiple orgs.

### Phase D (Real-Time WebSocket Push)
See FR-9 below. Adds a WebSocket endpoint for live dashboard updates (active runs, new events) as an upgrade over polling.

### Out of Scope (not planned)
- Data export / CSV download
- Email alerts or notifications
- Agent run detail view / trace explorer (this is an analytics dashboard, not a debugging tool)

## 6. Data Model Summary

Note: `org_id` is a mandatory dimension on every entity and every query. Even in Phase A (single demo org), all data is scoped by `org_id` so that multi-tenancy (Phase C) requires no schema changes.

### Organization
```
org_id, name, plan, monthly_budget, logo_url
```

### Team
```
team_id, org_id, name, slug
```

### User
```
user_id, org_id, team_id, name, email, avatar_url, role (admin|team_lead|viewer), is_active, password_hash (Phase B)
```

### Project
```
project_id, org_id, team_id, name, repository_url
```

### Session (Phase B)
```
session_id, user_id, org_id, created_at, expires_at
```

### Agent Run (raw event — ingested, stored in ClickHouse)
```
run_id, org_id, team_id, user_id, project_id,
agent_type (coding|review|testing|ci|debugging|general),
status (running|completed|failed|timeout),
started_at, completed_at, duration_ms,
tokens_input, tokens_output, model,
cost_usd, error_category (nullable),
tools_used (array of tool names)
```

### Aggregated Metrics (materialized views in ClickHouse)
All rollup tables include `org_id` as the first key in the ORDER BY / partition.
```
-- Daily rollups by team
date, org_id, team_id, total_runs, successful_runs, failed_runs,
active_users, total_cost, total_tokens_input, total_tokens_output,
avg_duration_ms, p50_duration_ms, p95_duration_ms, p99_duration_ms,
avg_queue_wait_ms

-- Daily rollups by agent type
date, org_id, agent_type, total_runs, successful_runs, total_cost

-- Daily rollups by project
date, org_id, project_id, total_runs, active_users, total_cost
```
