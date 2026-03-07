# AgentHub Analytics — Testing Specification

## 1. Testing Philosophy

This project uses a pragmatic testing strategy appropriate for a demo/portfolio project with production-ready architecture. We prioritize tests that validate **architectural correctness** (services communicate correctly, data flows end-to-end) over exhaustive unit coverage. Each service has a focused test suite that proves it works, complemented by integration tests that prove the system works together.

## 2. Test Pyramid

```
         ╱  E2E  ╲           1-2 smoke tests: browser → full stack
        ╱──────────╲
       ╱ Integration ╲       Per-service: API contract tests, DB queries
      ╱────────────────╲
     ╱    Unit Tests     ╲   Pure logic: validators, aggregators, formatters
    ╱──────────────────────╲
```

## 3. Per-Service Test Plans

### 3.1 Dashboard SPA (Frontend)

**Framework:** Vitest + React Testing Library

**Unit Tests:**
| ID | Test | What it validates |
|----|------|-------------------|
| FE-U01 | KPI card renders value and change percentage correctly | Number formatting, positive/negative change styling |
| FE-U02 | Date range selector updates URL search params | Filter state management via URL |
| FE-U03 | Team filter multi-select updates query params | Filter serialization/deserialization |
| FE-U04 | Cost formatter displays currency correctly | `$1,234.56` formatting, `$0.00` edge case |
| FE-U05 | Duration formatter converts ms to human-readable | `1200ms → 1.2s`, `90000ms → 1m 30s` |
| FE-U06 | Percentage formatter handles edge cases | `0.8765 → 87.7%`, `0 → 0%`, `1 → 100%` |
| FE-U07 | Empty state renders when API returns no data | Graceful handling of empty arrays |
| FE-U08 | Error state renders when API call fails | Error boundary / error message display |

**Integration Tests (with MSW):**
| ID | Test | What it validates |
|----|------|-------------------|
| FE-I01 | Overview page fetches and renders all KPI cards | Full page render with mocked API response |
| FE-I02 | Changing period filter re-fetches data | TanStack Query refetch on param change |
| FE-I03 | Team filter narrows the team breakdown table | Filter application to table data |
| FE-I04 | Navigation between pages preserves filters | URL state persistence across routes |
| FE-I05 | Loading state shown during API fetch | Skeleton/spinner visibility during pending state |

### 3.2 Analytics API

**Framework:** pytest + pytest-asyncio + httpx (TestClient)

**Unit Tests:**
| ID | Test | What it validates |
|----|------|-------------------|
| API-U01 | Filter parsing: valid period values accepted | `7d`, `30d`, `90d` pass; `5d` rejected |
| API-U02 | Filter parsing: team slugs validated | Array parsing from comma-separated query param |
| API-U03 | Cache key generation is deterministic | Same filters always produce same cache key |
| API-U04 | Response models serialize correctly | Pydantic model → JSON matches expected schema |
| API-U05 | Date range calculation from period | `30d` with today = March 7 → start = Feb 5 |

**Integration Tests (with test containers or mocked stores):**
| ID | Test | What it validates |
|----|------|-------------------|
| API-I01 | GET /api/health returns dependency status | Health check reports all store connections |
| API-I02 | GET /api/metrics/overview returns valid schema | Response matches OverviewResponse model |
| API-I03 | GET /api/metrics/overview with team filter narrows results | SQL WHERE clause applies team filter |
| API-I04 | GET /api/metrics/cost with group_by=team returns team breakdown | GROUP BY dimension changes response shape |
| API-I05 | GET /api/metrics/performance returns latency percentiles | p50 ≤ p95 ≤ p99 invariant holds |
| API-I06 | Redis cache hit returns same data without querying ClickHouse | Second call faster, same response |
| API-I07 | GET /api/orgs/current returns org with teams and projects | PostgreSQL join returns enriched org data |

### 3.3 Ingestion Service

**Framework:** Rust built-in `#[cfg(test)]` + `cargo test`, plus `reqwest` for integration tests

**Unit Tests:**
| ID | Test | What it validates |
|----|------|-------------------|
| ING-U01 | Valid event passes schema validation | Well-formed AgentEvent accepted |
| ING-U02 | Missing required fields rejected | Missing `run_id` → validation error |
| ING-U03 | Invalid agent_type rejected | `agent_type: "invalid"` → error |
| ING-U04 | Batch of 100 events all validated | Max batch size accepted |
| ING-U05 | Batch of 101 events rejected | Over max batch size → 400 |
| ING-U06 | Partial batch: valid events accepted, invalid rejected | Response shows accepted + rejected counts |
| ING-U07 | Event timestamp in the future rejected | Timestamp > now + 5min → validation error |
| ING-U08 | cost_usd must be non-negative | Negative cost → validation error |

