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
