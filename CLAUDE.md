# CLAUDE.md - Development Guidelines

This file provides project-specific commands and coding style requirements for the Agenthub repository.

## Branch Port Setup (REQUIRED before first `docker-compose up`)
Each branch needs unique host ports so multiple branches can run simultaneously.

- **First time on a new branch**: `./scripts/setup-ports.sh` — auto-assigns the next free port offset
- **Check current ports**: `./scripts/setup-ports.sh --status`
- **Use specific offset**: `./scripts/setup-ports.sh --offset 200`

This writes `.ports.env` and `.env` (both gitignored) which docker-compose reads automatically. Ports are `base + offset`:
- nginx: `8080 + offset`, Redis: `6379 + offset`, PostgreSQL: `5432 + offset`
- ClickHouse HTTP: `8123 + offset`, ClickHouse native: `9000 + offset`

Port assignments are tracked in `~/.agenthub-ports.json`. Stale entries (deleted worktrees) are cleaned up automatically.

## Build and Environment
- **Full Stack (Docker)**: `docker-compose up --build -d`
- **Stop All**: `docker-compose down`
- **Rebuild One Service**: `docker-compose up --build -d <service_name>` (e.g., `ingestion`, `analytics-api`, `aggregation-worker`, `simulator`, `frontend`)

## Testing Commands
All tests MUST be executed within Docker containers.
- **All services**: `./scripts/test.sh`
- **Single service**: `./scripts/test.sh <service_name>` (e.g., `./scripts/test.sh ingestion`)
- **Simulator**: `docker-compose exec simulator npm run test`
- **Ingestion**: `docker-compose exec ingestion cargo test`
- **Aggregation Worker**: `docker-compose exec aggregation-worker pytest`
- **Analytics API**: `docker-compose exec analytics-api pytest`

## Linting and Formatting
All linting and formatting MUST be executed within Docker containers.
- **Simulator (TS)**: `docker-compose exec simulator npm run lint`
- **Ingestion (Rust)**: `docker-compose exec ingestion cargo fmt` and `docker-compose exec ingestion cargo clippy`
- **Python**: `docker-compose exec aggregation-worker pytest` (for validation)

## Development Constraints
- **NO LOCAL INSTALLS**: Never run `npm install`, `pip install`, or `cargo build` on the host machine. All dependencies and builds must stay within Docker.
- **DOCKERIZED WORKFLOW**: Use `docker-compose exec` for all development tasks (tests, linting, etc.).
- **ENVIRONMENT**: Only use `docker-compose` to manage the running and testing environments.

## Code Style Guidelines
- **TypeScript**: Use ES modules, functional patterns, and strict typing. 
- **Rust**: Follow idiomatic Rust (clippy/fmt), use `tokio` for async, and `axum` for APIs.
- **Python**: Use `FastAPI` for APIs, `pydantic` for validation, and `pytest` for testing.
- **Error Handling**: 
  - Rust: Use `Result` and `Error` traits.
  - Python: Use exceptions and FastAPI's HTTP exceptions.
  - TS: Use `try/catch` and descriptive error messages.
- **Architecture**: Microservices-based, communicating via Redis/Postgres/ClickHouse.
