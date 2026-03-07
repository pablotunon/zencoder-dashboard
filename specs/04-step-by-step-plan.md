# AgentHub Analytics — Step-by-Step Implementation Plan

## Guiding Principle

Build bottom-up along the data flow: infrastructure → ingestion → processing → API → frontend. Each phase ends with a testable milestone. We never write UI code until there's real data to display.

---

## Phase 0: Project Scaffolding
**Goal:** Repository structure, Docker Compose skeleton, all containers boot (even if empty).

### Steps:
1. Initialize monorepo structure:
   ```
   agenthub-analytics/
   ├── frontend/
   ├── analytics-api/
   ├── ingestion/
   ├── aggregation-worker/
   ├── simulator/
   ├── nginx/
   ├── init-scripts/
   │   ├── postgres/
   │   └── clickhouse/
   ├── docker-compose.yml
   ├── .env.example
   └── README.md
   ```

2. Create Docker Compose file with all infrastructure services (Redis, PostgreSQL, ClickHouse) and health checks.

3. Write PostgreSQL init script (`init-scripts/postgres/001-schema.sql`) with org/team/user/project tables.

4. Write ClickHouse init scripts (`init-scripts/clickhouse/001-tables.sql`) with agent_runs and rollup tables.

5. Create minimal Dockerfiles for each application service (hello-world level — just proves the container builds and starts).

6. Verify: `docker compose up` starts all containers, all health checks pass.

**Milestone:** `docker compose up` brings up the full stack with empty databases.

---

## Phase 1: Ingestion Service (Rust)
**Goal:** Events can be POSTed and land in Redis Streams.

### Steps:
1. Scaffold Rust project with Axum, serde, redis crate.
2. Define the `AgentEvent` struct with serde deserialization and validation.
3. Implement `POST /ingest/events` endpoint:
   - Deserialize JSON batch
   - Validate each event (required fields, enum values, timestamp range)
   - Return accepted/rejected counts
4. Implement Redis Streams publisher (`XADD agent_events *`).
5. Implement `GET /ingest/health` endpoint.
6. Write unit tests for validation logic (ING-U01 through ING-U08).
7. Write integration test: POST events → verify Redis Stream length (ING-I01, ING-I02).
8. Create production Dockerfile (multi-stage: cargo build → distroless runtime).
9. Update Docker Compose, verify ingestion container starts and connects to Redis.

**Milestone:** `curl -X POST http://localhost/ingest/events -d '{...}'` returns 202, events visible in Redis via `redis-cli XLEN agent_events`.

---

## Phase 2: Event Simulator + Data Seeding
**Goal:** Realistic data flowing into the system continuously.

### Steps:
1. Scaffold TypeScript project with Faker.js.
2. Implement `seed-data.ts`: generate org structure and INSERT into PostgreSQL.
   - 1 org, 5 teams, 50 users (distributed across teams), 10 projects.
3. Implement `generators/events.ts`: generate `AgentEvent` objects with realistic distributions.
   - Agent type weights, success/failure rates, cost ranges, duration distributions.
4. Implement `generators/patterns.ts`: temporal patterns.
   - Weekday multiplier (1.0) vs weekend (0.3).
   - Peak hours (10am-4pm) vs off-hours.
   - Per-team activity proportional to team size.
5. Implement `sender.ts`: HTTP client that POSTs event batches to the ingestion service.
6. Implement historical backfill mode: generate 90 days of events, send in large batches.
7. Implement live mode: after backfill, generate 1-5 events/second.
8. Write unit tests for generators (SIM-U01 through SIM-U06).
9. Create Dockerfile, update Docker Compose with dependency on ingestion + postgres.

**Milestone:** After `docker compose up`, Redis Streams fills with 90 days of historical events + live events.

---

## Phase 3: Aggregation Worker
**Goal:** Raw events processed into rollups in ClickHouse.

### Steps:
1. Scaffold Python project.
2. Implement Redis Streams consumer (`XREADGROUP`).
3. Implement raw event insertion into ClickHouse `agent_runs` table.
4. Implement real-time counter updates in Redis (active_runs_count, daily running totals).
5. Implement rollup computation:
   - Query raw events from ClickHouse for the rollup window.
   - Compute daily_team_metrics, daily_agent_type_metrics, daily_project_metrics.
   - Upsert into ClickHouse rollup tables.
