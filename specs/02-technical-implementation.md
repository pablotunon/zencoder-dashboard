# AgentHub Analytics — Technical Implementation Specification

## 1. System Architecture

### 1.1 Service Inventory

| Service | Language / Framework | Purpose | Port | Production Target |
|---|---|---|---|---|
| Dashboard SPA | TypeScript / React + Vite | Analytics UI | 5173 | S3 + CloudFront |
| Analytics API | Python / FastAPI | Read-path API (BFF) | 8000 | ECS Fargate + ALB |
| Ingestion Service | Rust / Axum | Event intake + validation | 8001 | ECS Fargate + NLB |
| Aggregation Worker | Python | Stream consumer + rollup writer | — (no HTTP) | ECS Fargate (worker) |
| Event Simulator | TypeScript / Node.js | Mock telemetry generator | — (no HTTP) | Not deployed |
| nginx | nginx | Static file serving + reverse proxy | 80 | CloudFront + API Gateway |

### 1.2 Infrastructure

| Component | Local (Docker) | Production |
|---|---|---|
| Event bus + cache | Redis 7 (Streams) | ElastiCache |
| Relational store | PostgreSQL 16 | RDS |
| Analytical store | ClickHouse 24 | ClickHouse Cloud |
| API routing / auth | nginx reverse proxy | AWS API Gateway |
| Static hosting | nginx | S3 + CloudFront |

### 1.3 Network Topology (Docker Compose)

```
External:
  Port 80 → nginx

Internal (docker network):
  nginx → frontend static files (build volume mount)
  nginx → /api/* → analytics-api:8000
  nginx → /ingest/* → ingestion:8001

  simulator → ingestion:8001
  ingestion → redis:6379
  worker → redis:6379
  worker → clickhouse:8123
  worker → postgres:5432
  analytics-api → clickhouse:8123
  analytics-api → postgres:5432
  analytics-api → redis:6379
```

## 2. Service Specifications

### 2.1 Dashboard SPA

**Stack:** React 19, Vite 6, TypeScript 5.5, Tremor (charts/KPIs), shadcn/ui (shell/layout), TanStack Query (data fetching), React Router (routing), Tailwind CSS 4.

**Project Structure:**
```
frontend/
├── src/
│   ├── api/            # API client functions + types
│   ├── components/
│   │   ├── ui/         # shadcn/ui primitives
│   │   ├── charts/     # Tremor-based chart wrappers
│   │   ├── layout/     # Sidebar, Header, FilterBar
│   │   └── cards/      # KPI card components
│   ├── hooks/          # Custom hooks (useMetrics, useFilters, etc.)
│   ├── pages/          # Route pages (Overview, Usage, Cost, Performance)
│   ├── lib/            # Utilities, constants, formatters
│   ├── types/          # Shared TypeScript interfaces
│   └── App.tsx
├── Dockerfile          # Multi-stage: node build → nginx serve
└── vite.config.ts
```

**Key Design Decisions:**
- TanStack Query for all API calls with 30s stale time (simulates near-real-time polling).
- Filter state stored in URL search params via React Router, making views shareable/bookmarkable.
- All API types defined in `src/types/` and shared with the analytics API via OpenAPI codegen (stretch goal) or manual sync.

**Pages and Routes:**
```
/                    → Overview (redirect to /overview; Phase B: redirect to /login if unauthenticated)
/login               → Phase B: Login page
/overview            → Dashboard Overview
/usage               → Usage & Adoption
/cost                → Cost & Efficiency
/performance         → Performance & Reliability
```

**Auth-Readiness (Phase A):**
The frontend includes an `AuthProvider` context from day one. In Phase A, it provides a hardcoded user/org. In Phase B, it wraps real session management. All route components read org context from this provider, never from hardcoded values.

```typescript
// Phase A: src/auth/AuthProvider.tsx
const STUB_CONTEXT: AuthContext = {
  user: { id: "user_admin", name: "Admin User", role: "admin" },
  org: { id: "org_acme", name: "Acme Corp" },
  isAuthenticated: true,
};
```

### 2.2 Analytics API (BFF)

**Stack:** Python 3.12, FastAPI, uvicorn, clickhouse-connect, asyncpg, redis[hiredis], pydantic v2.

