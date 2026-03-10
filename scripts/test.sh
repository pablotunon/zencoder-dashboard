#!/usr/bin/env bash
set -euo pipefail

# Run tests for all services (or a specific one) via docker compose.
#
# Usage:
#   ./scripts/test.sh              # run all service tests
#   ./scripts/test.sh simulator    # run tests for one service
#   ./scripts/test.sh ingestion analytics-api  # run tests for specific services

SERVICES=("simulator" "ingestion" "aggregation-worker" "analytics-api")

# Map service name to its test command
test_cmd() {
  case "$1" in
    simulator)          echo "npm run test" ;;
    ingestion)          echo "cargo test" ;;
    aggregation-worker) echo "pytest" ;;
    analytics-api)      echo "pytest" ;;
    *)                  echo ""; return 1 ;;
  esac
}

run_tests() {
  local service="$1"
  local cmd
  cmd=$(test_cmd "$service")
  if [[ -z "$cmd" ]]; then
    echo "Unknown service: $service"
    return 1
  fi

  echo "=== Testing $service ==="
  # shellcheck disable=SC2086
  docker compose exec -T "$service" $cmd
  echo ""
}

# If arguments given, test only those services; otherwise test all
if [[ $# -gt 0 ]]; then
  targets=("$@")
else
  targets=("${SERVICES[@]}")
fi

failed=()
for svc in "${targets[@]}"; do
  if ! run_tests "$svc"; then
    failed+=("$svc")
  fi
done

if [[ ${#failed[@]} -gt 0 ]]; then
  echo "FAILED: ${failed[*]}"
  exit 1
fi

echo "All tests passed."
