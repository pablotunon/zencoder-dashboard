pub mod config;
pub mod models;
pub mod publisher;
pub mod routes;
pub mod validation;

#[derive(Clone)]
pub struct AppState {
    pub redis: redis::Client,
}
