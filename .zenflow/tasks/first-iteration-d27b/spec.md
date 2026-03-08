# AgentHub Analytics — Technical Specification

## Difficulty Assessment: **HARD**

Multi-service full-stack system spanning 3 programming languages (TypeScript, Python, Rust), 3 infrastructure stores (Redis, PostgreSQL, ClickHouse), complex event-driven data pipelines, and 9 implementation phases. Architectural decisions are already documented in detail — the challenge is execution across the breadth of technologies and ensuring correct data flow end-to-end.

---

## 1. Technical Context

### Languages & Frameworks
| Service | Language | Framework | Key Dependencies |
|---------|----------|-----------|-----------------|
| Dashboard SPA | TypeScript | React 19 + Vite 6 | Tremor, shadcn/ui, TanStack Query, React Router, Tailwind CSS 4 |
| Analytics API | Python 3.12 | FastAPI | clickhouse-connect, asyncpg, redis[hiredis], pydantic v2 |
| Ingestion Service | Rust (stable) | Axum | tokio, serde, redis crate, uuid, chrono |
| Aggregation Worker | Python 3.12 | — (standalone) | redis[hiredis], clickhouse-connect, asyncpg |
| Event Simulator | TypeScript | Node.js + tsx | @faker-js/faker |
| Reverse Proxy | — | nginx | — |

### Infrastructure
| Component | Image | Purpose | Port |
|-----------|-------|---------|------|
| Redis 7 | redis:7-alpine | Event bus (Streams), caching, real-time counters | 6379 |
| PostgreSQL 16 | postgres:16-alpine | Org/team/user/project metadata | 5432 |
| ClickHouse 24 | clickhouse/clickhouse-server:24 | Time-series analytics, aggregated rollups | 8123 |

### Container Ports (External)
| Service | Port |
|---------|------|
| nginx (entry point) | 80 |
| Frontend (dev) | 5173 |
| Analytics API | 8000 |
| Ingestion Service | 8001 |

---

## 2. Implementation Approach

Follow the step-by-step plan's **bottom-up, data-flow-first** principle:

1. **Phase 0 — Scaffolding**: Monorepo structure, Docker Compose, DB init scripts, minimal Dockerfiles
2. **Phase 1 — Ingestion**: Rust Axum service for event intake → Redis Streams
3. **Phase 2 — Simulator**: TypeScript data generator, PostgreSQL seeding, historical backfill + live mode
4. **Phase 3 — Aggregation Worker**: Python consumer → ClickHouse raw inserts + rollup computation
5. **Phase 4 — Analytics API**: Python FastAPI BFF with ClickHouse/PostgreSQL/Redis reads
6. **Phase 5 — Frontend**: React SPA with Tremor charts, shadcn/ui shell, TanStack Query data fetching
7. **Phase 6 — Polish**: E2E tests, error handling, documentation, performance validation
8. **Phase 7 — Auth** (Phase B): JWT login, session management, RBAC
9. **Phase 8 — Multi-Tenancy** (Phase C): Second org, ingestion validation, isolation audit
10. **Phase 9 — WebSocket** (Phase D, stretch): Real-time push via Redis Pub/Sub

Each phase has a testable milestone. Unit tests are written alongside implementation (not in separate steps).

### Key Architectural Patterns
- **Tenant-aware from day one**: `org_id` in every query, cache key, and data model — even in Phase A (single demo org)
- **OrgContext dependency injection**: FastAPI `Depends()` provides org context to all route handlers; stub in Phase A, JWT-based in Phase B
- **AuthProvider context**: React Context provides auth state; stub in Phase A, real auth in Phase B
- **Redis Streams for event bus**: Ingestion publishes, Aggregation Worker consumes via consumer groups
- **ReplacingMergeTree for rollups**: ClickHouse upsert semantics for daily aggregation tables
- **Filter state in URL**: React Router search params for shareable/bookmarkable filter state

---

## 3. Source Code Structure

### Files to Create (complete monorepo)

