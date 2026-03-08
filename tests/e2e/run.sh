#!/usr/bin/env bash
# E2E Smoke Tests for AgentHub Analytics
# Run with: ./tests/e2e/run.sh
# Prerequisite: docker compose up (all services running)

set -euo pipefail

NGINX_URL="${NGINX_URL:-http://localhost:8080}"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${GREEN}PASS${NC} $1"
}

log_fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${RED}FAIL${NC} $1"
  if [ -n "${2:-}" ]; then
    echo -e "       ${RED}$2${NC}"
  fi
}

log_info() {
  echo -e "  ${YELLOW}INFO${NC} $1"
}

# --------------------------------------------------------------------------
# E2E-01: All containers healthy after docker compose up
# --------------------------------------------------------------------------
echo ""
echo "=== E2E-01: Container Health Checks ==="

check_health() {
  local name="$1"
  local url="$2"
  local max_attempts="${3:-12}"
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if status_code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null); then
      if [ "$status_code" = "200" ]; then
        log_pass "$name health check (HTTP $status_code)"
        return 0
      fi
    fi
    attempt=$((attempt + 1))
    sleep 5
  done

  log_fail "$name health check" "No healthy response after $max_attempts attempts"
  return 1
}

# Check ingestion health
check_health "Ingestion service" "${NGINX_URL}/ingest/health"

# Check analytics API health
check_health "Analytics API" "${NGINX_URL}/api/health"

# Check frontend (serves HTML)
frontend_status=$(curl -sf -o /dev/null -w "%{http_code}" "${NGINX_URL}/" 2>/dev/null || echo "000")
if [ "$frontend_status" = "200" ]; then
  log_pass "Frontend accessible (HTTP $frontend_status)"
else
  log_fail "Frontend accessible" "HTTP $frontend_status"
fi

# Verify analytics API dependency status
health_body=$(curl -sf "${NGINX_URL}/api/health" 2>/dev/null || echo '{}')
for dep in clickhouse postgres redis; do
  dep_status=$(echo "$health_body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dependencies',{}).get('$dep','unknown'))" 2>/dev/null || echo "unknown")
  if [ "$dep_status" = "connected" ]; then
    log_pass "Analytics API dependency: $dep ($dep_status)"
  else
    log_fail "Analytics API dependency: $dep" "Status: $dep_status"
  fi
done

# --------------------------------------------------------------------------
# E2E-02: POST events to ingestion -> query via analytics API
# --------------------------------------------------------------------------
echo ""
echo "=== E2E-02: Write Path -> Aggregation -> Read Path ==="

# Generate a unique org_id marker for tracking (use existing org_acme)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 1. POST a batch of test events
EVENT_BATCH=$(cat <<'EVENTS_JSON'
{
  "events": [
    {
      "run_id": "e2e-test-001",
      "org_id": "org_acme",
      "team_id": "team_platform",
      "user_id": "user_001",
      "project_id": "proj_001",
      "agent_type": "coding",
      "event_type": "run_started",
      "timestamp": "__TIMESTAMP__"
    },
    {
      "run_id": "e2e-test-001",
      "org_id": "org_acme",
      "team_id": "team_platform",
      "user_id": "user_001",
      "project_id": "proj_001",
      "agent_type": "coding",
      "event_type": "run_completed",
      "timestamp": "__TIMESTAMP__",
      "duration_ms": 15000,
      "tokens_input": 5000,
      "tokens_output": 2000,
      "model": "claude-3",
      "cost_usd": 0.05,
      "tools_used": ["file_edit", "terminal"],
      "queue_wait_ms": 200
    },
    {
      "run_id": "e2e-test-002",
      "org_id": "org_acme",
      "team_id": "team_backend",
      "user_id": "user_002",
      "project_id": "proj_002",
      "agent_type": "review",
      "event_type": "run_started",
      "timestamp": "__TIMESTAMP__"
    },
    {
      "run_id": "e2e-test-002",
      "org_id": "org_acme",
      "team_id": "team_backend",
      "user_id": "user_002",
      "project_id": "proj_002",
      "agent_type": "review",
      "event_type": "run_completed",
      "timestamp": "__TIMESTAMP__",
      "duration_ms": 8000,
      "tokens_input": 3000,
      "tokens_output": 1500,
      "model": "claude-3",
      "cost_usd": 0.03,
      "tools_used": ["file_read"],
      "queue_wait_ms": 100
    },
    {
      "run_id": "e2e-test-003",
      "org_id": "org_acme",
      "team_id": "team_frontend",
      "user_id": "user_003",
      "project_id": "proj_003",
      "agent_type": "testing",
      "event_type": "run_started",
      "timestamp": "__TIMESTAMP__"
    },
    {
      "run_id": "e2e-test-003",
      "org_id": "org_acme",
      "team_id": "team_frontend",
      "user_id": "user_003",
      "project_id": "proj_003",
      "agent_type": "testing",
      "event_type": "run_failed",
      "timestamp": "__TIMESTAMP__",
      "duration_ms": 30000,
      "tokens_input": 8000,
      "tokens_output": 4000,
      "model": "claude-3",
      "cost_usd": 0.08,
      "error_category": "timeout",
      "tools_used": ["terminal"],
      "queue_wait_ms": 500
    }
  ]
}
EVENTS_JSON
)