**Project Structure:**
```
analytics-api/
├── app/
│   ├── main.py              # FastAPI app, middleware, lifespan
│   ├── config.py             # Settings via pydantic-settings
│   ├── auth/
│   │   ├── middleware.py     # Auth middleware: extracts org context from request
│   │   ├── dependencies.py   # FastAPI Depends: get_current_user, get_org_context
│   │   ├── stub.py           # Phase A: hardcoded org context for development
│   │   └── jwt.py            # Phase B: JWT validation + session lookup
│   ├── routers/
│   │   ├── overview.py       # GET /api/metrics/overview
│   │   ├── usage.py          # GET /api/metrics/usage
│   │   ├── cost.py           # GET /api/metrics/cost
│   │   ├── performance.py    # GET /api/metrics/performance
│   │   ├── auth.py           # Phase B: POST /api/auth/login, /logout, /me
│   │   └── health.py         # GET /api/health
│   ├── services/
│   │   ├── clickhouse.py     # ClickHouse query layer
│   │   ├── postgres.py       # PostgreSQL query layer (org/team data)
│   │   └── redis_cache.py    # Redis caching layer
│   ├── models/
│   │   ├── requests.py       # Query parameter models (filters)
│   │   ├── responses.py      # Response schemas (BFF-shaped payloads)
│   │   └── auth.py           # OrgContext, UserSession, Role
│   └── queries/              # Raw SQL / ClickHouse queries
│       ├── overview.sql
│       ├── usage.sql
│       ├── cost.sql
│       └── performance.sql
├── Dockerfile
└── requirements.txt
```

**Org Context Pattern (critical for multi-tenancy readiness):**

Every route handler receives an `OrgContext` via FastAPI dependency injection. This context is the single place where tenant scoping is enforced. In Phase A, it returns a hardcoded org; in Phase B, it extracts it from the authenticated session.

```python
# Phase A (stub) — app/auth/stub.py
class OrgContext(BaseModel):
    org_id: str
    user_id: str
    role: Literal["admin", "team_lead", "viewer"]

async def get_org_context() -> OrgContext:
    """Stub: returns hardcoded org context. Replaced by JWT auth in Phase B."""
    return OrgContext(org_id="org_acme", user_id="user_admin", role="admin")

# Usage in every route handler:
@router.get("/api/metrics/overview")
async def get_overview(
    filters: MetricFilters = Depends(),
    ctx: OrgContext = Depends(get_org_context),   # <-- tenant scoping
):
    # All queries use ctx.org_id — never hardcoded
    return await overview_service.get(ctx.org_id, filters)
```

**API Endpoints:**

All `/api/metrics/*` and `/api/orgs/*` endpoints require an `OrgContext` (stub in Phase A, authenticated in Phase B). The `org_id` is never passed as a query parameter — it comes from the auth context.

```
GET /api/health
  → { status: "ok", dependencies: { clickhouse, postgres, redis } }

# --- Auth (Phase B) ---
POST /api/auth/login    { email, password } → { token, user, org }
POST /api/auth/logout   → 204
GET  /api/auth/me        → { user_id, name, email, role, org_id }

# --- Metrics (all scoped to ctx.org_id) ---
GET /api/metrics/overview?period=7d&teams=platform,backend&projects=&agent_types=
  → {
      kpi_cards: {
        total_runs: { value, change_pct, period },
        active_users: { value, change_pct, period },
        total_cost: { value, change_pct, period },
        success_rate: { value, change_pct, period }
      },
      usage_trend: [{ date, runs, cost }],
      team_breakdown: [{ team_id, team_name, runs, active_users, cost, success_rate }],
      active_runs_count: number
    }

GET /api/metrics/usage?period=30d&teams=&projects=&agent_types=
  → {
      adoption_rate: { value, licensed_users, active_users },
      active_users_trend: [{ date, dau, wau, mau }],
      agent_type_breakdown: [{ agent_type, runs, percentage }],
      top_users: [{ user_id, name, avatar_url, team_name, runs, last_active }],
      project_breakdown: [{ project_id, project_name, runs, active_users, cost }]
    }

GET /api/metrics/cost?period=30d&teams=&projects=&agent_types=&group_by=team
  → {
      cost_trend: [{ date, cost }],
      cost_breakdown: [{ dimension_value, cost, runs, cost_per_run }],
      cost_per_run_trend: [{ date, avg_cost_per_run }],
      token_breakdown: { input_tokens, output_tokens, by_model: [...] },
      budget: { monthly_budget, current_spend, projected_spend, utilization_pct }
    }

GET /api/metrics/performance?period=30d&teams=&projects=&agent_types=
  → {
      success_rate_trend: [{ date, success_rate, failure_rate, error_rate }],
      latency_trend: [{ date, p50, p95, p99 }],
      error_breakdown: [{ error_category, count, percentage }],
      availability: { uptime_pct, period },
      queue_wait_trend: [{ date, avg_wait_ms, p95_wait_ms }]
    }

GET /api/orgs/current
  → { org_id, name, plan, teams: [...], projects: [...] }

# --- WebSocket (Phase D) ---
WS /api/ws/live
  Auth: token passed as query param or first message
  Server pushes: { type: "active_runs", count: N }
                 { type: "event", event: AgentEventSummary }
```

