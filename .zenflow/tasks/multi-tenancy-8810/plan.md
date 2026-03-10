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
<!-- chat-id: 659ab239-aefa-4c9d-80d1-e9fa971b378a -->

Completed. Output saved to `.zenflow/tasks/multi-tenancy-8810/spec.md`.

Difficulty: **Medium**. Multi-tenancy infrastructure (org_id in all schemas, JWT org context, org-scoped cache/queries) is already in place. Remaining work: seed second org, org validation in ingestion, API keys, cross-org tests, roadmap cleanup.

---

### [x] Step: DB Schema & Simulator — Second Org + API Keys
<!-- chat-id: 338328ba-eb64-4da5-b63b-f2d6c4c5d99b -->

Add the `api_keys` table to PostgreSQL schema and seed a second organization (Globex Corporation) with independent teams, users, projects, and API keys.

**Files to modify:**
- `init-scripts/postgres/001-schema.sql` — add `api_keys` table
- `simulator/src/generators/org.ts` — add Globex org definition, API key types and generation, well-known Globex demo user
- `simulator/src/seed-data.ts` — seed API keys and populate `valid_orgs` Redis set

**Key details:**
- Globex: `org_globex`, business plan, $20k budget, 3 teams (~20 users)
- Well-known demo user for Globex: `admin@globexcorporation.com` / `pass`
- API keys: deterministic dev keys (e.g., `ak_acme_001`, `ak_globex_001`), bcrypt-hashed in DB
- Seed `valid_orgs` Redis set (SADD) with all org IDs during seed phase
- Ensure idempotency (ON CONFLICT DO NOTHING)

**Verification:**
- `docker compose exec simulator npm run test`
- `docker compose exec simulator npm run lint`

---

### [x] Step: Simulator — Multi-Org Event Generation & Live Mode
<!-- chat-id: b2c2129f-d3d4-4de3-8af2-cafd92b92e07 -->

Update event generation to produce differentiated data per org and enable multi-org live mode.

**Files to modify:**
- `simulator/src/generators/events.ts` — per-org event characteristics (different volumes, success rates)
- `simulator/src/index.ts` — Phase 3 live mode: generate events for all orgs (round-robin), not just `orgs[0]`

**Key details:**
- Globex: ~120 base daily events (vs Acme's 200), ~90% success rate (vs 87%)
- Live mode: create contexts for all orgs, alternate between them each cycle
- 90 days of independent backfill history per org (already loops all orgs in Phase 2)

**Verification:**
- `docker compose exec simulator npm run test`
- `docker compose exec simulator npm run lint`

---

### [ ] Step: Ingestion — Org ID Validation via Redis

Add org_id validation to the ingestion service: reject events with unregistered org_id.

**Files to modify:**
- `ingestion/src/routes/events.rs` — check `org_id` against Redis `valid_orgs` set (SISMEMBER) before publishing
- `ingestion/src/validation.rs` — add tests for org validation

**Key details:**
- Use Redis SISMEMBER on `valid_orgs` set (populated by simulator at seed time)
- No PostgreSQL dependency needed — keeps ingestion service lightweight
- Return rejected events with reason "unknown org_id"
- Add unit tests for org validation logic

**Verification:**
- `docker compose exec ingestion cargo test`
- `docker compose exec ingestion cargo fmt`
- `docker compose exec ingestion cargo clippy`

---

### [ ] Step: Analytics API — Cross-Org Isolation Tests

Add integration tests verifying that cross-org data leakage is impossible.

**Files to modify:**
- `analytics-api/tests/test_integration.py` — add cross-org isolation test cases

**Key details:**
- Test: user from org_acme context gets only org_acme data (verify org_id filter in mock calls)
- Test: cache key for org_acme does not collide with org_globex
- Test: all ClickHouse query files contain `org_id` in WHERE clause (static analysis)
- Use existing test patterns: override `get_org_context` dependency, mock services

**Verification:**
- `docker compose exec analytics-api pytest`

---

### [ ] Step: Roadmap Cleanup & Full Stack Verification

Update ROADMAP.md and verify the complete multi-tenancy flow end-to-end.

**Files to modify:**
- `docs/ROADMAP.md` — remove Phase 7 and Phase 8, update completed phases note and dependency graph

**Key details:**
- Remove Phase 7 section (authentication — already complete)
- Remove Phase 8 section (multi-tenancy — completed by this task)
- Update header: "Phases 0-8 are complete"
- Update dependency graph to show only Phase 9

**Verification:**
- `docker compose up --build -d` — full stack starts without errors
- Run all tests: `./scripts/test.sh`
- Manual check: log in as Acme user → see Acme data; log in as Globex user → see Globex data
- Write report to `.zenflow/tasks/multi-tenancy-8810/report.md`
