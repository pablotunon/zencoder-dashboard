use chrono::Utc;

use crate::models::event::AgentEvent;

const MAX_FUTURE_SECONDS: i64 = 5 * 60; // 5 minutes
const VALID_ORGS_KEY: &str = "valid_orgs";

/// Check if an org_id exists in the Redis `valid_orgs` set.
pub async fn check_org_exists(
    conn: &mut redis::aio::MultiplexedConnection,
    org_id: &str,
) -> Result<bool, redis::RedisError> {
    redis::cmd("SISMEMBER")
        .arg(VALID_ORGS_KEY)
        .arg(org_id)
        .query_async::<bool>(conn)
        .await
}

pub fn validate_event(event: &AgentEvent) -> Result<(), String> {
    // Required string fields must not be empty
    if event.org_id.is_empty() {
        return Err("org_id is required".to_string());
    }
    if event.team_id.is_empty() {
        return Err("team_id is required".to_string());
    }
    if event.user_id.is_empty() {
        return Err("user_id is required".to_string());
    }
    if event.project_id.is_empty() {
        return Err("project_id is required".to_string());
    }

    // Timestamp must not be too far in the future
    let now = Utc::now();
    let diff = event.timestamp.signed_duration_since(now);
    if diff.num_seconds() > MAX_FUTURE_SECONDS {
        return Err("timestamp is too far in the future (max 5 minutes)".to_string());
    }

    // cost_usd must be non-negative if present
    if let Some(cost) = event.cost_usd {
        if cost < 0.0 {
            return Err("cost_usd must be non-negative".to_string());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::event::{AgentType, EventType};
    use chrono::Duration;
    use rstest::rstest;
    use uuid::Uuid;

    fn make_valid_event() -> AgentEvent {
        AgentEvent {
            run_id: Uuid::new_v4(),
            org_id: "org_acme".to_string(),
            team_id: "team_platform".to_string(),
            user_id: "user_1".to_string(),
            project_id: "proj_1".to_string(),
            agent_type: AgentType::Coding,
            event_type: EventType::RunStarted,
            timestamp: Utc::now(),
            duration_ms: None,
            tokens_input: None,
            tokens_output: None,
            model: None,
            cost_usd: None,
            error_category: None,
            tools_used: None,
            queue_wait_ms: None,
        }
    }

    #[test]
    fn test_valid_event_passes() {
        let event = make_valid_event();
        assert!(validate_event(&event).is_ok());
    }

    #[rstest]
    #[case("org_id")]
    #[case("team_id")]
    #[case("user_id")]
    #[case("project_id")]
    fn test_missing_required_field_rejected(#[case] field: &str) {
        let mut event = make_valid_event();
        match field {
            "org_id" => event.org_id = "".to_string(),
            "team_id" => event.team_id = "".to_string(),
            "user_id" => event.user_id = "".to_string(),
            "project_id" => event.project_id = "".to_string(),
            _ => unreachable!(),
        }
        let result = validate_event(&event);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains(field));
    }

    #[test]
    fn test_future_timestamp_rejected() {
        let mut event = make_valid_event();
        event.timestamp = Utc::now() + Duration::minutes(10);
        let result = validate_event(&event);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("future"));
    }

    #[test]
    fn test_near_future_timestamp_accepted() {
        let mut event = make_valid_event();
        event.timestamp = Utc::now() + Duration::minutes(3);
        assert!(validate_event(&event).is_ok());
    }

    #[rstest]
    #[case(Some(-0.01), true)]
    #[case(Some(0.0), false)]
    #[case(Some(1.50), false)]
    #[case(None, false)]
    fn test_cost_validation(#[case] cost: Option<f64>, #[case] should_fail: bool) {
        let mut event = make_valid_event();
        event.cost_usd = cost;
        let result = validate_event(&event);
        assert_eq!(result.is_err(), should_fail);
    }
}