```
agenthub-analytics/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
│
├── nginx/
│   └── nginx.conf
│
├── init-scripts/
│   ├── postgres/
│   │   └── 001-schema.sql          # organizations, teams, users, projects tables
│   └── clickhouse/
│       └── 001-tables.sql          # agent_runs, daily_team_metrics, daily_agent_type_metrics, daily_project_metrics
│
├── ingestion/
│   ├── Cargo.toml
│   ├── Dockerfile
│   └── src/
│       ├── main.rs
│       ├── config.rs
│       ├── routes/
│       │   ├── mod.rs
│       │   ├── events.rs           # POST /ingest/events
│       │   └── health.rs           # GET /ingest/health
│       ├── models/
│       │   ├── mod.rs
│       │   └── event.rs            # AgentEvent struct + validation
│       ├── validation.rs
│       └── publisher.rs            # Redis Streams XADD
│
├── simulator/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       ├── index.ts                # Entry point
│       ├── config.ts
│       ├── seed-data.ts            # PostgreSQL seeding
│       ├── sender.ts               # HTTP client → ingestion
│       └── generators/
│           ├── org.ts              # Org/team/user/project generation
│           ├── events.ts           # AgentEvent generation
│           └── patterns.ts         # Temporal patterns
│
├── aggregation-worker/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── app/
│       ├── main.py                 # Entry point, consumer loop
│       ├── config.py
│       ├── consumer.py             # Redis Streams XREADGROUP
│       ├── enrichment.py           # user→team lookup from PostgreSQL
│       ├── aggregator.py           # Rollup computation
│       └── writers/
│           ├── clickhouse.py       # Raw events + rollups → ClickHouse
│           └── redis_cache.py      # Real-time counters
│
├── analytics-api/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── app/
│       ├── main.py                 # FastAPI app, middleware, lifespan
│       ├── config.py               # pydantic-settings
│       ├── auth/
│       │   ├── middleware.py
│       │   ├── dependencies.py     # get_current_user, get_org_context
│       │   ├── stub.py             # Phase A: hardcoded context
│       │   └── jwt.py              # Phase B: JWT validation
│       ├── routers/
│       │   ├── health.py
│       │   ├── overview.py
│       │   ├── usage.py
│       │   ├── cost.py
│       │   ├── performance.py
│       │   └── auth.py             # Phase B
│       ├── services/
│       │   ├── clickhouse.py
│       │   ├── postgres.py
│       │   └── redis_cache.py
│       ├── models/
│       │   ├── requests.py         # MetricFilters
│       │   ├── responses.py        # All endpoint response schemas
│       │   └── auth.py             # OrgContext, UserSession, Role
│       └── queries/
│           ├── overview.sql
│           ├── usage.sql
│           ├── cost.sql
│           └── performance.sql
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── Dockerfile
    ├── index.html
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── api/                    # Typed fetch functions + TanStack Query hooks
        ├── components/
        │   ├── ui/                 # shadcn/ui primitives
        │   ├── charts/             # Tremor chart wrappers
        │   ├── layout/             # Sidebar, Header, FilterBar
        │   └── cards/              # KPI card components
        ├── hooks/                  # useFilters, useAuth, etc.
        ├── pages/                  # Overview, Usage, Cost, Performance, Login (Phase B)
        ├── lib/                    # Formatters, constants, utilities
        └── types/                  # Shared TypeScript interfaces
```

---

## 4. Data Model

### PostgreSQL (Phase A)
Four core tables — see `specs/02-technical-implementation.md` section 2.6 for full DDL:
- **organizations**: org_id (PK), name, plan, monthly_budget, logo_url
- **teams**: team_id (PK), org_id (FK), name, slug (unique per org)
- **users**: user_id (PK), org_id (FK), team_id (FK), name, email, avatar_url, role, is_active, password_hash (Phase B)
- **projects**: project_id (PK), org_id (FK), team_id (FK), name, repository_url

### ClickHouse
Four tables — see `specs/02-technical-implementation.md` section 2.4 for full DDL:
- **agent_runs**: Raw event store, MergeTree, partitioned by month, ordered by (org_id, started_at, team_id)
- **daily_team_metrics**: ReplacingMergeTree, ordered by (org_id, date, team_id)
- **daily_agent_type_metrics**: ReplacingMergeTree, ordered by (org_id, date, agent_type)
- **daily_project_metrics**: ReplacingMergeTree, ordered by (org_id, date, project_id)

### Redis Keys
- **Event bus**: Stream `agent_events` with consumer group `aggregation_workers`
- **Real-time counters**: `rt:{org_id}:active_runs`, `rt:{org_id}:today_runs`
- **Cache**: `metrics:{org_id}:{endpoint}:{hash(filters)}` with TTL (30s overview, 5min aggregated, 10min org)

