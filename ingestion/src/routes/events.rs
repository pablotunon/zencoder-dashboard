use axum::{extract::State, http::StatusCode, Json};

use crate::models::event::{AgentEvent, EventBatch, EventError, IngestResponse};
use crate::publisher::publish_event;
use crate::validation::validate_event;
use crate::AppState;

const MAX_BATCH_SIZE: usize = 100;

pub async fn ingest_events(
    State(state): State<AppState>,
    Json(batch): Json<EventBatch>,
) -> (StatusCode, Json<IngestResponse>) {
    // Validate batch size
    if batch.events.is_empty() || batch.events.len() > MAX_BATCH_SIZE {
        return (
            StatusCode::BAD_REQUEST,
            Json(IngestResponse {
                accepted: 0,
                rejected: batch.events.len(),
                errors: vec![EventError {
                    index: 0,
                    error: format!(
                        "batch size must be between 1 and {} (got {})",
                        MAX_BATCH_SIZE,
                        batch.events.len()
                    ),
                }],
            }),
        );
    }

    // Phase 1: Deserialize and validate all events
    let mut validated: Vec<(usize, AgentEvent)> = Vec::new();
    let mut rejected = 0usize;
    let mut errors = Vec::new();

    for (i, raw_event) in batch.events.iter().enumerate() {
        // Deserialize
        let event: AgentEvent = match serde_json::from_value(raw_event.clone()) {
            Ok(e) => e,
            Err(e) => {
                rejected += 1;
                errors.push(EventError {
                    index: i,
                    error: format!("deserialization error: {}", e),
                });
                continue;
            }
        };

        // Validate
        if let Err(e) = validate_event(&event) {
            rejected += 1;
            errors.push(EventError {
                index: i,
                error: e,
            });
            continue;
        }

        validated.push((i, event));
    }

    // If no valid events, return early without touching Redis
    if validated.is_empty() {
        return (
            StatusCode::ACCEPTED,
            Json(IngestResponse {
                accepted: 0,
                rejected,
                errors,
            }),
        );
    }

    // Phase 2: Get Redis connection and publish valid events
    let mut conn = match state.redis.get_multiplexed_async_connection().await {
        Ok(conn) => conn,
        Err(e) => {
            tracing::error!("Failed to connect to Redis: {}", e);
            let total_rejected = rejected + validated.len();
            errors.push(EventError {
                index: 0,
                error: "Redis unavailable".to_string(),
            });
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(IngestResponse {
                    accepted: 0,
                    rejected: total_rejected,
                    errors,
                }),
            );
        }
    };

    let mut accepted = 0usize;

    for (i, event) in validated {
        match publish_event(&mut conn, &event).await {
            Ok(()) => {
                accepted += 1;
            }
            Err(e) => {
                tracing::error!("Failed to publish event to Redis: {}", e);
                rejected += 1;
                errors.push(EventError {
                    index: i,
                    error: "failed to publish event".to_string(),
                });
            }
        }
    }

    (
        StatusCode::ACCEPTED,
        Json(IngestResponse {
            accepted,
            rejected,
            errors,
        }),
    )
}
