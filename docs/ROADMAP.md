# Agenthub Roadmap

> Remaining phases for the Agenthub analytics platform.
> Phases 0-8 are complete (scaffolding, ingestion, simulator, aggregation, API, frontend, polish, testing improvements, image upgrades, authentication, multi-tenancy).

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
Phase 9 (WebSocket)  -- depends on auth (Phase 7) + multi-tenancy (Phase 8) for org-scoped channels
```

Phase 9 is a stretch goal. All prerequisite phases are complete.
