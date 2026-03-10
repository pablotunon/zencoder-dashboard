use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

use crate::AppState;

pub async fn health(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let redis_connected = match state.redis.get_multiplexed_async_connection().await {
        Ok(mut conn) => redis::cmd("PING")
            .query_async::<String>(&mut conn)
            .await
            .is_ok(),
        Err(_) => false,
    };

    let status = if redis_connected { "ok" } else { "degraded" };
    let code = if redis_connected {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        code,
        Json(json!({
            "status": status,
            "redis_connected": redis_connected,
        })),
    )
}
