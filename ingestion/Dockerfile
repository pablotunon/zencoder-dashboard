# ---------- base: rust toolchain ----------
FROM rust:1.94-slim AS base
WORKDIR /app

# ---------- dev: full toolchain + all source for testing ----------
FROM base AS dev
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
COPY src/ ./src/
COPY tests/ ./tests/
RUN cargo build
RUN cargo test --no-run
EXPOSE 8001
CMD ["./target/debug/ingestion"]

# ---------- builder: release binary ----------
FROM base AS builder
COPY Cargo.toml ./
COPY src/ ./src/
RUN cargo build --release

# ---------- prod: minimal runtime ----------
FROM debian:trixie-slim AS prod
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/ingestion /usr/local/bin/ingestion
EXPOSE 8001
CMD ["ingestion"]
