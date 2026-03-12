use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::{get, post},
    Router,
};
use http_body_util::BodyExt;
use redis::AsyncCommands;
use serde_json::{json, Value};
use tower::ServiceExt;

fn redis_url() -> String {
    let host = std::env::var("REDIS_HOST").unwrap_or_else(|_| "redis".to_string());
    let port = std::env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    format!("redis://{}:{}", host, port)
}

fn build_app(client: redis::Client) -> Router {
    let state = ingestion::AppState { redis: client };
    Router::new()
        .route(
            "/ingest/events",
            post(ingestion::routes::events::ingest_events),
        )
        .route("/ingest/health", get(ingestion::routes::health::health))
        .with_state(state)
}

/// Helper: build a router with a mock Redis (connection will fail).
fn app_with_bad_redis() -> Router {
    let client = redis::Client::open("redis://localhost:19999").unwrap(); // bad port
    build_app(client)
}

/// Helper: build a router with a real Redis connection (for use in Docker).
fn app_with_real_redis() -> Router {
    let client = redis::Client::open(redis_url().as_str()).unwrap();
    build_app(client)
}

/// Helper: get a Redis connection for test setup/teardown.
async fn redis_conn() -> redis::aio::MultiplexedConnection {
    let client = redis::Client::open(redis_url().as_str()).unwrap();
    client.get_multiplexed_async_connection().await.unwrap()
}

// ING-I03: Redis unavailable → returns 503 when valid events need publishing
#[tokio::test]
async fn test_ingest_events_redis_unavailable_returns_503() {
    let app = app_with_bad_redis();

    let event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440000",
        "org_id": "org_acme",
        "team_id": "team_platform",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let body = json!({ "events": [event] });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(body["accepted"], 0);
    assert_eq!(body["rejected"], 1);
}

// ING-I04: GET /ingest/health reports Redis status (unhealthy when Redis down)
#[tokio::test]
async fn test_health_reports_redis_down() {
    let app = app_with_bad_redis();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/ingest/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(body["status"], "degraded");
    assert_eq!(body["redis_connected"], false);
}

// ING-I02: POST /ingest/events empty batch → 400
#[tokio::test]
async fn test_empty_batch_returns_400() {
    let app = app_with_bad_redis();

    let body = json!({ "events": [] });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["accepted"], 0);
}

// ING-U05: Batch of 101 events rejected
#[tokio::test]
async fn test_oversized_batch_returns_400() {
    let app = app_with_bad_redis();

    let event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440000",
        "org_id": "org_acme",
        "team_id": "team_platform",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let events: Vec<Value> = (0..101).map(|_| event.clone()).collect();
    let body = json!({ "events": events });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["accepted"], 0);
    assert_eq!(resp["rejected"], 101);
}

// ING-U03: Invalid agent_type rejected (deserialization error)
#[tokio::test]
async fn test_invalid_agent_type_rejected() {
    let app = app_with_bad_redis();

    let event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440000",
        "org_id": "org_acme",
        "team_id": "team_platform",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "invalid_type",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let body = json!({ "events": [event] });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // All events failed validation, Redis never touched → 202
    assert_eq!(response.status(), StatusCode::ACCEPTED);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["accepted"], 0);
    assert_eq!(resp["rejected"], 1);
    assert!(resp["errors"][0]["error"]
        .as_str()
        .unwrap()
        .contains("deserialization error"));
}

// ING-U06: Partial batch — invalid events rejected at validation, valid ones fail at Redis
#[tokio::test]
async fn test_partial_batch_mixed_valid_invalid() {
    let app = app_with_bad_redis();

    let valid_event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440000",
        "org_id": "org_acme",
        "team_id": "team_platform",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let invalid_event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440001",
        "org_id": "org_acme",
        "team_id": "team_platform",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "bad_type",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let body = json!({ "events": [valid_event, invalid_event] });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // The valid event passes validation but then Redis connection fails → 503
    // 1 invalid (deser error) + 1 valid but Redis down → all rejected
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["accepted"], 0);
    assert_eq!(resp["rejected"], 2);
    // Should have at least the deserialization error and Redis error
    assert!(resp["errors"].as_array().unwrap().len() >= 2);
}

