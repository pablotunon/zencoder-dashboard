# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

If you are blocked and need user clarification, mark the current step with `[!]` in plan.md before stopping.

---

## Workflow Steps

### [x] Step: Technical Specification
<!-- chat-id: 8e25b6b3-93a3-444e-8510-b52f5f40e7ca -->

Assess the task's difficulty, as underestimating it leads to poor outcomes.
- easy: Straightforward implementation, trivial bug fix or feature
- medium: Moderate complexity, some edge cases or caveats to consider
- hard: Complex logic, many caveats, architectural considerations, or high-risk changes

Create a technical specification for the task that is appropriate for the complexity level:
- Review the existing codebase architecture and identify reusable components.
- Define the implementation approach based on established patterns in the project.
- Identify all source code files that will be created or modified.
- Define any necessary data model, API, or interface changes.
- Describe verification steps using the project's test and lint commands.

Save the output to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach
- Source code structure changes
- Data model / API / interface changes
- Verification approach

If the task is complex enough, create a detailed implementation plan based on `{@artifacts_path}/spec.md`:
- Break down the work into concrete tasks (incrementable, testable milestones)
- Each task should reference relevant contracts and include verification steps
- Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function).

Important: unit tests must be part of each implementation task, not separate tasks. Each task should implement the code and its tests together, if relevant.

Save to `{@artifacts_path}/plan.md`. If the feature is trivial and doesn't warrant this breakdown, keep the Implementation step below as is.

---

### [x] Step: Phase 0 — Project Scaffolding
<!-- chat-id: 346315a1-edd0-477b-82d5-5e97ec217ea1 -->

Set up the monorepo structure, Docker Compose, database init scripts, and minimal Dockerfiles so that `docker compose up` brings up the full stack with empty databases.

Reference: `specs/04-step-by-step-plan.md` Phase 0, `specs/02-technical-implementation.md` sections 2.6 (PostgreSQL schema), 2.4 (ClickHouse tables), 3 (Docker Compose).