**Query Parameter Model (shared across endpoints):**
```python
class MetricFilters(BaseModel):
    period: Literal["7d", "30d", "90d"] = "30d"
    teams: list[str] | None = None          # team slugs
    projects: list[str] | None = None       # project IDs
    agent_types: list[AgentType] | None = None
    group_by: Literal["team", "project", "agent_type"] | None = None
```

**Caching Strategy:**
- Redis cache with TTL-based invalidation.
- Overview endpoint: 30s TTL (supports polling).
- Usage/Cost/Performance endpoints: 5min TTL (data is hourly-aggregated anyway).
- Org structure (teams, projects, users): 10min TTL.
- Cache key format: `metrics:{org_id}:{endpoint}:{hash(filters)}` — org_id is always the first dimension to ensure tenant isolation and enable per-org cache invalidation.

### 2.3 Ingestion Service

**Stack:** Rust (stable), Axum, tokio, serde/serde_json, redis (crate), uuid, chrono.

**Project Structure:**
```
ingestion/
├── src/
│   ├── main.rs           # Axum server setup
│   ├── config.rs         # Environment configuration
│   ├── routes/
│   │   ├── mod.rs
│   │   ├── events.rs     # POST /ingest/events
│   │   └── health.rs     # GET /ingest/health
│   ├── models/
│   │   ├── mod.rs
│   │   └── event.rs      # AgentEvent struct + validation
│   ├── validation.rs     # Schema validation logic
│   └── publisher.rs      # Redis Streams publisher
├── Cargo.toml
└── Dockerfile            # Multi-stage: builder → runtime (distroless)
```

**API Endpoints:**
```
POST /ingest/events
  Content-Type: application/json
  Header: X-Org-Id: <org_id>         (Phase A: trusted header; Phase C: validated against API key)
  Header: X-Api-Key: <key>           (Phase C: authenticates the org)
  Body: { events: [AgentEvent, ...] }  (batch of 1-100 events)
  → 202 Accepted { accepted: N, rejected: M, errors: [...] }

GET /ingest/health
  → 200 { status: "ok", redis_connected: true }
```

**Org Validation:**
- Phase A: The `org_id` field in each event is accepted as-is (trusted, since only the simulator sends events).
- Phase C: The ingestion service validates `org_id` against a cached set of registered organizations (loaded from PostgreSQL into Redis on startup, refreshed periodically). Events with unknown `org_id` are rejected with a specific error.

**Event Schema (validated by the service):**
```rust
struct AgentEvent {
    run_id: Uuid,
    org_id: String,
    team_id: String,
    user_id: String,
    project_id: String,
    agent_type: AgentType,         // enum: coding, review, testing, ci, debugging, general
    event_type: EventType,         // enum: run_started, run_completed, run_failed
    timestamp: DateTime<Utc>,
    duration_ms: Option<u64>,      // present on completed/failed
    tokens_input: Option<u64>,
    tokens_output: Option<u64>,
    model: Option<String>,
    cost_usd: Option<f64>,
    error_category: Option<ErrorCategory>,
    tools_used: Option<Vec<String>>,
    queue_wait_ms: Option<u64>,
}
```

**Redis Streams Publishing:**
- Stream key: `agent_events` (single stream; events carry `org_id` as a field for filtering downstream).
- Each validated event is published as a JSON blob via `XADD`.
- Consumer group: `aggregation_workers` (allows multiple worker instances).
- Backpressure: if Redis is unavailable, return 503 and the simulator retries with exponential backoff.
- Real-time counters use org-scoped keys: `rt:{org_id}:active_runs`, `rt:{org_id}:today_runs`.

### 2.4 Aggregation Worker

**Stack:** Python 3.12, redis[hiredis], clickhouse-connect, asyncpg.

**Project Structure:**
```
aggregation-worker/
├── app/
│   ├── main.py              # Entry point, consumer loop
│   ├── config.py            # Environment configuration
│   ├── consumer.py          # Redis Streams consumer
│   ├── enrichment.py        # Enrich events with org/team data from PostgreSQL
│   ├── aggregator.py        # Compute rollups
│   └── writers/
│       ├── clickhouse.py    # Write raw events + rollups to ClickHouse
│       └── redis_cache.py   # Update real-time counters in Redis
├── Dockerfile
└── requirements.txt
```