6. Implement enrichment: resolve user_id → team_id, project_id → team_id from PostgreSQL.
7. Write unit tests for aggregation logic (AGG-U01 through AGG-U06).
8. Write integration tests (AGG-I01 through AGG-I04).
9. Create Dockerfile, update Docker Compose.

**Milestone:** After simulator backfills, ClickHouse contains 90 days of rollup data. Verifiable via `clickhouse-client -q "SELECT count() FROM daily_team_metrics"`.

---

## Phase 4: Analytics API
**Goal:** Dashboard-ready API endpoints serving pre-aggregated data.

### Steps:
1. Scaffold FastAPI project with clickhouse-connect, asyncpg, redis.
2. Implement configuration and database connection management (lifespan).
3. Implement the `OrgContext` dependency with stub auth (`auth/stub.py`): returns hardcoded org_id. All route handlers receive this dependency — no hardcoded org references anywhere else.
4. Implement `/api/health` endpoint with dependency checks.
5. Implement shared filter parsing (MetricFilters model).
6. Implement `/api/orgs/current` — query PostgreSQL for org + teams + projects, filtered by `ctx.org_id`.
7. Implement `/api/metrics/overview`:
   - KPI cards: query ClickHouse rollups for totals + period-over-period change.
   - Usage trend: query daily rollups ordered by date.
   - Team breakdown: query rollups grouped by team, joined with team names from PostgreSQL.
   - Active runs count: read from Redis real-time counter (`rt:{org_id}:active_runs`).
8. Implement `/api/metrics/usage`:
   - Adoption rate: active users from ClickHouse / total users from PostgreSQL.
   - DAU/WAU/MAU trend, agent type breakdown, top users, project breakdown.
9. Implement `/api/metrics/cost`:
   - Cost trend, breakdown by configurable dimension, token breakdown, budget tracking.
10. Implement `/api/metrics/performance`:
   - Success rate trend, latency percentiles, error breakdown, queue wait trend.
11. Implement Redis caching layer with org-scoped keys: `metrics:{org_id}:{endpoint}:{hash(filters)}`.
12. Write unit tests (API-U01 through API-U05).
13. Write integration tests (API-I01 through API-I07).
14. Create Dockerfile, update Docker Compose.
15. Configure nginx to proxy `/api/*` to analytics-api.

**Milestone:** `curl http://localhost/api/metrics/overview?period=30d` returns a full, data-rich JSON response.

---

## Phase 5: Frontend Dashboard
**Goal:** Fully functional analytics dashboard rendered in the browser.

### Steps:
1. Scaffold Vite + React + TypeScript project.
2. Install and configure Tremor, shadcn/ui, TanStack Query, React Router, Tailwind CSS.
3. Implement the `AuthProvider` stub: provides hardcoded user/org context via React Context. All components read org info from this provider (never hardcoded elsewhere). This stub is replaced with real auth in Phase 7.
4. Build the app shell:
   - Sidebar with navigation links (Overview, Usage, Cost, Performance).
   - Header with org name (read from AuthProvider, not hardcoded).
   - User profile area in sidebar (name, avatar placeholder — wired to AuthProvider).
   - Global filter bar (date range, team, project, agent type).
5. Implement the API client layer (`src/api/`):
   - Typed fetch functions for each endpoint.
   - TanStack Query hooks (`useOverviewMetrics`, `useUsageMetrics`, etc.).
   - API client reads auth token from AuthProvider (in Phase A, sends no token; in Phase 7, sends JWT).
6. Build the Overview page:
   - 4 KPI cards (total runs, active users, total cost, success rate).
   - Usage trend area chart.
   - Team breakdown table.
   - Active runs indicator.
7. Build the Usage & Adoption page:
   - Adoption rate card.
   - Active users trend chart.
   - Agent type donut chart.
   - Top users table.
   - Project breakdown bar chart.
8. Build the Cost & Efficiency page:
   - Cost trend chart.
   - Cost breakdown (by team / by agent type / by project — tabbed).
   - Cost per run trend.
   - Token breakdown.
   - Budget progress bar.
9. Build the Performance & Reliability page:
   - Success/failure rate trend.
   - Latency percentiles chart.
   - Error category breakdown donut.
   - Queue wait time trend.