1. Create `.gitignore` with node_modules/, dist/, build/, target/, __pycache__/, .cache/, *.log, .env, and other generated artifacts.
2. Initialize monorepo directory structure: `frontend/`, `analytics-api/`, `ingestion/`, `aggregation-worker/`, `simulator/`, `nginx/`, `init-scripts/postgres/`, `init-scripts/clickhouse/`.
3. Write `init-scripts/postgres/001-schema.sql` with organizations, teams, users, projects tables (Phase A columns only; include password_hash as nullable for Phase B readiness).
4. Write `init-scripts/clickhouse/001-tables.sql` with agent_runs (MergeTree), daily_team_metrics, daily_agent_type_metrics, daily_project_metrics (ReplacingMergeTree).
5. Write `nginx/nginx.conf` with reverse proxy rules: `/api/*` → analytics-api:8000, `/ingest/*` → ingestion:8001, `/` → frontend static files.
6. Create minimal Dockerfiles for each application service (hello-world level — just proves the container builds and starts).
7. Write `docker-compose.yml` with all 9 services (nginx, frontend, analytics-api, ingestion, aggregation-worker, simulator, redis, postgres, clickhouse) with health checks, dependency ordering, and environment variables.
8. Write `.env.example` with all configuration variables documented.
9. Verify: `docker compose up --build` starts all infrastructure containers (redis, postgres, clickhouse) and they pass health checks. Application containers may fail at this stage (they're stubs).

**Milestone:** `docker compose up` brings up Redis, PostgreSQL (with schema), and ClickHouse (with tables). Infrastructure is ready for services.

---

### [x] Step: Phase 1 — Ingestion Service (Rust)
<!-- chat-id: 8f216001-67f7-4ed4-841a-385cb7f10127 -->

Build the Rust/Axum ingestion service that accepts event batches via HTTP and publishes them to Redis Streams.

Reference: `specs/02-technical-implementation.md` section 2.3, `specs/03-testing.md` section 3.3.

1. Scaffold Rust project (`ingestion/`) with Cargo.toml: axum, tokio, serde/serde_json, redis, uuid, chrono dependencies.
2. Define the `AgentEvent` struct with serde deserialization and validation attributes.
3. Implement validation logic: required fields, valid enum values (agent_type, event_type, error_category), timestamp range (not future > 5min), non-negative cost, batch size 1-100.
4. Implement `POST /ingest/events` endpoint: deserialize batch, validate each event, return `202 { accepted, rejected, errors }`.
5. Implement Redis Streams publisher: `XADD agent_events *` for each validated event as JSON.
6. Update real-time counters: `INCR rt:{org_id}:active_runs` on run_started, `DECR` on completed/failed; `INCR rt:{org_id}:today_runs`.
7. Implement `GET /ingest/health` with Redis connection check.
8. Write unit tests for validation (ING-U01 through ING-U08).
9. Write integration tests (ING-I01, ING-I02) — POST events, verify Redis Stream.
10. Create production Dockerfile (multi-stage: cargo build with release → distroless/cc runtime).
11. Update docker-compose.yml: ingestion service with Redis dependency and health check.
12. Verify: `docker compose up`, then `curl -X POST http://localhost/ingest/events` returns 202.

**Milestone:** Events can be POSTed and land in Redis Streams. `redis-cli XLEN agent_events` shows events after curl.

---

### [x] Step: Phase 2 — Event Simulator + Data Seeding
<!-- chat-id: 6b6c3157-eaab-4754-a45f-45944db579dc -->

Build the TypeScript simulator that seeds PostgreSQL with org structure and generates 90 days of historical events plus continuous live events.

Reference: `specs/02-technical-implementation.md` section 2.5, `specs/03-testing.md` section 3.5, `specs/01-requirements.md` NFR-3.

1. Scaffold TypeScript project (`simulator/`) with package.json: tsx, @faker-js/faker, pg (node-postgres) dependencies.
2. Implement `seed-data.ts`: Generate and INSERT into PostgreSQL: 1 org (Acme Corp, enterprise, $50k budget), 5 teams (Platform:15, Backend:12, Frontend:8, Data:10, Mobile:5), 50 users distributed by team size, 10 projects.
3. Implement `generators/org.ts`: Deterministic org/team/user/project generation (seeded faker).
4. Implement `generators/events.ts`: Generate AgentEvent objects with configured distributions (agent type weights: coding 40%, review 20%, testing 15%, ci 10%, debugging 10%, general 5%; base success rate 87%; error distribution: timeout 30%, rate_limit 15%, context_overflow 25%, tool_error 20%, internal_error 10%).
5. Implement `generators/patterns.ts`: Temporal patterns — weekday multiplier 1.0 vs weekend 0.3, peak hours 10am-4pm, team activity proportional to team size.
6. Implement `sender.ts`: HTTP client that POSTs event batches to the ingestion service with retry logic.
7. Implement `index.ts` entry point: seed PostgreSQL → generate 90 days historical backfill (large batches) → switch to live mode (1-5 events/sec).
8. Write unit tests (SIM-U01 through SIM-U06) using Vitest.
9. Create Dockerfile, update docker-compose.yml with dependencies on ingestion + postgres.
10. Verify: After `docker compose up`, Redis fills with 90 days of events. `redis-cli XLEN agent_events` shows thousands of entries.

**Milestone:** Simulator seeds PostgreSQL and generates 90 days of historical events + continuous live events into the ingestion pipeline.

---

### [x] Step: Phase 3 — Aggregation Worker
<!-- chat-id: 3e2d8027-9280-4df2-9ee3-36b5736fa32d -->

Build the Python worker that consumes events from Redis Streams, inserts raw data into ClickHouse, and computes daily rollups.

Reference: `specs/02-technical-implementation.md` section 2.4, `specs/03-testing.md` section 3.4.

1. Scaffold Python project (`aggregation-worker/`) with requirements.txt: redis[hiredis], clickhouse-connect, asyncpg.
2. Implement `consumer.py`: Redis Streams consumer using XREADGROUP (consumer group `aggregation_workers`, block 5s, count 100).
3. Implement `enrichment.py`: Lookup user→team and project→team mappings from PostgreSQL (cache in memory, refresh periodically).
4. Implement `writers/clickhouse.py`: Insert raw enriched events into ClickHouse `agent_runs` table.
5. Implement `writers/redis_cache.py`: Update real-time counters (active_runs_count, daily running totals).
6. Implement `aggregator.py`: Every 5 minutes, query ClickHouse raw events for the rollup window, compute daily aggregates (runs, costs, latency percentiles by team/project/agent_type), upsert into daily_team_metrics, daily_agent_type_metrics, daily_project_metrics.
7. Implement `main.py`: Entry point with consumer loop, periodic rollup trigger, graceful shutdown.
8. XACK messages after successful processing; skip ACK on failed writes for reprocessing.
9. Write unit tests (AGG-U01 through AGG-U06).
10. Write integration tests (AGG-I01 through AGG-I04).
11. Create Dockerfile, update docker-compose.yml.
12. Verify: After simulator backfills, `clickhouse-client -q "SELECT count() FROM daily_team_metrics"` returns data.

**Milestone:** ClickHouse contains 90 days of rollup data. Real-time counters are updated in Redis.

---

### [ ] Step: Phase 4 — Analytics API

Build the FastAPI BFF that serves pre-aggregated dashboard data from ClickHouse, PostgreSQL, and Redis.

Reference: `specs/02-technical-implementation.md` section 2.2, `specs/03-testing.md` section 3.2.

1. Scaffold FastAPI project (`analytics-api/`) with requirements.txt: fastapi, uvicorn, clickhouse-connect, asyncpg, redis[hiredis], pydantic, pydantic-settings.
2. Implement `config.py` with pydantic-settings for environment variables.
3. Implement `main.py` with lifespan for database connection setup/teardown.
4. Implement `auth/stub.py`: OrgContext with hardcoded org_id="org_acme", user_id="user_admin", role="admin".
5. Implement `auth/dependencies.py`: `get_org_context` FastAPI Depends that calls stub (Phase A).
6. Implement `models/requests.py`: MetricFilters query parameter model (period, teams, projects, agent_types, group_by).
7. Implement `models/responses.py`: All response schemas (OverviewResponse, UsageResponse, CostResponse, PerformanceResponse, OrgResponse).
8. Implement `services/clickhouse.py`, `services/postgres.py`, `services/redis_cache.py` with query/cache layers.
9. Implement `routers/health.py`: GET /api/health with dependency status checks.
10. Implement `routers/overview.py`: GET /api/metrics/overview — KPI cards (with period-over-period change), usage trend, team breakdown, active runs count from Redis.
11. Implement `routers/usage.py`: GET /api/metrics/usage — adoption rate, DAU/WAU/MAU trend, agent type breakdown, top users, project breakdown.
12. Implement `routers/cost.py`: GET /api/metrics/cost — cost trend, breakdown by dimension (team/project/agent_type), cost per run, token breakdown, budget tracking.
13. Implement `routers/performance.py`: GET /api/metrics/performance — success rate trend, latency percentiles, error breakdown, queue wait.
14. Implement GET /api/orgs/current — org + teams + projects from PostgreSQL.
15. Implement Redis caching with org-scoped keys: `metrics:{org_id}:{endpoint}:{hash(filters)}`, TTLs (30s overview, 5min others, 10min org).
16. Write ClickHouse SQL queries in `queries/` directory.
17. Write unit tests (API-U01 through API-U05).
18. Write integration tests (API-I01 through API-I07).
19. Create Dockerfile, update docker-compose.yml.
20. Update nginx.conf to proxy `/api/*` to analytics-api:8000.
21. Verify: `curl http://localhost/api/metrics/overview?period=30d` returns full, data-rich JSON.

**Milestone:** All metrics endpoints return real data from ClickHouse. Health check passes. nginx proxying works.

---

### [ ] Step: Phase 5 — Frontend Dashboard

Build the React SPA with Tremor charts, shadcn/ui shell, and TanStack Query data fetching for all 4 dashboard pages.

Reference: `specs/02-technical-implementation.md` section 2.1, `specs/01-requirements.md` FR-1 through FR-6, `specs/03-testing.md` section 3.1.

1. Scaffold Vite + React + TypeScript project (`frontend/`).
2. Install and configure: Tremor, shadcn/ui, TanStack Query, React Router, Tailwind CSS 4.
3. Define shared TypeScript types in `src/types/`: Period, AgentType, ErrorCategory, UserRole, AuthContext, KpiCard, TimeSeriesPoint, TeamMetric, and all API response types.
4. Implement `AuthProvider` stub: hardcoded user/org context via React Context.
5. Build app shell (layout):
   - Sidebar with navigation (Overview, Usage, Cost, Performance), org name/logo from AuthProvider.
   - Header with user profile area.
   - Global filter bar: date range selector (7d/30d/90d + custom), team multi-select, project multi-select, agent type filter.
6. Implement API client layer (`src/api/`): typed fetch functions for each endpoint, TanStack Query hooks (useOverviewMetrics, useUsageMetrics, useCostMetrics, usePerformanceMetrics, useOrg) with 30s stale time.
7. Implement filter state management: URL search params via React Router, synced with TanStack Query keys.
8. Build Overview page (FR-1): 4 KPI cards, usage trend area chart, team breakdown table (sortable), active runs indicator.
9. Build Usage & Adoption page (FR-2): adoption rate card, active users trend, agent type donut chart, top users table, project breakdown.
10. Build Cost & Efficiency page (FR-3): cost trend chart, cost breakdown (tabbed: by team/agent type/project), cost per run trend, token breakdown, budget progress bar.
11. Build Performance & Reliability page (FR-4): success/failure rate trend, latency percentiles chart, error breakdown donut, queue wait trend.
12. Add loading skeletons and error states for all data-fetching components.
13. Write unit tests for formatters/utilities (FE-U01 through FE-U08) using Vitest.
14. Write integration tests with MSW (FE-I01 through FE-I05).
15. Create multi-stage Dockerfile (node build → nginx serve), update docker-compose.yml.
16. Verify: Open http://localhost in browser → see fully populated, filterable, multi-page dashboard.

**Milestone:** Complete analytics dashboard accessible in browser with all 4 pages, charts, tables, filters, and real data.

---

### [ ] Step: Phase 6 — Polish & Integration Testing

End-to-end validation, error handling improvements, documentation, and performance checks.

Reference: `specs/03-testing.md` section 4, `specs/04-step-by-step-plan.md` Phase 6.

1. Write E2E smoke tests (E2E-01 through E2E-03): all containers healthy, POST events → aggregate → query, dashboard accessible.
2. Review and improve error handling across all services:
   - Frontend: error boundaries, retry logic in TanStack Query.
   - Analytics API: structured error responses with proper HTTP status codes.
   - Ingestion: graceful degradation when Redis is unavailable (503).
   - Worker: dead letter handling for unprocessable events.
3. Verify OpenAPI documentation is generated by FastAPI (review and annotate endpoint descriptions).
4. Write README.md: architecture overview (reference SVG diagram), quick start (`docker compose up`), per-service docs, tech stack rationale.
5. Ensure `.env.example` has all variables documented.
6. Verify clean startup: `docker compose down -v && docker compose up --build` works from scratch.
7. Performance check: dashboard pages load under 2 seconds with populated data.
8. Write completion report to `{@artifacts_path}/report.md`.

**Milestone:** Reviewer can clone the repo, run `docker compose up`, and see a working dashboard within 2 minutes. All E2E tests pass.

---

### [ ] Step: Phase 7 — Authentication & Authorization

Add JWT-based login, session management, role-based access control, and frontend auth flow.

Reference: `specs/01-requirements.md` FR-7, `specs/04-step-by-step-plan.md` Phase 7, `specs/03-testing.md` sections 7.1-7.2.

1. **Analytics API auth module:**
   - Implement `auth/jwt.py`: JWT token generation (login) and validation (middleware) using python-jose + bcrypt.
   - Implement `POST /api/auth/login`: validate email + bcrypt password_hash from PostgreSQL → return JWT + user profile.
   - Implement `POST /api/auth/logout`: invalidate session via Redis deny-list with TTL.
   - Implement `GET /api/auth/me`: return current user from JWT claims.
   - Update `get_org_context` to extract org_id/user_id from JWT instead of hardcoded values.
   - Add role-based guards: team_lead auto-applies team filter.
2. **Simulator auth data:**
   - Generate bcrypt password_hash for seeded users (demo password: `demo123`).
   - Seed at least 1 user per role (admin, team_lead, viewer).
3. **Frontend auth flow:**
   - Build `/login` page with email/password form.
   - Replace AuthProvider stub with real auth: JWT in memory, refresh via `/api/auth/me`.
   - Route guards: redirect unauthenticated users to `/login`.
   - 401 interceptor: auto-logout on token expiration.
   - User profile in sidebar with logout button.
4. Update nginx to proxy `/api/auth/*`.
5. Write tests: AUTH-U01–U05, AUTH-I01–I06, AUTH-FE01–FE05.

**Milestone:** Users log in with seeded credentials, see their name/role in sidebar, are redirected on session expiry.

---

### [ ] Step: Phase 8 — Multi-Tenancy

Add second organization, ingestion validation, and end-to-end tenant isolation.

Reference: `specs/01-requirements.md` FR-8, `specs/04-step-by-step-plan.md` Phase 8, `specs/03-testing.md` section 8.

1. **Simulator multi-org:**
   - Add Globex Corporation (business plan, $20k budget) with independent teams, users, projects.
   - Generate 90 days of independent events per org.
   - Seed API keys per org (hashed in api_keys table).
2. **Ingestion org validation:**
   - On startup, load valid org_ids from PostgreSQL → Redis set. Refresh every 5 minutes.
   - Reject events with unknown org_id.
3. **Analytics API isolation audit:**
   - Verify every ClickHouse/PostgreSQL query has org_id in WHERE clause.
   - Verify every Redis cache key includes org_id.
   - Add integration tests for cross-org access denial.
4. **Frontend org context:**
   - Org name/logo load from `/api/orgs/current` based on authenticated user.
5. Write tests: MT-I01–I05, MT-E2E01–E2E03.

**Milestone:** Login as Acme admin → Acme data only. Login as Globex admin → Globex data only. Zero cross-org leakage.

---

### [ ] Step: Phase 9 — Real-Time WebSocket Push (Stretch)

Add WebSocket endpoint for live dashboard updates, replacing polling for active runs.

Reference: `specs/01-requirements.md` FR-9, `specs/04-step-by-step-plan.md` Phase 9, `specs/03-testing.md` section 9.

1. **Analytics API WebSocket:**
   - Add `WS /api/ws/live` with JWT auth (query param or first message).
   - Subscribe to Redis Pub/Sub `ws:{org_id}:events`, broadcast to connected clients.
2. **Aggregation Worker Pub/Sub:**
   - After event batch, publish to `ws:{org_id}:events`: `{ type: "active_runs", count }` and `{ type: "event", event }`.
3. **Frontend WebSocket:**
   - Create `useWebSocket` hook: connect, auth, reconnect with exponential backoff.
   - Overview page: active_runs updates bypass TanStack Query.
   - Fallback: 3 retries → revert to polling (30s).
4. **nginx WebSocket proxying:**
   - Add `Upgrade` and `Connection` headers for `/api/ws/`.
5. Write tests: WS-I01–I05, WS-FE01–FE02.

**Milestone:** Dashboard active runs counter updates in real-time as simulator sends events. No page refresh needed.