**Processing Pipeline:**
1. Consume batch of events from Redis Streams (`XREADGROUP`, block 5s, count 100).
2. Insert raw enriched events into ClickHouse `agent_runs` table.
3. Update real-time counters in Redis (active runs count, today's running totals).
4. Every 5 minutes, trigger a rollup computation:
   - Query ClickHouse for the last hour's raw events.
   - Compute aggregated metrics (runs, costs, latency percentiles by team/project/agent_type).
   - Upsert into ClickHouse materialized view tables.
5. Acknowledge processed messages via `XACK`.

**ClickHouse Tables:**
```sql
-- Raw events (append-only, ordered by timestamp)
CREATE TABLE agent_runs (
    run_id UUID,
    org_id String,
    team_id String,
    user_id String,
    project_id String,
    agent_type LowCardinality(String),
    status LowCardinality(String),
    started_at DateTime64(3),
    completed_at Nullable(DateTime64(3)),
    duration_ms UInt64,
    tokens_input UInt64,
    tokens_output UInt64,
    model LowCardinality(String),
    cost_usd Float64,
    error_category Nullable(LowCardinality(String)),
    queue_wait_ms UInt64
) ENGINE = MergeTree()
ORDER BY (org_id, started_at, team_id)
PARTITION BY toYYYYMM(started_at);

-- Daily rollups by team
CREATE TABLE daily_team_metrics (
    date Date,
    org_id String,
    team_id String,
    total_runs UInt64,
    successful_runs UInt64,
    failed_runs UInt64,
    active_users UInt64,
    total_cost Float64,
    total_tokens_input UInt64,
    total_tokens_output UInt64,
    avg_duration_ms Float64,
    p50_duration_ms Float64,
    p95_duration_ms Float64,
    p99_duration_ms Float64,
    avg_queue_wait_ms Float64
) ENGINE = ReplacingMergeTree()
ORDER BY (org_id, date, team_id);

-- Daily rollups by agent type
CREATE TABLE daily_agent_type_metrics (
    date Date,
    org_id String,
    agent_type LowCardinality(String),
    total_runs UInt64,
    successful_runs UInt64,
    total_cost Float64
) ENGINE = ReplacingMergeTree()
ORDER BY (org_id, date, agent_type);

-- Daily rollups by project
CREATE TABLE daily_project_metrics (
    date Date,
    org_id String,
    project_id String,
    total_runs UInt64,
    active_users UInt64,
    total_cost Float64
) ENGINE = ReplacingMergeTree()
ORDER BY (org_id, date, project_id);
```

### 2.5 Event Simulator

**Stack:** TypeScript, Node.js, tsx, @faker-js/faker.

**Project Structure:**
```
simulator/
├── src/
│   ├── index.ts           # Entry point, main loop
│   ├── config.ts          # Environment configuration
│   ├── generators/
│   │   ├── org.ts         # Generate org structure (teams, users, projects)
│   │   ├── events.ts      # Generate agent run events
│   │   └── patterns.ts    # Temporal patterns (weekday/weekend, peak hours)
│   ├── sender.ts          # HTTP client to POST to ingestion service
│   └── seed-data.ts       # Seed PostgreSQL with org/team/user/project data
├── Dockerfile
├── package.json
└── tsconfig.json
```

**Behavior:**
1. On startup, seed PostgreSQL with organization structure. Phase A: 1 org (Acme Corp) with 5 teams, 50 users, 10 projects. Phase C: 2 orgs with independent structures.
2. Generate 90 days of historical events and send in bulk to the ingestion service. This populates the dashboard with meaningful historical data.
3. After backfill, switch to "live mode": generate 1-5 events per second with realistic patterns (more on weekdays, fewer on weekends; peak hours; team size proportional to activity).

**Data Generation Parameters:**
```typescript
// Phase A: single org. Phase C: ORGS becomes an array.
const ORGS = [
  {
    id: "org_acme",
    name: "Acme Corp",
    plan: "enterprise",
    monthly_budget: 50000,
    teams: [
      { id: "platform", name: "Platform", size: 15 },
      { id: "backend", name: "Backend", size: 12 },
      { id: "frontend", name: "Frontend", size: 8 },
      { id: "data", name: "Data Engineering", size: 10 },
      { id: "mobile", name: "Mobile", size: 5 },
    ],
  },
  // Phase C adds:
  // {
  //   id: "org_globex",
  //   name: "Globex Corporation",
  //   plan: "business",
  //   monthly_budget: 20000,
  //   teams: [...]
  // }
];

const AGENT_TYPE_WEIGHTS = {
  coding: 0.40,
  review: 0.20,
  testing: 0.15,
  ci: 0.10,
  debugging: 0.10,
  general: 0.05,
};

const SUCCESS_RATE = 0.87;  // Base success rate
const ERROR_DISTRIBUTION = {
  timeout: 0.30,
  rate_limit: 0.15,
  context_overflow: 0.25,
  tool_error: 0.20,
  internal_error: 0.10,
};
```

### 2.6 PostgreSQL Schema

```sql
CREATE TABLE organizations (
    org_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(32) NOT NULL DEFAULT 'enterprise',
    monthly_budget DECIMAL(10, 2),
    logo_url VARCHAR(512),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE teams (
    team_id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (org_id, slug)  -- slugs unique within an org, not globally
);

CREATE TABLE users (
    user_id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    team_id VARCHAR(64) REFERENCES teams(team_id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(512),
    role VARCHAR(32) NOT NULL DEFAULT 'viewer',  -- admin | team_lead | viewer
    is_active BOOLEAN DEFAULT TRUE,
    password_hash VARCHAR(255),  -- Phase B: bcrypt hash; NULL in Phase A
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (org_id, email)  -- emails unique within an org
);

CREATE TABLE projects (
    project_id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    team_id VARCHAR(64) REFERENCES teams(team_id),
    name VARCHAR(255) NOT NULL,
    repository_url VARCHAR(512),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Phase B: Session management
CREATE TABLE sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(user_id),
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Phase C: API keys for ingestion authentication
CREATE TABLE api_keys (
    key_id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_api_keys_org ON api_keys(org_id);
```

## 3. Docker Compose

```yaml
# Simplified structure — full file to be generated during implementation
services:
  nginx:
    ports: ["80:80"]
    depends_on: [frontend, analytics-api, ingestion]

  frontend:
    build: ./frontend
    # Builds static assets; nginx serves them

  analytics-api:
    build: ./analytics-api
    environment:
      - CLICKHOUSE_HOST=clickhouse
      - POSTGRES_HOST=postgres
      - REDIS_HOST=redis
    depends_on: [clickhouse, postgres, redis]

  ingestion:
    build: ./ingestion
    environment:
      - REDIS_HOST=redis
    depends_on: [redis]

  aggregation-worker:
    build: ./aggregation-worker
    environment:
      - CLICKHOUSE_HOST=clickhouse
      - POSTGRES_HOST=postgres
      - REDIS_HOST=redis
    depends_on: [clickhouse, postgres, redis]

  simulator:
    build: ./simulator
    environment:
      - INGESTION_URL=http://ingestion:8001
      - POSTGRES_HOST=postgres
    depends_on: [ingestion, postgres]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agenthub
      POSTGRES_USER: agenthub
      POSTGRES_PASSWORD: agenthub_dev
    volumes:
      - ./init-scripts/postgres:/docker-entrypoint-initdb.d
    ports: ["5432:5432"]

  clickhouse:
    image: clickhouse/clickhouse-server:24
    ports: ["8123:8123"]
    volumes:
      - ./init-scripts/clickhouse:/docker-entrypoint-initdb.d
```

## 4. Shared Types / API Contract

The API contract is the source of truth. The response schemas are defined in the Analytics API (Pydantic models) and mirrored in the frontend (TypeScript interfaces). During development, we maintain them manually. As a stretch goal, we generate the TypeScript types from the FastAPI OpenAPI spec.

**Key shared types:**

```typescript
// Period and filter types
type Period = "7d" | "30d" | "90d";
type AgentType = "coding" | "review" | "testing" | "ci" | "debugging" | "general";
type ErrorCategory = "timeout" | "rate_limit" | "context_overflow" | "tool_error" | "internal_error";
type UserRole = "admin" | "team_lead" | "viewer";

// Auth context (Phase A: stubbed; Phase B: from JWT)
interface AuthUser {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
}

interface AuthOrg {
  org_id: string;
  name: string;
  plan: string;
}

interface AuthContext {
  user: AuthUser;
  org: AuthOrg;
  isAuthenticated: boolean;
}

// KPI Card shape
interface KpiCard {
  value: number;
  change_pct: number;
  period: Period;
}

// Time series data point
interface TimeSeriesPoint {
  date: string;  // ISO date
  [key: string]: number | string;
}

// Team breakdown row
interface TeamMetric {
  team_id: string;
  team_name: string;
  runs: number;
  active_users: number;
  cost: number;
  success_rate: number;
}

// WebSocket message types (Phase D)
type WsMessage =
  | { type: "active_runs"; count: number }
  | { type: "event"; event: { run_id: string; agent_type: AgentType; status: string; team_name: string; timestamp: string } };
```
