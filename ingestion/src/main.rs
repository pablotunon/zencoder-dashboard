use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

async fn health() -> Json<Value> {
    Json(json!({"status": "ok", "message": "Ingestion service stub - Phase 0"}))
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/ingest/health", get(health));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8001")
        .await
        .unwrap();
    println!("Ingestion service listening on :8001");
    axum::serve(listener, app).await.unwrap();
}
