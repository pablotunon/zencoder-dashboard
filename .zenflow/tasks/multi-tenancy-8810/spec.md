# Technical Specification: Phase 8 — Multi-Tenancy

## Difficulty: Medium

The multi-tenancy infrastructure is already in place (org_id in all DB schemas, JWT-based org context, org-scoped Redis caching, org-filtered queries). The remaining work is seeding a second organization, validating orgs at ingestion time, adding API keys, writing cross-org isolation tests, and updating the roadmap.

---

## Technical Context

| Service            | Language   | Key Dependencies                              |
| ------------------ | ---------- | --------------------------------------------- |
| **simulator**      | TypeScript | pg, faker, bcryptjs                           |
| **ingestion**      | Rust       | axum, tokio, redis, serde, uuid, chrono       |
| **analytics-api**  | Python     | FastAPI, asyncpg, clickhouse-connect, redis   |
| **aggregation**    | Python     | Redis streams, clickhouse-connect             |
| **frontend**       | TypeScript | React 19, Vite, TanStack Query               |

All services run in Docker. Tests execute inside containers.

---

## Current State (What's Already Done)

- **PostgreSQL schema**: `organizations`, `teams`, `users`, `projects` all have `org_id` as FK/PK
- **ClickHouse schema**: `agent_runs` and all rollup tables use `org_id` as primary dimension with `ORDER BY (org_id, ...)`
- **Analytics API**: Every query in `app/queries/*.sql` and `app/services/postgres.py` filters by `org_id`. Redis cache keys include `org_id` via `metrics:{org_id}:{endpoint}:{hash}`
- **Auth**: JWT tokens carry `org_id` claim; `get_org_context` dependency extracts it for every protected route
- **Ingestion**: Redis counters already namespaced as `rt:{org_id}:active_runs` and `rt:{org_id}:today_runs`
- **Frontend**: `useAuth()` provides org context; sidebar shows org name/plan
- **Simulator**: `index.ts` already loops all orgs for backfill (Phase 2); `generateUsers`/`generateProjects` are parameterized by org

---

## What Needs To Be Done

### 1. Simulator — Second Organization

**File: `simulator/src/generators/org.ts`**

Add Globex Corporation to the `ORGS` array:
```typescript
{
  id: "org_globex",
  name: "Globex Corporation",
  plan: "business",
  monthly_budget: 20000,
  teams: [
    { id: "team_globex_eng", name: "Engineering", slug: "engineering", size: 10 },
    { id: "team_globex_product", name: "Product", slug: "product", size: 6 },
    { id: "team_globex_devops", name: "DevOps", slug: "devops", size: 4 },
  ],
}
```

- Team IDs must be globally unique (prefix with `team_globex_`)
- `generateUsers` already handles non-acme orgs (sets first user as admin)
- `generateProjects` already works per-org (uses round-robin across teams)
- Well-known demo user for Globex: `admin@globexcorporation.com` / `pass` (add similar to the acme well-known user pattern)

**File: `simulator/src/generators/events.ts`**

