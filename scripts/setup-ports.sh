#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# setup-ports.sh — Configure unique host ports for branch isolation.
#
# WHAT THIS DOES:
#   Each git branch gets a unique PORT_OFFSET (0, 100, 200, ...) so that
#   multiple branches can run their full Docker stack simultaneously without
#   port conflicts. A global registry at ~/.agenthub-ports.json tracks which
#   offsets are in use.
#
# USAGE:
#   ./scripts/setup-ports.sh              # auto-assign next free offset
#   ./scripts/setup-ports.sh --offset 0   # use a specific offset
#   ./scripts/setup-ports.sh --status     # show current port assignments
#
# PORT MAPPING (base + offset):
#   nginx:              8080 + offset  (main entry point)
#   Redis:              6379 + offset
#   PostgreSQL:         5432 + offset
#   ClickHouse HTTP:    8123 + offset
#   ClickHouse native:  9000 + offset
#
# EXAMPLE:
#   Offset 0   → nginx at :8080, postgres at :5432
#   Offset 100 → nginx at :8180, postgres at :5532
#   Offset 200 → nginx at :8280, postgres at :5632
#
# FILES:
#   .env                         — gitignored, auto-read by docker-compose
#   ~/.agenthub-ports.json       — global registry (not in repo)
# ============================================================================

REGISTRY="$HOME/.agenthub-ports.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
MARKER_BEGIN="# --- MANAGED BY setup-ports.sh (do not edit below) ---"
MARKER_END="# --- END setup-ports.sh ---"
OFFSET_INCREMENT=100
MAX_OFFSET=57300  # keeps highest port (9000+57300=66300) under 65535... actually let's be safe

# Base ports
BASE_NGINX=8080
BASE_REDIS=6379
BASE_POSTGRES=5432
BASE_CLICKHOUSE_HTTP=8123
BASE_CLICKHOUSE_NATIVE=9000

# The highest base port is 9000. Max port is 65535.
# Max offset = 65535 - 9000 = 56535, rounded down to nearest 100.
MAX_OFFSET=56500

# --- Helpers ---------------------------------------------------------------

ensure_registry() {
  if [[ ! -f "$REGISTRY" ]]; then
    echo '[]' > "$REGISTRY"
  fi
}

