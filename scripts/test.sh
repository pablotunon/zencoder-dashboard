#!/usr/bin/env bash
set -euo pipefail

# Run unit/integration tests for services, or e2e tests against the full stack.
#
# Usage:
#   ./scripts/test.sh                   # run all service unit tests
#   ./scripts/test.sh simulator         # run tests for one service
#   ./scripts/test.sh ingestion api     # run tests for specific services
#   ./scripts/test.sh e2e               # run Playwright e2e tests (requires stack running)

SERVICES=("simulator" "ingestion" "aggregation-worker" "analytics-api" "frontend")

# Map service name to its test command
test_cmd() {
  case "$1" in
    simulator)          echo "npm run test" ;;
    ingestion)          echo "cargo test" ;;
    aggregation-worker) echo "pytest" ;;
    analytics-api)      echo "pytest" ;;
    frontend)           echo "npm run test" ;;
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

run_e2e() {
  echo "=== Running E2E tests (Playwright) ==="
  # Build e2e image separately so --build on `run` doesn't rebuild (and
  # potentially recreate) already-running services like analytics-api.
  docker compose --profile testing build e2e
  docker compose --profile testing run --rm e2e
  echo ""
}

# If arguments given, test only those services; otherwise test all
if [[ $# -gt 0 ]]; then
  targets=("$@")
else
  targets=("${SERVICES[@]}")
fi

# Handle e2e separately
if [[ " ${targets[*]} " == *" e2e "* ]]; then
  run_e2e
  # Remove e2e from targets so it doesn't hit the service loop
  remaining=()
  for t in "${targets[@]}"; do
    [[ "$t" != "e2e" ]] && remaining+=("$t")
  done
  targets=("${remaining[@]}")
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
