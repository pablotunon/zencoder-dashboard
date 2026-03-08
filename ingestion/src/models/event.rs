use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Coding,
    Review,
    Testing,
    Ci,
    Debugging,
    General,
}

impl std::fmt::Display for AgentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Coding => write!(f, "coding"),
            Self::Review => write!(f, "review"),
            Self::Testing => write!(f, "testing"),
            Self::Ci => write!(f, "ci"),
            Self::Debugging => write!(f, "debugging"),
            Self::General => write!(f, "general"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    RunStarted,
    RunCompleted,
    RunFailed,
}

impl std::fmt::Display for EventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RunStarted => write!(f, "run_started"),
            Self::RunCompleted => write!(f, "run_completed"),
            Self::RunFailed => write!(f, "run_failed"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCategory {
    Timeout,
    RateLimit,
    ContextOverflow,
    ToolError,
    InternalError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub run_id: Uuid,
    pub org_id: String,
    pub team_id: String,
    pub user_id: String,
    pub project_id: String,
    pub agent_type: AgentType,
    pub event_type: EventType,
    pub timestamp: DateTime<Utc>,
    pub duration_ms: Option<u64>,
    pub tokens_input: Option<u64>,
    pub tokens_output: Option<u64>,
    pub model: Option<String>,
    pub cost_usd: Option<f64>,
    pub error_category: Option<ErrorCategory>,
    pub tools_used: Option<Vec<String>>,
    pub queue_wait_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct EventBatch {
    pub events: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct EventError {
    pub index: usize,
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct IngestResponse {
    pub accepted: usize,
    pub rejected: usize,
    pub errors: Vec<EventError>,
}