Consider varying event generation characteristics per org:
- Globex: lower base daily events (~120 vs Acme's 200) — smaller org
- Slightly different success rates (e.g., 90% vs 87%)
- Different agent type distribution weights

**File: `simulator/src/index.ts`**

Update Phase 3 (live mode) to rotate across all orgs, not just `orgs[0]`:
- Create event generator contexts for all orgs
- Round-robin or random selection per event cycle

### 2. PostgreSQL Schema — API Keys Table

**File: `init-scripts/postgres/001-schema.sql`**

Add `api_keys` table:
```sql
CREATE TABLE api_keys (
    api_key_id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) REFERENCES organizations(org_id),
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_keys_org ON api_keys(org_id);
```

### 3. Simulator — API Key Seeding

**File: `simulator/src/generators/org.ts`**

Add API key generation:
- Export interface `ApiKeyRecord` with `api_key_id`, `org_id`, `key_hash`, `name`, `is_active`, `plain_key` (for logging only)
- Generate 1-2 API keys per org with bcrypt-hashed keys
- Use deterministic key values for dev (e.g., `ak_acme_001`, `ak_globex_001`)

**File: `simulator/src/seed-data.ts`**

Insert API keys into PostgreSQL alongside other seed data.

### 4. Ingestion — Org Validation

**File: `ingestion/src/lib.rs`**

Expand `AppState` to include a set of valid org IDs:
```rust
pub struct AppState {
    pub redis: redis::Client,
    pub valid_orgs: Arc<RwLock<HashSet<String>>>,
}
```

**New file: `ingestion/src/org_validator.rs`**

- On startup: load valid `org_id` set from PostgreSQL into `valid_orgs` in AppState
- Background task: refresh every 5 minutes
- Requires adding `sqlx` or `tokio-postgres` to `Cargo.toml`
- Store the set in Redis as `valid_orgs` (SADD) for fast lookup

Alternative (simpler, keeps ingestion stateless): load valid org IDs into Redis set `valid_orgs` during simulator seed phase, and check against Redis in the ingestion handler. This avoids adding PostgreSQL dependency to the ingestion service.

**Recommended approach**: Use Redis set `valid_orgs` populated by the simulator at seed time and refreshed periodically. The ingestion service already has a Redis dependency. This avoids adding PostgreSQL to the Rust service.

**File: `ingestion/src/routes/events.rs`**

Add org validation check before publishing events:
```rust
// Check org_id against valid_orgs Redis set
let is_valid: bool = redis_conn.sismember("valid_orgs", &event.org_id).await?;
if !is_valid {
    // Reject event with "unknown org_id"
}
```

### 5. Analytics API — Cross-Org Isolation Verification

**File: `analytics-api/tests/test_integration.py`**

Add integration tests:
- `test_user_from_org_acme_cannot_see_org_globex_data`: Override org context with `org_acme`, mock ClickHouse/PostgreSQL to verify `org_id` filter is applied
- `test_cache_key_scoped_to_org`: Verify that cache keys for different orgs don't collide
- `test_clickhouse_queries_have_org_filter`: Inspect all SQL query files to confirm `org_id` in WHERE

No code changes needed in the analytics-api routes — isolation is already enforced by `OrgContext` dependency injection.

### 6. Frontend — Dynamic Org Display

The frontend already loads org context from the JWT login response and displays it in the sidebar. The `/api/orgs/current` endpoint returns org details dynamically.

**No changes required** unless we want an org switcher (marked as stretch in roadmap). The org name/logo already load dynamically from the auth response.

### 7. ROADMAP.md — Cleanup

**File: `docs/ROADMAP.md`**

- Remove Phase 7 (already completed)
- Remove Phase 8 (being completed by this task)
- Update dependency graph
- Update header note about completed phases

---

## Source Code Changes Summary

| File | Action | Description |
| ---- | ------ | ----------- |
| `simulator/src/generators/org.ts` | Modify | Add Globex org, API key types/generation |
| `simulator/src/seed-data.ts` | Modify | Seed API keys + valid_orgs Redis set |
| `simulator/src/index.ts` | Modify | Multi-org live mode |
| `init-scripts/postgres/001-schema.sql` | Modify | Add `api_keys` table |
| `ingestion/src/routes/events.rs` | Modify | Add org_id validation via Redis SISMEMBER |
| `ingestion/src/validation.rs` | Modify | Add org validation function |
| `analytics-api/tests/test_integration.py` | Modify | Add cross-org isolation tests |
| `docs/ROADMAP.md` | Modify | Remove Phase 7 and Phase 8 |

---

## Verification Approach

1. **Simulator tests**: `docker compose exec simulator npm run test`
   - Verify Globex org generates users/projects/API keys correctly
   - Verify seed data is idempotent with 2 orgs

2. **Ingestion tests**: `docker compose exec ingestion cargo test`
   - Verify valid org_id accepted
   - Verify unknown org_id rejected

3. **Analytics API tests**: `docker compose exec analytics-api pytest`
   - Cross-org isolation tests pass
   - Existing tests still pass

4. **Full stack verification**: `docker compose up --build -d`
   - Log in as Acme admin (`user@acmecorp.com` / `pass`) → see only Acme data
   - Log in as Globex admin (`admin@globexcorporation.com` / `pass`) → see only Globex data
   - Verify sidebar shows correct org name for each login

5. **Linting**:
   - `docker compose exec simulator npm run lint`
   - `docker compose exec ingestion cargo fmt && docker compose exec ingestion cargo clippy`
   - `docker compose exec analytics-api pytest`
