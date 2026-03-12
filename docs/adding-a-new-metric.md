# How to Add a New Metric to AgentHub

This document walks through the end-to-end process of adding a new metric to the AgentHub analytics platform. We use the **User Rating** metric (approval rate + rating participation) as a concrete example.

## Overview

Adding a metric touches **6 layers** of the stack. The data flows:

```
Simulator -> Ingestion -> Redis Stream -> Aggregation Worker -> ClickHouse -> Analytics API -> Frontend
```

Each layer needs to know about the new field/metric. Here's exactly what to change at each layer.

---

## Layer 1: Simulator (TypeScript)

**Files:** `simulator/src/generators/events.ts`

### 1a. Add the field type and interface

Add the new type (if it's an enum) and add the field to the `AgentEvent` interface:

```typescript
// New type (if needed)
export type UserRating = "positive" | "negative";

// Add to the AgentEvent interface
export interface AgentEvent {
  // ... existing fields ...
  user_rating?: UserRating;  // Optional — not all events will have it
}
```

### 1b. Add generation logic

Create a function that produces realistic simulated values:

```typescript
function pickUserRating(succeeded: boolean): UserRating | undefined {
  // ~15% of completed runs get a rating (most go unrated)
  if (Math.random() > 0.15) return undefined;
  // Successful runs skew positive, failed runs skew negative
  const positiveChance = succeeded ? 0.8 : 0.3;
  return Math.random() < positiveChance ? "positive" : "negative";
}
```

### 1c. Include in event generation

In `generateRunEvents()`, call the function and spread it into the end event:

```typescript
const userRating = pickUserRating(succeeded);
const endEvent: AgentEvent = {
  // ... existing fields ...
  ...(userRating ? { user_rating: userRating } : {}),
};
```

**Key design decision:** Only include the field when it has a value. This keeps the JSON payload lean (most events won't have a rating).

---

## Layer 2: Ingestion Service (Rust)

**Files:** `ingestion/src/models/event.rs`, `ingestion/src/validation.rs` (tests only)

### 2a. Add the enum and struct field

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UserRating {
    Positive,
    Negative,
}

pub struct AgentEvent {
    // ... existing fields ...
    pub user_rating: Option<UserRating>,
}
```

Because `user_rating` is `Option<UserRating>`, serde automatically handles the case where it's missing from the JSON — it deserializes as `None`.

### 2b. Update test fixtures

Any test that constructs an `AgentEvent` directly (e.g., `validation.rs::make_valid_event`) must include the new field:

```rust
user_rating: None,
```

**No validation logic needed** for this field — serde's enum deserialization rejects invalid values automatically.

---

## Layer 3: ClickHouse Schema

**Files:** `init-scripts/clickhouse/001-tables.sql`

### 3a. Add column to the raw events table

```sql
CREATE TABLE IF NOT EXISTS agent_runs (
    -- ... existing columns ...
    user_rating LowCardinality(Nullable(String))
) ENGINE = MergeTree()
```

Use `Nullable(String)` for optional enum fields. `LowCardinality` optimizes storage for low-cardinality string columns (only a few distinct values).

**Note:** The rollup tables (`daily_team_metrics`, etc.) don't need changes unless you're pre-computing the aggregated metric. For `approval_rate` we compute it on-the-fly from `agent_runs` via the widget query system, so no rollup table changes are needed.

---

## Layer 4: Aggregation Worker (Python)

**Files:** `aggregation-worker/app/consumer.py`, `aggregation-worker/app/writers/clickhouse.py`

### 4a. Add field to the consumer dataclass

```python
@dataclass
class AgentEvent:
    # ... existing fields ...
    user_rating: Optional[str] = None
```

### 4b. Parse it from Redis

In `parse_event()`:

```python
user_rating=data.get("user_rating"),
```

### 4c. Include in ClickHouse insert

In `insert_events()`, add to both the `columns` list and the row data:

```python
columns = [
    # ... existing columns ...
    "user_rating",
]

rows.append([
    # ... existing values ...
    event.user_rating,
])
```

---

## Layer 5: Analytics API (Python/FastAPI)

**Files:** `analytics-api/app/services/widget_query.py`, `analytics-api/app/models/requests.py`

### 5a. Register the metric SQL expression

In `widget_query.py`, add entries to `METRIC_REGISTRY`:

```python
METRIC_REGISTRY: dict[str, MetricDef] = {
    # ... existing metrics ...
    "approval_rate":  MetricDef(
        "countIf(user_rating = 'positive') * 100.0 / greatest(countIf(user_rating IS NOT NULL), 1)",
        "Approval Rate"
    ),
    "rating_participation": MetricDef(
        "countIf(user_rating IS NOT NULL) * 100.0 / greatest(count(), 1)",
        "Rating Participation"
    ),
}
```

The `MetricDef.expr` is a ClickHouse SQL aggregation expression. The widget query engine automatically wraps it in time-series or breakdown queries. This is the only place you define the metric calculation — it works across all chart types and breakdowns.

### 5b. Add to the Pydantic Literal types

In `requests.py`, add the new metric names to both `WidgetQueryRequest.metric` and `BatchWidgetQueryRequest.metrics` Literal types:

```python
metric: Literal[
    # ... existing metrics ...
    "approval_rate", "rating_participation",
]
```

This ensures the API validates incoming requests and rejects unknown metric names.

---

## Layer 6: Frontend (TypeScript/React)

**Files:** `frontend/src/types/widget.ts`, `frontend/src/lib/widget-registry.ts`

### 6a. Add to the MetricKey union type

```typescript
export type MetricKey =
  | // ... existing keys ...
  | "approval_rate"
  | "rating_participation";
```

### 6b. Register in the widget registry

```typescript
export const METRIC_REGISTRY: Record<MetricKey, MetricMeta> = {
  // ... existing metrics ...
  approval_rate: {
    key: "approval_rate",
    label: "Approval Rate",
    description: "Percentage of rated runs that received positive feedback",
    tooltip: "Of all runs where a user left a rating...",
    category: "Performance",
    defaultChartType: "line",
    compatibleChartTypes: ["line", "area", "bar", "kpi"],
    format: "percent",
    validBreakdowns: ["team", "project", "agent_type", "model"],
    color: "#22c55e",
  },
};
```

Once registered, the metric automatically appears in the widget creation modal, grouped by category. Users can add it to any dashboard page with any compatible chart type.

---

## Verification

After making all changes:

1. **Build the stack:** `docker compose up --build -d`
2. **Run all tests:** `./scripts/test.sh`
3. **Wait for data:** The simulator generates events continuously. Within a few minutes, the new field will appear in ClickHouse.
4. **Test the metric:** Create a widget on the dashboard using the new metric.

---

## Production Deployment Concerns

The changes we made work seamlessly in development (fresh `docker compose up` recreates everything from scratch). A live production environment is different — data already exists, services can't all restart atomically, and schema changes hit real tables with billions of rows. Here's what to watch out for.

### The Big One: ClickHouse Schema Migration

**Problem:** In development, `001-tables.sql` runs via `docker-entrypoint-initdb.d`, which only executes on first container initialization. In production, the ClickHouse table already exists. The `CREATE TABLE IF NOT EXISTS` statement will simply do nothing — it won't add the new `user_rating` column.

**What you must do:**

Run an `ALTER TABLE` migration against the live ClickHouse instance *before* deploying the new aggregation-worker:

```sql
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS user_rating LowCardinality(Nullable(String));
```

This is an **online operation** in ClickHouse — it doesn't lock the table or rewrite existing data. MergeTree adds the column to new parts, and existing parts return `NULL` for the new column. But you should still:

- **Test the migration on a staging copy first.** Verify the column appears and existing queries still return correct results.
- **Coordinate timing.** The column must exist before the new aggregation-worker starts inserting rows with `user_rating` in the column list. If the worker tries to insert into a column that doesn't exist, it will error.
- **Plan for rollback.** If you need to revert, you can `ALTER TABLE agent_runs DROP COLUMN user_rating`. This is also an online operation. Data in that column is lost.

### Deployment Order Matters

The services have a dependency chain. Deploy in the wrong order and you'll get errors or data loss:

**Safe deployment order:**

1. **ClickHouse migration** — add the column first (see above)
2. **Aggregation Worker** — can now write `user_rating` to ClickHouse. It handles `None` gracefully for events from the old ingestion service that don't have the field.
3. **Ingestion Service** — the new Rust binary accepts `user_rating` in the JSON payload. Because the field is `Option<UserRating>`, the old event format (without `user_rating`) still deserializes fine. Events from senders that don't include the field will have `user_rating: None`.
4. **Analytics API** — the new metric queries work immediately; they'll return 0% or empty data until rated events flow through. No crash risk.
5. **Frontend** — the new metrics appear in the widget creation modal. Before data arrives, widgets will show 0% or empty charts — acceptable behavior.
6. **Simulator / event producers** — deploy last. Once deployed, events with `user_rating` start flowing through the pipeline.

**Why this order?** Each layer is designed to tolerate the *absence* of the new field (everything is `Option`/`Nullable`/optional). But no layer tolerates receiving data it can't store. So the storage layers (ClickHouse, aggregation-worker) must be ready before the producers (ingestion, simulator) start sending new data.

### Backward Compatibility

This change is **fully backward-compatible** because:

- **Ingestion (Rust):** `user_rating: Option<UserRating>` — serde skips missing fields in JSON, deserializing them as `None`. Old producers that don't send `user_rating` continue to work without changes.
- **Aggregation Worker (Python):** `data.get("user_rating")` returns `None` for events that lack the field. The ClickHouse insert sends `None`, which ClickHouse stores as `NULL`.
- **ClickHouse:** `Nullable(String)` — existing rows have `NULL`, which the `countIf(user_rating IS NOT NULL)` expressions correctly exclude.
- **Analytics API:** The `greatest(..., 1)` in the SQL expressions prevents division by zero when no rated events exist yet.
- **Frontend:** Widget registry entries are additive. Existing dashboard configurations don't reference the new metrics and are unaffected.

No event producers need to be updated simultaneously — the system gracefully degrades to "no rating data" until they are.

### Potential Pitfalls

**1. Redis Stream message format.**
The ingestion service serializes the full `AgentEvent` (including `user_rating`) to the Redis Stream. The aggregation worker deserializes it. If you deploy a new ingestion service but an *old* aggregation worker is still running, the old worker will ignore the `user_rating` field (Python's `data.get("user_rating")` just returns `None`). No crash, but the rating data is silently dropped until the worker is updated. This is acceptable for a transition period but you should not leave it like this for long.

**2. ClickHouse INSERT column mismatch.**
The aggregation worker explicitly lists columns in its `INSERT` statement. If the worker code includes `user_rating` in the column list but ClickHouse doesn't have that column yet, the insert will fail and events will not be written. This is the most dangerous failure mode — **always run the ALTER TABLE before deploying the worker.**

**3. Cache invalidation.**
The analytics API uses Redis caching for widget query results (see `redis_cache` in `widget.py`). After deploying, cached responses won't include the new metrics. This resolves itself when cache entries expire (controlled by `settings.cache_ttl_metrics`). If you need the new metrics visible immediately, flush the cache after deployment.

**4. Dashboard widget configurations stored in PostgreSQL.**
Custom page layouts are persisted in PostgreSQL. Existing pages won't show the new metrics — users must manually add widgets for `approval_rate` or `rating_participation`. No migration needed, but consider communicating the new metrics to users.

**5. Historical data will show NULL ratings.**
All rows inserted before the new field existed will have `user_rating = NULL`. The `approval_rate` metric naturally handles this (it only counts rated rows). But if you query a time range that spans the deployment boundary, the `rating_participation` metric will show a visible ramp-up from 0% to ~15% — this is expected behavior, not a bug. Consider noting the deployment date in a changelog so users understand the step change.

**6. ClickHouse partitioning and large tables.**
The `agent_runs` table is partitioned by month (`toYYYYMM(started_at)`). The `ALTER TABLE ADD COLUMN` is metadata-only for MergeTree — it doesn't rewrite data. But if you ever need to backfill `user_rating` for historical rows, you'd need to do a mutation (`ALTER TABLE agent_runs UPDATE user_rating = ... WHERE ...`), which *does* rewrite parts and can be expensive on large partitions. Avoid this unless truly necessary.

### Deployment Checklist

```
[ ] Run ALTER TABLE on ClickHouse (staging first, then production)
[ ] Deploy aggregation-worker (verify it starts without INSERT errors)
[ ] Deploy ingestion service
[ ] Deploy analytics-api
[ ] Deploy frontend
[ ] Deploy simulator / update event producers
[ ] Verify: query approval_rate widget — should return data after a few minutes
[ ] Verify: check ClickHouse for user_rating column with SELECT user_rating, count() FROM agent_runs WHERE user_rating IS NOT NULL GROUP BY user_rating
[ ] Optional: flush Redis cache if metrics need to be visible immediately
[ ] Communicate new metrics to users
```

---

## Summary of Files Changed

| Layer | Files | What changed |
|-------|-------|-------------|
| Simulator | `simulator/src/generators/events.ts` | Added `UserRating` type, `user_rating` to interface, `pickUserRating()` function, spread into end event |
| Ingestion | `ingestion/src/models/event.rs` | Added `UserRating` enum, `user_rating: Option<UserRating>` to struct |
| Ingestion | `ingestion/src/validation.rs` | Added `user_rating: None` to test fixture |
| ClickHouse | `init-scripts/clickhouse/001-tables.sql` | Added `user_rating LowCardinality(Nullable(String))` column |
| Aggregation | `aggregation-worker/app/consumer.py` | Added field to dataclass and parser |
| Aggregation | `aggregation-worker/app/writers/clickhouse.py` | Added to insert columns and row data |
| Analytics API | `analytics-api/app/services/widget_query.py` | Added 2 entries to `METRIC_REGISTRY` |
| Analytics API | `analytics-api/app/models/requests.py` | Added to both Literal types |
| Frontend | `frontend/src/types/widget.ts` | Added to `MetricKey` union |
| Frontend | `frontend/src/lib/widget-registry.ts` | Added 2 entries to `METRIC_REGISTRY` |

**Total: 10 files, 6 services, 2 new metrics derived from 1 new field.**
