#!/usr/bin/env bash
set -euo pipefail

# Run npm commands inside a Docker container matching the project's Node version.
# This updates package.json and package-lock.json on the host without installing
# Node locally, keeping the workflow fully dockerized.
#
# Usage:
#   ./scripts/npm.sh <service> <npm-args...>
#
# Examples:
#   ./scripts/npm.sh frontend install --save-dev @testing-library/dom
#   ./scripts/npm.sh frontend update
#   ./scripts/npm.sh simulator install lodash

SERVICE="${1:?Usage: ./scripts/npm.sh <service> <npm-args...>}"
shift

if [[ $# -eq 0 ]]; then
  echo "Error: No npm arguments provided."
  echo "Usage: ./scripts/npm.sh <service> <npm-args...>"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_DIR="$REPO_ROOT/$SERVICE"

if [[ ! -d "$SERVICE_DIR" ]]; then
  echo "Error: Service directory '$SERVICE_DIR' does not exist."
  exit 1
fi

if [[ ! -f "$SERVICE_DIR/package.json" ]]; then
  echo "Error: No package.json found in '$SERVICE_DIR'."
  exit 1
fi

# Detect the Node image version from the service's Dockerfile
NODE_IMAGE="node:24-alpine"
if [[ -f "$SERVICE_DIR/Dockerfile" ]]; then
  FROM_LINE=$(grep -m1 '^FROM node:' "$SERVICE_DIR/Dockerfile" || true)
  if [[ -n "$FROM_LINE" ]]; then
    NODE_IMAGE=$(echo "$FROM_LINE" | awk '{print $2}')
  fi
fi

echo "=== $SERVICE: npm $* ==="
echo "Using image: $NODE_IMAGE"
echo ""

docker run --rm \
  -v "$SERVICE_DIR":/app \
  -w /app \
  "$NODE_IMAGE" \
  npm "$@"
