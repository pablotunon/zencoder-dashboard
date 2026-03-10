use axum::{
    routing::{get, post},
    Router,
};
use ingestion::{config, routes, AppState};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ingestion=info".into()),
        )
        .init();

    let cfg = config::Config::from_env();

    let redis_client =
        redis::Client::open(cfg.redis_url.as_str()).expect("Failed to create Redis client");

    let state = AppState {
        redis: redis_client,
    };

    let app = Router::new()
        .route("/ingest/events", post(routes::events::ingest_events))
        .route("/ingest/health", get(routes::health::health))
        .with_state(state);

    let addr = format!("{}:{}", cfg.host, cfg.port);
    tracing::info!("Ingestion service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
