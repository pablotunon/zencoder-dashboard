use chrono::Utc;

use crate::models::event::AgentEvent;

const MAX_FUTURE_SECONDS: i64 = 5 * 60; // 5 minutes

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

    // ING-U01: Valid event passes schema validation
    #[test]
    fn test_valid_event_passes() {
        let event = make_valid_event();
        assert!(validate_event(&event).is_ok());
    }

    // ING-U02: Missing required fields rejected
    #[test]
    fn test_missing_org_id_rejected() {
        let mut event = make_valid_event();
        event.org_id = "".to_string();
        let result = validate_event(&event);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("org_id"));
    }

    #[test]
    fn test_missing_team_id_rejected() {
        let mut event = make_valid_event();
        event.team_id = "".to_string();
        assert!(validate_event(&event).is_err());
    }

    #[test]
    fn test_missing_user_id_rejected() {
        let mut event = make_valid_event();
        event.user_id = "".to_string();
        assert!(validate_event(&event).is_err());
    }

    #[test]
    fn test_missing_project_id_rejected() {
        let mut event = make_valid_event();
        event.project_id = "".to_string();
        assert!(validate_event(&event).is_err());
    }

    // ING-U03: Invalid agent_type rejected — tested via serde deserialization
    // (the enum won't deserialize an invalid value)

    // ING-U07: Event timestamp in the future rejected
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

    // ING-U08: cost_usd must be non-negative
    #[test]
    fn test_negative_cost_rejected() {
        let mut event = make_valid_event();
        event.cost_usd = Some(-0.01);
        let result = validate_event(&event);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cost_usd"));
    }

    #[test]
    fn test_zero_cost_accepted() {
        let mut event = make_valid_event();
        event.cost_usd = Some(0.0);
        assert!(validate_event(&event).is_ok());
    }

    #[test]
    fn test_positive_cost_accepted() {
        let mut event = make_valid_event();
        event.cost_usd = Some(1.50);
        assert!(validate_event(&event).is_ok());
    }
}
