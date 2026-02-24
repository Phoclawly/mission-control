#!/usr/bin/env bash
# post-docker-verify.sh — Post-recreate verification checks
#
# Verifies that critical components survived a docker-compose recreate.
#
# Env:
#   WORKSPACE_BASE    - Workspace root (default: /home/node/.openclaw/workspace)
#   DATABASE_PATH     - Path to MC database (default: $WORKSPACE_BASE/mission-control.db)
#   MISSION_CONTROL_URL - MC API URL (default: http://localhost:4000)
#
# Usage: bash post-docker-verify.sh
# Output: JSON report on stdout

set -euo pipefail

WORKSPACE_BASE="${WORKSPACE_BASE:-/home/node/.openclaw/workspace}"
DATABASE_PATH="${DATABASE_PATH:-${WORKSPACE_BASE}/mission-control.db}"
MISSION_CONTROL_URL="${MISSION_CONTROL_URL:-http://localhost:4000}"

PASS_COUNT=0
FAIL_COUNT=0
declare -a CHECK_RESULTS=()

check() {
  local name="$1"
  local status="$2"
  local message="$3"

  if [ "${status}" = "pass" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "[verify] PASS  ${name}: ${message}" >&2
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "[verify] FAIL  ${name}: ${message}" >&2
  fi

  CHECK_RESULTS+=("{\"name\":\"${name}\",\"status\":\"${status}\",\"message\":\"${message}\"}")
}

# ─── 1. Persistent volume mounts ────────────────────────────────────────────

if [ -d "${WORKSPACE_BASE}" ]; then
  check "workspace_mount" "pass" "Workspace directory exists at ${WORKSPACE_BASE}"
else
  check "workspace_mount" "fail" "Workspace directory missing: ${WORKSPACE_BASE}"
fi

if [ -d "${WORKSPACE_BASE}/memory" ]; then
  check "memory_mount" "pass" "Memory directory exists"
else
  check "memory_mount" "fail" "Memory directory missing: ${WORKSPACE_BASE}/memory"
fi

if [ -d "${WORKSPACE_BASE}/intel" ]; then
  check "intel_mount" "pass" "Intel directory exists"
else
  check "intel_mount" "fail" "Intel directory missing: ${WORKSPACE_BASE}/intel"
fi

# ─── 2. Key binaries ────────────────────────────────────────────────────────

for bin in node npm op gog playwright; do
  if command -v "${bin}" &>/dev/null; then
    version=$("${bin}" --version 2>/dev/null || echo "unknown")
    check "binary_${bin}" "pass" "${bin} found: ${version}"
  else
    check "binary_${bin}" "fail" "${bin} not found in PATH"
  fi
done

# ─── 3. Environment variables ───────────────────────────────────────────────

for var in DATABASE_PATH NODE_ENV; do
  if [ -n "${!var:-}" ]; then
    check "env_${var}" "pass" "${var} is set"
  else
    check "env_${var}" "fail" "${var} is not set"
  fi
done

# ─── 4. Memory files intact ─────────────────────────────────────────────────

if [ -d "${WORKSPACE_BASE}/memory" ]; then
  mem_count=$(find "${WORKSPACE_BASE}/memory" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "${mem_count}" -gt 0 ]; then
    check "memory_files" "pass" "${mem_count} memory files found"
  else
    check "memory_files" "fail" "Memory directory exists but is empty"
  fi
else
  check "memory_files" "fail" "Memory directory does not exist"
fi

# ─── 5. MC database accessible ──────────────────────────────────────────────

if [ -f "${DATABASE_PATH}" ]; then
  check "database_exists" "pass" "Database file exists at ${DATABASE_PATH}"

  # Try a simple query
  if command -v sqlite3 &>/dev/null; then
    table_count=$(sqlite3 "${DATABASE_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "error")
    if [ "${table_count}" != "error" ] && [ "${table_count}" -gt 0 ]; then
      check "database_query" "pass" "Database has ${table_count} tables"
    else
      check "database_query" "fail" "Database query failed or returned 0 tables"
    fi
  else
    # Fall back to checking file is non-empty
    db_size=$(stat -c%s "${DATABASE_PATH}" 2>/dev/null || stat -f%z "${DATABASE_PATH}" 2>/dev/null || echo "0")
    if [ "${db_size}" -gt 0 ]; then
      check "database_query" "pass" "Database file is ${db_size} bytes (sqlite3 CLI not available for deeper check)"
    else
      check "database_query" "fail" "Database file is empty"
    fi
  fi
else
  check "database_exists" "fail" "Database file missing: ${DATABASE_PATH}"
  check "database_query" "fail" "Skipped (no database)"
fi

# ─── 6. MC API reachable ────────────────────────────────────────────────────

if command -v curl &>/dev/null; then
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "${MISSION_CONTROL_URL}/api/health" --max-time 5 2>/dev/null || echo "000")
  if [ "${http_code}" = "200" ]; then
    check "mc_api" "pass" "MC API responding (HTTP ${http_code})"
  else
    check "mc_api" "fail" "MC API not responding (HTTP ${http_code})"
  fi
else
  check "mc_api" "fail" "curl not available for API check"
fi

# ─── 7. Config file ─────────────────────────────────────────────────────────

if [ -f "${WORKSPACE_BASE}/openclaw.json" ]; then
  check "config_file" "pass" "openclaw.json present"
else
  check "config_file" "fail" "openclaw.json missing"
fi

# ─── Output JSON report ─────────────────────────────────────────────────────

TOTAL=$((PASS_COUNT + FAIL_COUNT))
OVERALL="pass"
if [ "${FAIL_COUNT}" -gt 0 ]; then
  OVERALL="fail"
fi

# Build JSON array from results
RESULTS_JSON="["
for i in "${!CHECK_RESULTS[@]}"; do
  if [ "$i" -gt 0 ]; then
    RESULTS_JSON+=","
  fi
  RESULTS_JSON+="${CHECK_RESULTS[$i]}"
done
RESULTS_JSON+="]"

cat <<REPORT_EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "overall": "${OVERALL}",
  "total": ${TOTAL},
  "pass": ${PASS_COUNT},
  "fail": ${FAIL_COUNT},
  "checks": ${RESULTS_JSON}
}
REPORT_EOF

if [ "${FAIL_COUNT}" -gt 0 ]; then
  echo "[verify] RESULT: ${FAIL_COUNT}/${TOTAL} checks failed" >&2
  exit 1
else
  echo "[verify] RESULT: All ${TOTAL} checks passed" >&2
fi