get_branch_name() {
  git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

# Remove entries whose worktree path no longer exists.
cleanup_registry() {
  ensure_registry
  local tmp
  tmp=$(mktemp)
  # Keep entries where the path still exists
  python3 -c "
import json, os, sys
with open('$REGISTRY') as f:
    entries = json.load(f)
cleaned = [e for e in entries if os.path.isdir(e.get('path', ''))]
with open('$tmp', 'w') as f:
    json.dump(cleaned, f, indent=2)
"
  mv "$tmp" "$REGISTRY"
}

# Find the next free offset (0, 100, 200, ...).
next_free_offset() {
  ensure_registry
  python3 -c "
import json
with open('$REGISTRY') as f:
    entries = json.load(f)
used = {e['offset'] for e in entries}
offset = 0
while offset in used and offset <= $MAX_OFFSET:
    offset += $OFFSET_INCREMENT
if offset > $MAX_OFFSET:
    print('ERROR')
else:
    print(offset)
"
}

# Check if an offset is already taken by another worktree.
is_offset_taken() {
  local offset="$1"
  ensure_registry
  python3 -c "
import json
with open('$REGISTRY') as f:
    entries = json.load(f)
for e in entries:
    if e['offset'] == $offset and e['path'] != '$PROJECT_DIR':
        print(e['path'])
        exit(0)
print('')
"
}

# Update the registry: add/update entry for this worktree.
update_registry() {
  local offset="$1"
  local branch="$2"
  ensure_registry
  python3 -c "
import json
with open('$REGISTRY') as f:
    entries = json.load(f)
# Remove existing entry for this path
entries = [e for e in entries if e.get('path') != '$PROJECT_DIR']
# Add new entry
entries.append({
    'path': '$PROJECT_DIR',
    'branch': '$branch',
    'offset': $offset
})
with open('$REGISTRY', 'w') as f:
    json.dump(entries, f, indent=2)
"
}

# Write port variables into .env (gitignored, auto-read by docker-compose).
# Uses marker comments to replace only its own section, preserving manual variables.
write_env() {
  local offset="$1"
  local branch="$2"

  local nginx=$((BASE_NGINX + offset))
  local redis=$((BASE_REDIS + offset))
  local postgres=$((BASE_POSTGRES + offset))
  local ch_http=$((BASE_CLICKHOUSE_HTTP + offset))
  local ch_native=$((BASE_CLICKHOUSE_NATIVE + offset))

  local project_name
  project_name="agenthub-$(echo "$branch" | tr -cs '[:alnum:]' '-' | sed 's/-$//')"

  local block
  block="$MARKER_BEGIN
# PORT_OFFSET=${offset} (base ports + this value)
COMPOSE_PROJECT_NAME=${project_name}
HOST_PORT_NGINX=${nginx}
HOST_PORT_REDIS=${redis}
HOST_PORT_POSTGRES=${postgres}
HOST_PORT_CLICKHOUSE_HTTP=${ch_http}
HOST_PORT_CLICKHOUSE_NATIVE=${ch_native}
$MARKER_END"

  if [[ ! -f "$ENV_FILE" ]]; then
    # No .env yet — create with just the managed block
    printf '%s\n' "$block" > "$ENV_FILE"
  elif grep -qF "$MARKER_BEGIN" "$ENV_FILE"; then
    # Replace existing managed block
    local tmp
    tmp=$(mktemp)
    python3 -c "
import sys
content = open('$ENV_FILE').read()
begin = '$MARKER_BEGIN'
end = '$MARKER_END'
i = content.index(begin)
j = content.index(end) + len(end)
# strip trailing newline after end marker if present
if j < len(content) and content[j] == '\n':
    j += 1
new_block = '''$block
'''
sys.stdout.write(content[:i] + new_block + content[j:])
" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    # .env exists but no managed block — append it
    printf '\n%s\n' "$block" >> "$ENV_FILE"
  fi
}

show_status() {
  ensure_registry
  cleanup_registry
  echo "=== Agenthub Port Registry ==="
  echo "Registry file: $REGISTRY"
  echo ""
  python3 -c "
import json
with open('$REGISTRY') as f:
    entries = json.load(f)
if not entries:
    print('  (no branches registered)')
else:
    for e in sorted(entries, key=lambda x: x['offset']):
        nginx = 8080 + e['offset']
        print(f\"  offset={e['offset']:>5}  nginx=:{nginx}  branch={e['branch']}\")
        print(f\"               path={e['path']}\")
"
  echo ""

  if [[ -f "$ENV_FILE" ]]; then
    echo "=== This Branch ==="
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    echo "  Branch:     $(get_branch_name)"
    echo "  Project:    ${COMPOSE_PROJECT_NAME:-?}"
    echo "  nginx:      :${HOST_PORT_NGINX:-?}"
    echo "  Redis:      :${HOST_PORT_REDIS:-?}"
    echo "  PostgreSQL: :${HOST_PORT_POSTGRES:-?}"
    echo "  ClickHouse: :${HOST_PORT_CLICKHOUSE_HTTP:-?} (HTTP), :${HOST_PORT_CLICKHOUSE_NATIVE:-?} (native)"
  else
    echo "This branch has no .env yet. Run: ./scripts/setup-ports.sh"
  fi
}

# --- Main ------------------------------------------------------------------

main() {
  local requested_offset=""
  local show_status_flag=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --offset)
        requested_offset="$2"
        shift 2
        ;;
      --status)
        show_status_flag=true
        shift
        ;;
      -h|--help)
        sed -n '3,/^# ====/p' "$0" | head -n -1 | sed 's/^# //' | sed 's/^#//'
        exit 0
        ;;
      *)
        echo "Unknown option: $1"
        echo "Usage: $0 [--offset N] [--status] [--help]"
        exit 1
        ;;
    esac
  done

  if $show_status_flag; then
    show_status
    exit 0
  fi

  # Clean up stale entries first
  cleanup_registry

  local branch
  branch="$(get_branch_name)"

  local offset
  if [[ -n "$requested_offset" ]]; then
    offset="$requested_offset"
    # Validate it's a multiple of the increment
    if (( offset % OFFSET_INCREMENT != 0 )); then
      echo "WARNING: offset $offset is not a multiple of $OFFSET_INCREMENT."
      echo "         This is allowed but not recommended."
    fi
    # Check if taken by another branch
    local taken_by
    taken_by="$(is_offset_taken "$offset")"
    if [[ -n "$taken_by" ]]; then
      echo "WARNING: offset $offset is already used by: $taken_by"
      echo "         Proceeding anyway (you may get port conflicts)."
    fi
  else
    offset="$(next_free_offset)"
    if [[ "$offset" == "ERROR" ]]; then
      echo "ERROR: No free offsets available (all $((MAX_OFFSET / OFFSET_INCREMENT + 1)) slots are taken)."
      echo "       Run '$0 --status' to see current assignments."
      echo "       Delete unused worktrees to free up slots."
      exit 1
    fi
  fi

  # Write the config
  write_env "$offset" "$branch"
  update_registry "$offset" "$branch"

  echo "Port configuration written to .env"
  echo ""
  echo "  Branch:     $branch"
  echo "  Offset:     $offset"
  echo "  nginx:      :$((BASE_NGINX + offset))"
  echo "  Redis:      :$((BASE_REDIS + offset))"
  echo "  PostgreSQL: :$((BASE_POSTGRES + offset))"
  echo "  ClickHouse: :$((BASE_CLICKHOUSE_HTTP + offset)) (HTTP), :$((BASE_CLICKHOUSE_NATIVE + offset)) (native)"
  echo ""
  echo "Start the stack with: docker-compose up --build -d"
}

main "$@"