**Integration Tests:**
| ID | Test | What it validates |
|----|------|-------------------|
| ING-I01 | POST /ingest/events publishes to Redis Stream | After POST, XLEN on stream increases |
| ING-I02 | POST /ingest/events returns 202 with accepted count | Correct response status and body |
| ING-I03 | Redis unavailable → returns 503 | Graceful degradation on dependency failure |
| ING-I04 | GET /ingest/health reports Redis status | Health endpoint reflects connection state |

### 3.4 Aggregation Worker

**Framework:** pytest + pytest-asyncio

**Unit Tests:**
| ID | Test | What it validates |
|----|------|-------------------|
| AGG-U01 | Event parsing from Redis Stream format | Raw XREADGROUP response → AgentEvent objects |
| AGG-U02 | Daily rollup computation: run counts | 100 events with 87 success → totals correct |
| AGG-U03 | Daily rollup computation: latency percentiles | Known durations → p50/p95/p99 calculated correctly |
| AGG-U04 | Daily rollup computation: active user count | 100 events from 15 unique users → active_users = 15 |
| AGG-U05 | Daily rollup computation: cost aggregation | Sum of individual costs matches total_cost |
| AGG-U06 | Enrichment: user → team mapping | user_id resolved to correct team_id via PostgreSQL data |

**Integration Tests:**
| ID | Test | What it validates |
|----|------|-------------------|
| AGG-I01 | End-to-end: events in Redis → rollups in ClickHouse | Publish events, run worker cycle, query ClickHouse |
| AGG-I02 | Real-time counters updated in Redis | After processing, Redis key `active_runs_count` updated |
| AGG-I03 | XACK called after successful processing | Messages not re-delivered after acknowledgment |
| AGG-I04 | Failed ClickHouse write → messages not acknowledged | Events re-processed on next cycle |

### 3.5 Event Simulator

**Framework:** Vitest

**Unit Tests:**
| ID | Test | What it validates |
|----|------|-------------------|
| SIM-U01 | Generated events have all required fields | Schema completeness check |
| SIM-U02 | Agent type distribution matches configured weights | 10,000 events → coding ≈ 40% ± 3% |
| SIM-U03 | Temporal patterns: weekday > weekend activity | Monday events > Sunday events |
| SIM-U04 | Team activity proportional to team size | Platform (15 people) > Mobile (5 people) |
| SIM-U05 | Seeded faker produces deterministic org structure | Same seed → same teams/users/projects |
| SIM-U06 | Error distribution matches configured rates | Failed events have correct category distribution |

## 4. End-to-End / Smoke Tests

These tests validate the full system running via Docker Compose.

**Framework:** Shell script + `curl` + `jq` (or a simple Node.js test runner)

| ID | Test | What it validates |
|----|------|-------------------|
| E2E-01 | All containers healthy after `docker compose up` | Every service health check passes within 120s |
| E2E-02 | POST events to ingestion → query via analytics API | Write path + aggregation + read path end-to-end |
| E2E-03 | Dashboard accessible at http://localhost | nginx serves frontend, API proxy works |

**E2E-02 Detailed Flow:**
```bash
# 1. POST a batch of test events
curl -X POST http://localhost/ingest/events \
  -H "Content-Type: application/json" \
  -d '{"events": [<10 well-formed events>]}'
# Expect: 202 { accepted: 10 }

# 2. Wait for aggregation (up to 30s)
sleep 30

# 3. Query the overview endpoint
curl http://localhost/api/metrics/overview?period=7d
# Expect: 200, response contains total_runs >= 10

# 4. Query with team filter
curl "http://localhost/api/metrics/overview?period=7d&teams=platform"
# Expect: 200, team_breakdown only contains "platform"
```

## 5. Test Data Strategy

### 5.1 Unit Tests
- Use hardcoded fixtures specific to each test case.
- No dependency on external services or databases.

### 5.2 Integration Tests
- Analytics API: Use a test ClickHouse instance (Docker) pre-seeded with known data via a pytest fixture.
- Ingestion: Use a test Redis instance (Docker).
- Worker: Use test instances of all three stores.