10. Implement filter state management (URL search params ↔ TanStack Query keys).
11. Add loading skeletons and error states.
12. Write unit tests for formatters and utilities (FE-U01 through FE-U08).
13. Write integration tests with MSW (FE-I01 through FE-I05).
14. Create Dockerfile (multi-stage: node build → nginx serve), update Docker Compose.

**Milestone:** Open http://localhost in browser → see a fully populated, filterable, multi-page analytics dashboard.

---

## Phase 6: Polish & Integration Testing
**Goal:** Production-ready quality, documentation, E2E validation.

### Steps:
1. Write E2E smoke tests (E2E-01 through E2E-03).
2. Add proper error handling across all services:
   - Frontend: error boundaries, retry logic.
   - API: structured error responses.
   - Ingestion: graceful degradation.
   - Worker: dead letter handling.
3. Add OpenAPI documentation to the Analytics API (FastAPI generates this automatically, but review and annotate).
4. Write README.md with:
   - Architecture overview (embed the SVG diagram).
   - Quick start instructions (`docker compose up`).
   - Per-service documentation.
   - Technology choices and rationale.
5. Add `.env.example` with all configuration variables documented.
6. Verify clean startup from scratch: `docker compose down -v && docker compose up --build`.
7. Performance check: ensure dashboard pages load under 2 seconds.
8. Screenshot the dashboard for the README.

**Milestone:** A reviewer can clone the repo, run `docker compose up`, and see a working dashboard within 2 minutes.

---

## Phase 7: Authentication & Authorization (Phase B)
**Goal:** Users log in, sessions are managed, routes are protected, roles control visibility.

### Steps:
1. **Analytics API — Auth module:**
   - Replace `auth/stub.py` with `auth/jwt.py`: JWT token generation (login) and validation (middleware).
   - Implement `POST /api/auth/login`: validate email + bcrypt password_hash from PostgreSQL, return JWT + user profile.
   - Implement `POST /api/auth/logout`: invalidate session (add session_id to a Redis deny-list with TTL matching token expiry).
   - Implement `GET /api/auth/me`: return current user from token claims.
   - Update `get_org_context` dependency to extract `org_id` and `user_id` from JWT claims instead of returning hardcoded values.
   - Add role-based guards: `team_lead` role auto-applies a team filter to queries (can be overridden by admin).

2. **Simulator — Seed auth data:**
   - Generate `password_hash` for seeded users (use a known demo password like `demo123`).
   - Seed at least one user per role: admin, team_lead, viewer.

3. **Frontend — Auth flow:**
   - Implement login page (`/login`) with email/password form.
   - Replace `AuthProvider` stub with real auth state: store JWT in memory (not localStorage), refresh on page load via `/api/auth/me`.
   - Add route guards: redirect to `/login` if unauthenticated.
   - Add 401 interceptor to the API client: auto-logout on token expiration.
   - Display user profile (name, avatar, role) in sidebar with logout button.

4. **nginx — Update config:**
   - Ensure `/api/auth/*` routes are proxied to the Analytics API.
   - No auth check at the nginx level (auth is handled by the API).

5. Write tests: AUTH-U01 through AUTH-I06, AUTH-FE01 through AUTH-FE05.

**Milestone:** Users log in with seeded credentials, see their name in the sidebar, and are redirected to login if their session expires.

---

## Phase 8: Multi-Tenancy (Phase C)
**Goal:** Complete tenant isolation; two orgs with independent data, zero cross-org leakage.

### Steps:
1. **Simulator — Multi-org seeding:**
   - Add a second organization (e.g., "Globex Corporation") with its own teams, users, and projects.
   - Generate 90 days of independent event history for each org (different volumes, patterns, success rates).
   - Seed API keys for each org (stored hashed in the `api_keys` table).

2. **Ingestion Service — Org validation:**
   - On startup, load the set of valid `org_id` values from PostgreSQL into a Redis set (`valid_orgs`). Refresh every 5 minutes.
   - Validate `org_id` on each event against this set. Reject events with unknown org.
   - (Stretch) Validate `X-Api-Key` header against the `api_keys` table for the given org.