# Replace timestamp placeholder
EVENT_BATCH=$(echo "$EVENT_BATCH" | sed "s/__TIMESTAMP__/$TIMESTAMP/g")

ingest_response=$(curl -sf -X POST "${NGINX_URL}/ingest/events" \
  -H "Content-Type: application/json" \
  -d "$EVENT_BATCH" 2>/dev/null || echo '{"error": "request failed"}')

accepted=$(echo "$ingest_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accepted', 0))" 2>/dev/null || echo "0")
rejected=$(echo "$ingest_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('rejected', 0))" 2>/dev/null || echo "0")

if [ "$accepted" = "6" ] && [ "$rejected" = "0" ]; then
  log_pass "Ingestion accepted 6/6 events"
else
  log_fail "Ingestion accepted events" "accepted=$accepted rejected=$rejected response=$ingest_response"
fi

# 2. Wait for aggregation worker to process events
log_info "Waiting 15s for aggregation worker to process events..."
sleep 15

# 3. Query the overview endpoint
overview_response=$(curl -sf "${NGINX_URL}/api/metrics/overview?period=7d" 2>/dev/null || echo '{}')
overview_status=$?

if [ $overview_status -eq 0 ] && [ "$overview_response" != "{}" ]; then
  # Check that response contains expected fields
  has_kpis=$(echo "$overview_response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
has = 'kpi_cards' in d and 'usage_trend' in d and 'team_breakdown' in d
print('yes' if has else 'no')
" 2>/dev/null || echo "no")

  if [ "$has_kpis" = "yes" ]; then
    log_pass "Overview endpoint returns valid response with KPIs"
  else
    log_fail "Overview endpoint response structure" "Missing expected fields"
  fi

  # Check total_runs is > 0 (data exists from simulator + our test events)
  total_runs=$(echo "$overview_response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('kpi_cards', {}).get('total_runs', {}).get('value', 0))
" 2>/dev/null || echo "0")

  if [ "$total_runs" != "0" ]; then
    log_pass "Overview shows total_runs=$total_runs (data flowing)"
  else
    log_fail "Overview total_runs" "Expected > 0, got $total_runs"
  fi
else
  log_fail "Overview endpoint" "Failed to fetch or empty response"
fi

# 4. Query with team filter
filtered_response=$(curl -sf "${NGINX_URL}/api/metrics/overview?period=90d&teams=platform" 2>/dev/null || echo '{}')
if [ "$filtered_response" != "{}" ]; then
  log_pass "Overview endpoint with team filter returns data"
else
  log_fail "Overview endpoint with team filter" "Empty response"
fi

# 5. Query other endpoints
for endpoint in usage cost performance; do
  ep_response=$(curl -sf "${NGINX_URL}/api/metrics/${endpoint}?period=30d" 2>/dev/null || echo '{}')
  if [ "$ep_response" != "{}" ]; then
    log_pass "GET /api/metrics/${endpoint} returns data"
  else
    log_fail "GET /api/metrics/${endpoint}" "Empty response"
  fi
done

# 6. Query org endpoint
org_response=$(curl -sf "${NGINX_URL}/api/orgs/current" 2>/dev/null || echo '{}')
has_org=$(echo "$org_response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('yes' if d.get('org_id') and d.get('teams') else 'no')
" 2>/dev/null || echo "no")

if [ "$has_org" = "yes" ]; then
  log_pass "GET /api/orgs/current returns org with teams"
else
  log_fail "GET /api/orgs/current" "Missing org_id or teams"
fi

# --------------------------------------------------------------------------
# E2E-03: Dashboard accessible at http://localhost
# --------------------------------------------------------------------------
echo ""
echo "=== E2E-03: Dashboard Accessibility ==="

# Check frontend serves HTML
html_response=$(curl -sf "${NGINX_URL}/" 2>/dev/null || echo "")
if echo "$html_response" | grep -qi "<!doctype html\|<html"; then
  log_pass "Frontend serves HTML page"
else
  log_fail "Frontend serves HTML" "Response is not HTML"
fi

# Check static assets are loadable (JS bundle)
js_files=$(echo "$html_response" | grep -oP 'src="[^"]*\.js"' | head -3 || true)
if [ -n "$js_files" ]; then
  log_pass "Frontend HTML references JS bundles"
else
  log_fail "Frontend JS bundles" "No .js references found in HTML"
fi

# Check API proxy works through nginx
proxy_health=$(curl -sf -o /dev/null -w "%{http_code}" "${NGINX_URL}/api/health" 2>/dev/null || echo "000")
if [ "$proxy_health" = "200" ]; then
  log_pass "nginx proxies /api/* to analytics-api"
else
  log_fail "nginx API proxy" "HTTP $proxy_health"
fi

proxy_ingest=$(curl -sf -o /dev/null -w "%{http_code}" "${NGINX_URL}/ingest/health" 2>/dev/null || echo "000")
if [ "$proxy_ingest" = "200" ]; then
  log_pass "nginx proxies /ingest/* to ingestion"
else
  log_fail "nginx ingestion proxy" "HTTP $proxy_ingest"
fi

# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------
echo ""
echo "==============================="
echo -e "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo "==============================="
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi
exit 0