// ING-U04: Batch of 100 events all validated (max batch accepted)
#[tokio::test]
async fn test_max_batch_size_accepted() {
    let app = app_with_bad_redis();

    let event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440000",
        "org_id": "org_acme",
        "team_id": "team_platform",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let events: Vec<Value> = (0..100).map(|_| event.clone()).collect();
    let body = json!({ "events": events });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Events are valid but Redis is down → 503
    // This verifies batch of 100 is accepted (not rejected as oversized)
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    // All 100 rejected because of Redis failure, not batch size
    assert_eq!(resp["rejected"], 100);
}

// ING-U02: Missing required field (run_id) → deserialization error
#[tokio::test]
async fn test_missing_required_field_rejected() {
    let app = app_with_bad_redis();

    let event = json!({
        // Missing run_id
        "org_id": "org_acme",
        "team_id": "team_platform",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let body = json!({ "events": [event] });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["accepted"], 0);
    assert_eq!(resp["rejected"], 1);
    assert!(resp["errors"][0]["error"]
        .as_str()
        .unwrap()
        .contains("deserialization error"));
}

// === Org validation tests (require real Redis — run via docker compose exec) ===

// ORG-I01: Event with registered org_id is accepted
#[tokio::test]
async fn test_registered_org_accepted() {
    let mut conn = redis_conn().await;
    let _: () = conn.sadd("valid_orgs", "org_test_valid").await.unwrap();

    let app = app_with_real_redis();

    let event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440099",
        "org_id": "org_test_valid",
        "team_id": "team_1",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let body = json!({ "events": [event] });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["accepted"], 1);
    assert_eq!(resp["rejected"], 0);

    // Cleanup
    let _: () = conn.srem("valid_orgs", "org_test_valid").await.unwrap();
}

// ORG-I02: Event with unregistered org_id is rejected
#[tokio::test]
async fn test_unregistered_org_rejected() {
    let app = app_with_real_redis();

    let event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440098",
        "org_id": "org_does_not_exist",
        "team_id": "team_1",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let body = json!({ "events": [event] });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["accepted"], 0);
    assert_eq!(resp["rejected"], 1);
    assert!(resp["errors"][0]["error"]
        .as_str()
        .unwrap()
        .contains("unknown org_id"));
}

// ORG-I03: Mixed batch — registered and unregistered orgs
#[tokio::test]
async fn test_mixed_org_batch() {
    let mut conn = redis_conn().await;
    let _: () = conn.sadd("valid_orgs", "org_test_mixed").await.unwrap();

    let app = app_with_real_redis();

    let valid_event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440097",
        "org_id": "org_test_mixed",
        "team_id": "team_1",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let invalid_org_event = json!({
        "run_id": "550e8400-e29b-41d4-a716-446655440096",
        "org_id": "org_unknown_xyz",
        "team_id": "team_1",
        "user_id": "user_1",
        "project_id": "proj_1",
        "agent_type": "coding",
        "event_type": "run_started",
        "timestamp": "2025-01-15T10:00:00Z"
    });

    let body = json!({ "events": [valid_event, invalid_org_event] });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/ingest/events")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let resp: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["accepted"], 1);
    assert_eq!(resp["rejected"], 1);

    // The rejected event should mention unknown org_id
    let errors = resp["errors"].as_array().unwrap();
    assert_eq!(errors.len(), 1);
    assert!(errors[0]["error"]
        .as_str()
        .unwrap()
        .contains("unknown org_id"));
    assert_eq!(errors[0]["index"], 1);

    // Cleanup
    let _: () = conn.srem("valid_orgs", "org_test_mixed").await.unwrap();
}

// ORG-I04: check_org_exists unit test with real Redis
#[tokio::test]
async fn test_check_org_exists_directly() {
    let mut conn = redis_conn().await;
    let _: () = conn.sadd("valid_orgs", "org_direct_test").await.unwrap();

    // Registered org returns true
    let exists = ingestion::validation::check_org_exists(&mut conn, "org_direct_test")
        .await
        .unwrap();
    assert!(exists);

    // Unregistered org returns false
    let exists = ingestion::validation::check_org_exists(&mut conn, "org_not_registered")
        .await
        .unwrap();
    assert!(!exists);

    // Cleanup
    let _: () = conn.srem("valid_orgs", "org_direct_test").await.unwrap();
}
