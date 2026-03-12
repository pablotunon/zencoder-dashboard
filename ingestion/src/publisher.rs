use redis::AsyncCommands;

use crate::models::event::{AgentEvent, EventType};

const STREAM_KEY: &str = "agent_events";
const MAX_RETRIES: u32 = 3;
const RETRY_BASE_MS: u64 = 50;

pub async fn publish_event(
    conn: &mut redis::aio::MultiplexedConnection,
    event: &AgentEvent,
) -> Result<(), redis::RedisError> {
    let event_json = serde_json::to_string(event).expect("failed to serialize event");

    // XADD agent_events * data <json> — with exponential backoff retry
    let mut last_err = None;
    for attempt in 0..MAX_RETRIES {
        match redis::cmd("XADD")
            .arg(STREAM_KEY)
            .arg("*")
            .arg("data")
            .arg(&event_json)
            .query_async::<String>(conn)
            .await
        {
            Ok(_) => {
                last_err = None;
                break;
            }
            Err(e) => {
                tracing::warn!(
                    "XADD attempt {}/{} failed: {}",
                    attempt + 1,
                    MAX_RETRIES,
                    e
                );
                last_err = Some(e);
                if attempt + 1 < MAX_RETRIES {
                    let delay = std::time::Duration::from_millis(RETRY_BASE_MS * 2u64.pow(attempt));
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    if let Some(e) = last_err {
        return Err(e);
    }

    // Update real-time counters (best-effort, don't fail the publish)
    if let Err(e) = update_realtime_counters(conn, event).await {
        tracing::warn!("Failed to update real-time counters: {}", e);
    }

    Ok(())
}

async fn update_realtime_counters(
    conn: &mut redis::aio::MultiplexedConnection,
    event: &AgentEvent,
) -> Result<(), redis::RedisError> {
    let active_key = format!("rt:{}:active_runs", event.org_id);
    let today_key = format!("rt:{}:today_runs", event.org_id);

    match event.event_type {
        EventType::RunStarted => {
            conn.incr::<_, i64, i64>(&active_key, 1).await?;
            conn.incr::<_, i64, i64>(&today_key, 1).await?;
        }
        EventType::RunCompleted | EventType::RunFailed => {
            conn.decr::<_, i64, i64>(&active_key, 1).await?;
        }
    }

    Ok(())
}