### 5.3 E2E Tests
- Rely on the simulator to populate data.
- Wait for data to propagate through the pipeline before asserting.

## 6. CI Pipeline (Stretch Goal)

```yaml
# .github/workflows/test.yml (conceptual)
jobs:
  frontend:
    steps:
      - npm ci
      - npm run lint
      - npm run type-check
      - npm run test

  analytics-api:
    steps:
      - pip install -r requirements.txt -r requirements-test.txt
      - ruff check .
      - mypy app/
      - pytest tests/unit
      - pytest tests/integration  # uses testcontainers

  ingestion:
    steps:
      - cargo fmt --check
      - cargo clippy
      - cargo test

  aggregation-worker:
    steps:
      - pip install -r requirements.txt -r requirements-test.txt
      - ruff check .
      - pytest tests/unit
      - pytest tests/integration

  e2e:
    needs: [frontend, analytics-api, ingestion, aggregation-worker]
    steps:
      - docker compose up -d
      - ./tests/e2e/run.sh
      - docker compose down
```

## 7. Phase B Tests: Authentication & Authorization

### 7.1 Analytics API — Auth

| ID | Test | What it validates |
|----|------|-------------------|
| AUTH-U01 | Valid JWT token decodes to correct user/org | Token parsing and claims extraction |
| AUTH-U02 | Expired JWT token returns 401 | Expiration enforcement |
| AUTH-U03 | Malformed JWT token returns 401 | Invalid token handling |
| AUTH-U04 | Password hash verification: correct password accepted | bcrypt verify |
| AUTH-U05 | Password hash verification: wrong password rejected | bcrypt verify negative case |
| AUTH-I01 | POST /api/auth/login with valid credentials returns token + user | Full login flow |
| AUTH-I02 | POST /api/auth/login with invalid credentials returns 401 | Login rejection |
| AUTH-I03 | GET /api/metrics/overview without token returns 401 | Protected endpoint enforcement |
| AUTH-I04 | GET /api/metrics/overview with valid token returns data | Authenticated access works |
| AUTH-I05 | team_lead role: data scoped to their team by default | RBAC filtering |
| AUTH-I06 | viewer role: can read data but cannot access admin endpoints | Role restriction |

### 7.2 Frontend — Auth

| ID | Test | What it validates |
|----|------|-------------------|
| AUTH-FE01 | Unauthenticated user redirected to /login | Route guard |
| AUTH-FE02 | Login form submits credentials and stores token | Auth flow |
| AUTH-FE03 | Logout clears token and redirects to /login | Session teardown |
| AUTH-FE04 | 401 API response triggers automatic logout | Token expiration handling |
| AUTH-FE05 | User name and role displayed in sidebar | Auth context rendering |

## 8. Phase C Tests: Multi-Tenancy

### 8.1 Tenant Isolation

| ID | Test | What it validates |
|----|------|-------------------|
| MT-I01 | User from org_acme cannot see org_globex data via API | Query scoping |
| MT-I02 | Cache key for org_acme does not return org_globex data | Cache isolation |
| MT-I03 | ClickHouse query for org_acme WHERE org_id filter applied | SQL-level isolation |
| MT-I04 | Ingestion rejects events with unregistered org_id | Org validation |
| MT-I05 | API key for org_acme cannot ingest events for org_globex | Cross-org ingestion blocked |

### 8.2 Multi-Org E2E

| ID | Test | What it validates |
|----|------|-------------------|
| MT-E2E01 | Seed 2 orgs, login as org_acme admin, verify only Acme data shown | Full isolation |
| MT-E2E02 | Login as org_globex admin, verify only Globex data shown | Reciprocal isolation |
| MT-E2E03 | Both orgs have independent team/user/project structures | Data independence |

## 9. Phase D Tests: WebSocket

| ID | Test | What it validates |
|----|------|-------------------|
| WS-I01 | WebSocket connection established with valid token | Auth handshake |
| WS-I02 | WebSocket connection rejected without token | Auth enforcement |
| WS-I03 | Client receives active_runs update when event ingested | Pub/Sub propagation |
| WS-I04 | Client only receives events for their org | Tenant-scoped broadcast |
| WS-I05 | WebSocket reconnects after server restart | Resilience |
| WS-FE01 | Active runs indicator updates via WebSocket without polling | Frontend integration |
| WS-FE02 | WebSocket failure falls back to polling | Graceful degradation |