---

## 5. API Contracts

### Analytics API Endpoints
All `/api/metrics/*` endpoints accept `MetricFilters` query params:
- `period`: "7d" | "30d" | "90d" (default "30d")
- `teams`: comma-separated team slugs (optional)
- `projects`: comma-separated project IDs (optional)
- `agent_types`: comma-separated agent types (optional)

| Method | Path | Response Shape | Cache TTL |
|--------|------|---------------|-----------|
| GET | /api/health | `{ status, dependencies }` | none |
| GET | /api/orgs/current | `{ org_id, name, plan, teams[], projects[] }` | 10min |
| GET | /api/metrics/overview | `{ kpi_cards, usage_trend[], team_breakdown[], active_runs_count }` | 30s |
| GET | /api/metrics/usage | `{ adoption_rate, active_users_trend[], agent_type_breakdown[], top_users[], project_breakdown[] }` | 5min |
| GET | /api/metrics/cost | `{ cost_trend[], cost_breakdown[], cost_per_run_trend[], token_breakdown, budget }` | 5min |
| GET | /api/metrics/performance | `{ success_rate_trend[], latency_trend[], error_breakdown[], availability, queue_wait_trend[] }` | 5min |

### Ingestion API Endpoints
| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | /ingest/events | `{ events: AgentEvent[] }` (1-100) | `202 { accepted, rejected, errors[] }` |
| GET | /ingest/health | — | `200 { status, redis_connected }` |

Full response schemas are defined in `specs/02-technical-implementation.md` section 2.2.

---

## 6. Verification Approach

### Per-Phase Testing
Each phase includes unit tests alongside implementation per the testing spec (`specs/03-testing.md`):

| Phase | Test Framework | Test IDs |
|-------|---------------|----------|
| 1 — Ingestion | Rust cargo test + reqwest | ING-U01–U08, ING-I01–I04 |
| 2 — Simulator | Vitest | SIM-U01–U06 |
| 3 — Worker | pytest + pytest-asyncio | AGG-U01–U06, AGG-I01–I04 |
| 4 — Analytics API | pytest + httpx | API-U01–U05, API-I01–I07 |
| 5 — Frontend | Vitest + React Testing Library + MSW | FE-U01–U08, FE-I01–I05 |
| 6 — Polish | Shell + curl + jq | E2E-01–E2E-03 |
| 7 — Auth | pytest + Vitest | AUTH-U01–U05, AUTH-I01–I06, AUTH-FE01–FE05 |
| 8 — Multi-Tenancy | pytest + shell | MT-I01–I05, MT-E2E01–E2E03 |

### Lint & Type Checking
| Service | Commands |
|---------|----------|
| Frontend | `npm run lint`, `npm run type-check`, `npm run test` |
| Analytics API | `ruff check .`, `mypy app/`, `pytest` |
| Ingestion | `cargo fmt --check`, `cargo clippy`, `cargo test` |
| Aggregation Worker | `ruff check .`, `pytest` |
| Simulator | `npm run lint`, `npm run test` |

### Integration Milestone Checks
- After Phase 0: `docker compose up` → all containers healthy
- After Phase 1: `curl POST /ingest/events` → 202, events in Redis Stream
- After Phase 3: ClickHouse contains 90 days of rollup data
- After Phase 4: `curl /api/metrics/overview` → data-rich JSON
- After Phase 5: Browser at localhost shows populated dashboard
- After Phase 6: Full E2E smoke tests pass, page loads < 2s

---

## 7. Risk Factors & Mitigations

| Risk | Mitigation |
|------|-----------|
| ClickHouse query complexity for aggregations | Use pre-computed rollup tables; only query raw events for real-time counters |
| Rust service adds build complexity | Multi-stage Docker build; keep ingestion service scope minimal |
| 3-language stack increases cognitive load | Clear service boundaries; each service is self-contained with its own deps |
| Data consistency between Redis/ClickHouse | Worker acknowledges after successful write; failed writes trigger reprocessing |
| Frontend chart library learning curve | Tremor provides pre-built analytics components; fall back to recharts if needed |
| Docker Compose startup ordering | Use health checks + depends_on conditions; simulator waits for ingestion + postgres |
