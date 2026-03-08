# Agenthub Roadmap

> Remaining phases for the Agenthub analytics platform.
> Phases 0-6.1 are complete (scaffolding, ingestion, simulator, aggregation, API, frontend, polish, testing improvements, image upgrades).

---

## Phase 7 — Authentication & Authorization

**Goal:** Users log in with credentials, sessions are JWT-managed, routes are protected, and roles control data visibility.

### Backend (analytics-api)

- [ ] Implement `auth/jwt.py` — JWT generation (login) and validation (middleware) using `python-jose` + `bcrypt`
- [ ] `POST /api/auth/login` — validate email + bcrypt hash from PostgreSQL, return JWT + user profile
- [ ] `POST /api/auth/logout` — invalidate session via Redis deny-list with TTL matching token expiry
- [ ] `GET /api/auth/me` — return current user from JWT claims
- [ ] Replace `auth/stub.py` — `get_org_context` extracts `org_id`/`user_id` from JWT instead of hardcoded values
- [ ] Role-based guards — `team_lead` auto-applies team filter; `viewer` gets read-only; `admin` has full access
- [ ] Update nginx to proxy `/api/auth/*` routes

### Simulator

- [ ] Generate `password_hash` (bcrypt) for all seeded users (demo password: `demo123`)
- [ ] Seed at least 1 user per role: `admin`, `team_lead`, `viewer`

### Frontend

- [ ] Build `/login` page with email/password form
- [ ] Replace `AuthProvider` stub with real auth — JWT in memory, refresh via `/api/auth/me`
- [ ] Route guards — redirect unauthenticated users to `/login`, preserve intended destination
- [ ] 401 interceptor — auto-logout on token expiration
- [ ] User profile in sidebar (name, role) with logout button

### Tests

| ID | Description |
|----|-------------|
| AUTH-U01 | Valid JWT decodes to correct user/org |
| AUTH-U02 | Expired JWT returns 401 |
| AUTH-U03 | Malformed JWT returns 401 |
| AUTH-U04 | Correct password accepted (bcrypt) |
| AUTH-U05 | Wrong password rejected (bcrypt) |
| AUTH-I01 | `POST /api/auth/login` with valid creds returns token |
| AUTH-I02 | `POST /api/auth/login` with invalid creds returns 401 |
| AUTH-I03 | `GET /api/metrics/overview` without token returns 401 |
| AUTH-I04 | `GET /api/metrics/overview` with valid token returns data |
| AUTH-I05 | `team_lead` role: data scoped to their team |
| AUTH-I06 | `viewer` role: read-only, no admin endpoints |
| AUTH-FE01 | Unauthenticated user redirected to `/login` |
| AUTH-FE02 | Login form submits credentials and stores token |
| AUTH-FE03 | Logout clears token and redirects to `/login` |
| AUTH-FE04 | 401 API response triggers automatic logout |
| AUTH-FE05 | User name and role displayed in sidebar |

### Milestone

> Users log in with seeded credentials, see their name/role in the sidebar, and are redirected to login if their session expires.

---

## Phase 8 — Multi-Tenancy

**Goal:** Complete tenant isolation — two organizations with independent data, zero cross-org leakage.

### Simulator

- [ ] Add second org: Globex Corporation (business plan, $20k budget) with independent teams, users, projects
- [ ] Generate 90 days of independent event history per org (different volumes, patterns, success rates)
- [ ] Seed API keys per org (hashed in `api_keys` table)

### Ingestion (Rust)

- [ ] On startup, load valid `org_id` set from PostgreSQL into Redis (`valid_orgs`), refresh every 5 min
- [ ] Reject events with unknown `org_id`
- [ ] (Stretch) Validate `X-Api-Key` header against `api_keys` table for the given org

### Analytics API — Isolation audit

- [ ] Verify every ClickHouse/PostgreSQL query has `org_id` in `WHERE` clause
- [ ] Verify every Redis cache key includes `org_id`
- [ ] Add integration tests for cross-org access denial (403 or empty results)

### Frontend

- [ ] Org name/logo load dynamically from `/api/orgs/current` based on authenticated user
- [ ] (Stretch) Org switcher in sidebar for users belonging to multiple orgs

### Tests

| ID | Description |
|----|-------------|
| MT-I01 | User from org_acme cannot see org_globex data via API |
| MT-I02 | Cache key for org_acme does not return org_globex data |
| MT-I03 | ClickHouse query for org_acme has `org_id` filter applied |
| MT-I04 | Ingestion rejects events with unregistered `org_id` |
| MT-I05 | API key for org_acme cannot ingest events for org_globex |
| MT-E2E01 | Seed 2 orgs, login as Acme admin, verify only Acme data |
| MT-E2E02 | Login as Globex admin, verify only Globex data |
| MT-E2E03 | Both orgs have independent team/user/project structures |

### Milestone

> Log in as Acme admin — see Acme data. Log in as Globex admin — see Globex data. Neither can see the other's metrics.

---

## Phase 9 — Real-Time WebSocket Push (Stretch)

**Goal:** The Overview page updates live without polling for active runs and new events.

### Analytics API

- [ ] `WS /api/ws/live` — WebSocket endpoint with JWT auth (query param `?token=` or first message)
- [ ] Subscribe to Redis Pub/Sub channel `ws:{org_id}:events`, broadcast to connected clients
- [ ] Org-scoped connections — clients only receive events for their organization

### Aggregation Worker

- [ ] After each event batch, publish to `ws:{org_id}:events`:
  - `{ type: "active_runs", count: N }` — updated active run count
  - `{ type: "event", event: { run_id, agent_type, status, team_name, timestamp } }` — recent events

### Frontend

- [ ] `useWebSocket` hook — connect, authenticate, reconnect with exponential backoff
- [ ] Wire `active_runs` messages to the Overview KPI card, bypassing TanStack Query
- [ ] (Stretch) Live event feed component below KPI cards showing last 10 events
- [ ] Fallback — 3 failed retries reverts to TanStack Query polling (30s interval)

### nginx

- [ ] Add `Upgrade` and `Connection "upgrade"` headers for `/api/ws/` location

### Tests

| ID | Description |
|----|-------------|
| WS-I01 | WebSocket connection established with valid token |
| WS-I02 | WebSocket connection rejected without token |
| WS-I03 | Client receives `active_runs` update when event ingested |
| WS-I04 | Client only receives events for their org |
| WS-I05 | WebSocket reconnects after server restart |
| WS-FE01 | Active runs indicator updates via WebSocket without polling |
| WS-FE02 | WebSocket failure falls back to polling |

### Milestone

> Open the dashboard, see the active runs counter tick up in real-time as the simulator sends events. No page refresh needed.

---

## Dependency Graph

```
Phase 7 (Auth)
    |
    v
Phase 8 (Multi-Tenancy)  -- depends on auth for org-scoped login
    |
    v
Phase 9 (WebSocket)      -- depends on auth for WS connection + multi-tenancy for org-scoped channels
```

Phases must be implemented in order. Phase 9 is a stretch goal.
