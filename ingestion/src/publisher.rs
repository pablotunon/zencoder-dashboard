use redis::AsyncCommands;

use crate::models::event::{AgentEvent, EventType};

const STREAM_KEY: &str = "agent_events";

pub async fn publish_event(
    conn: &mut redis::aio::MultiplexedConnection,
    event: &AgentEvent,
) -> Result<(), redis::RedisError> {
    let event_json = serde_json::to_string(event).expect("failed to serialize event");

    // XADD agent_events * data <json>
    redis::cmd("XADD")
        .arg(STREAM_KEY)
        .arg("*")
        .arg("data")
        .arg(&event_json)
        .query_async::<String>(conn)
        .await?;

    // Update real-time counters
    update_realtime_counters(conn, event).await?;

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