3. **Analytics API — Audit tenant isolation:**
   - Review every ClickHouse and PostgreSQL query to confirm `org_id` is always in the WHERE clause.
   - Review Redis cache keys to confirm `org_id` is always part of the key.
   - Add integration tests that attempt cross-org access and verify 403 or empty results.

4. **Frontend — Org context:**
   - Org name and logo load dynamically from `/api/orgs/current` based on the authenticated user's org.
   - (Stretch) If a user belongs to multiple orgs, add an org switcher in the sidebar.

5. Write tests: MT-I01 through MT-I05, MT-E2E01 through MT-E2E03.

**Milestone:** Log in as Acme admin → see Acme data. Log in as Globex admin → see Globex data. Neither can see the other's metrics.

---

## Phase 9: Real-Time WebSocket Push (Phase D — Nice to Have)
**Goal:** The Overview page updates live without polling for active runs and new events.

### Steps:
1. **Analytics API — WebSocket endpoint:**
   - Add `WS /api/ws/live` using FastAPI's WebSocket support.
   - Authenticate the connection: require JWT as a query param (`?token=...`) or in the first message. Extract `org_id`.
   - Subscribe to a Redis Pub/Sub channel scoped to the org: `ws:{org_id}:events`.
   - Broadcast incoming messages to all connected WebSocket clients for that org.

2. **Aggregation Worker — Publish to Pub/Sub:**
   - After processing each event batch, publish a summary to `ws:{org_id}:events`:
     - `{ type: "active_runs", count: N }` — updated count.
     - `{ type: "event", event: { run_id, agent_type, status, team_name, timestamp } }` — last few events.

3. **Frontend — WebSocket integration:**
   - Create a `useWebSocket` hook that connects to `/api/ws/live`, handles auth, reconnection (exponential backoff), and message parsing.
   - On the Overview page, wire the `active_runs` message to the active runs KPI card, bypassing TanStack Query for that single metric.
   - (Stretch) Add a live event feed component below the KPI cards: shows the last 10 events as they arrive.
   - Implement fallback: if WebSocket fails to connect after 3 retries, revert to TanStack Query polling (30s interval).

4. **nginx — WebSocket proxying:**
   - Add `proxy_set_header Upgrade`, `proxy_set_header Connection "upgrade"` for the `/api/ws/` location.

5. Write tests: WS-I01 through WS-I05, WS-FE01 through WS-FE02.

**Milestone:** Open the dashboard, see the active runs counter tick up in real-time as the simulator sends events, with no page refresh.

---

## Phase Summary

| Phase | Deliverable | Estimated Effort |
|-------|-------------|-----------------|
| 0 — Scaffolding | Repo structure, Docker Compose, DB schemas | ~2 hours |
| 1 — Ingestion | Rust service accepting events → Redis | ~4 hours |
| 2 — Simulator | Data generation + seeding | ~3 hours |
| 3 — Worker | Stream processing → ClickHouse rollups | ~4 hours |
| 4 — Analytics API | BFF endpoints serving dashboard data | ~5 hours |
| 5 — Frontend | Full React dashboard | ~8 hours |
| 6 — Polish | E2E tests, docs, error handling | ~3 hours |
| 7 — Auth | Login, JWT, roles, route protection | ~5 hours |
| 8 — Multi-Tenancy | 2 orgs, tenant isolation, org validation | ~4 hours |
| 9 — WebSocket | Real-time push for live metrics | ~4 hours |
| **Total** | | **~42 hours** |

---

## Dependency Graph

```
Phase 0 (Scaffolding)
  └── Phase 1 (Ingestion)
       └── Phase 2 (Simulator)
            └── Phase 3 (Worker)
                 └── Phase 4 (Analytics API)
                      └── Phase 5 (Frontend)
                           └── Phase 6 (Polish)
                                ├── Phase 7 (Auth)
                                │    └── Phase 8 (Multi-Tenancy)
                                └── Phase 9 (WebSocket)
```

Phases 0–6 are the core deliverable: a fully functional dashboard with realistic data. Phases 7–8 add production-grade auth and isolation. Phase 9 is an additive enhancement that can be done independently of Phase 8.

Each phase can be demoed independently. After Phase 4, the entire backend is functional and testable via curl. Phase 5 adds the visual layer. Phase 6 makes it presentable. Phases 7–9 elevate it to production-grade.
