#!/usr/bin/env bash
# pre-update-backup.sh — Create a timestamped backup before docker-compose recreate
#
# Env:
#   BACKUP_ROOT       - Base directory for backups (default: /home/node/.openclaw/backups)
#   WORKSPACE_BASE    - Workspace root (default: /home/node/.openclaw/workspace)
#   DATABASE_PATH     - Path to MC database (default: $WORKSPACE_BASE/mission-control.db)
#
# Usage: bash pre-update-backup.sh
# Output: JSON manifest on stdout

set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/home/node/.openclaw/backups}"
WORKSPACE_BASE="${WORKSPACE_BASE:-/home/node/.openclaw/workspace}"
DATABASE_PATH="${DATABASE_PATH:-${WORKSPACE_BASE}/mission-control.db}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

echo "[backup] Creating backup at ${BACKUP_DIR}" >&2

mkdir -p "${BACKUP_DIR}"

# Track backed up items for manifest
declare -a MANIFEST_ITEMS=()

backup_file() {
  local src="$1"
  local label="$2"
  if [ -f "${src}" ]; then
    local dest="${BACKUP_DIR}/$(basename "${src}")"
    cp "${src}" "${dest}"
    local size
    size=$(stat -c%s "${dest}" 2>/dev/null || stat -f%z "${dest}" 2>/dev/null || echo "0")
    MANIFEST_ITEMS+=("{\"label\":\"${label}\",\"file\":\"$(basename "${src}")\",\"size\":${size}}")
    echo "[backup]   ${label}: $(basename "${src}") (${size} bytes)" >&2
  else
    echo "[backup]   ${label}: SKIPPED (not found: ${src})" >&2
  fi
}

backup_dir() {
  local src="$1"
  local label="$2"
  local dest_name="$3"
  if [ -d "${src}" ]; then
    local dest="${BACKUP_DIR}/${dest_name}"
    cp -r "${src}" "${dest}"
    local size
    size=$(du -sb "${dest}" 2>/dev/null | cut -f1 || du -sk "${dest}" 2>/dev/null | awk '{print $1*1024}' || echo "0")
    MANIFEST_ITEMS+=("{\"label\":\"${label}\",\"dir\":\"${dest_name}\",\"size\":${size}}")
    echo "[backup]   ${label}: ${dest_name}/ (${size} bytes)" >&2
  else
    echo "[backup]   ${label}: SKIPPED (not found: ${src})" >&2
  fi
}

# ─── Core files ──────────────────────────────────────────────────────────────

# 1. Mission Control database
backup_file "${DATABASE_PATH}" "MC Database"

# Also copy WAL/SHM files if present
if [ -f "${DATABASE_PATH}-wal" ]; then
  cp "${DATABASE_PATH}-wal" "${BACKUP_DIR}/"
fi
if [ -f "${DATABASE_PATH}-shm" ]; then
  cp "${DATABASE_PATH}-shm" "${BACKUP_DIR}/"
fi

# 2. openclaw.json config
backup_file "${WORKSPACE_BASE}/openclaw.json" "Openclaw Config"

# 3. Skills manifest
backup_file "${WORKSPACE_BASE}/skills/manifest.json" "Skills Manifest"
backup_file "${WORKSPACE_BASE}/SKILLS.md" "Skills MD"

# 4. Crontab dump
if command -v crontab &>/dev/null; then
  crontab -l > "${BACKUP_DIR}/crontab.txt" 2>/dev/null || true
  if [ -f "${BACKUP_DIR}/crontab.txt" ]; then
    local_size=$(stat -c%s "${BACKUP_DIR}/crontab.txt" 2>/dev/null || stat -f%z "${BACKUP_DIR}/crontab.txt" 2>/dev/null || echo "0")
    MANIFEST_ITEMS+=("{\"label\":\"Crontab\",\"file\":\"crontab.txt\",\"size\":${local_size}}")
    echo "[backup]   Crontab: crontab.txt (${local_size} bytes)" >&2
  fi
fi

# 5. Agent memory directories
backup_dir "${WORKSPACE_BASE}/memory" "Agent Memory" "memory"

# 6. Intel directory
backup_dir "${WORKSPACE_BASE}/intel" "Intel" "intel"

# 7. Checksums of key binaries
CHECKSUMS_FILE="${BACKUP_DIR}/bin-checksums.txt"
{
  for bin in node npm op gog playwright; do
    bin_path="$(command -v "${bin}" 2>/dev/null || echo "not-found")"
    if [ "${bin_path}" != "not-found" ] && [ -f "${bin_path}" ]; then
      if command -v sha256sum &>/dev/null; then
        sha256sum "${bin_path}"
      elif command -v shasum &>/dev/null; then
        shasum -a 256 "${bin_path}"
      else
        echo "${bin_path}: checksum-unavailable"
      fi
    else
      echo "${bin}: not-found"
    fi
  done
} > "${CHECKSUMS_FILE}" 2>/dev/null
checksum_size=$(stat -c%s "${CHECKSUMS_FILE}" 2>/dev/null || stat -f%z "${CHECKSUMS_FILE}" 2>/dev/null || echo "0")
MANIFEST_ITEMS+=("{\"label\":\"Binary Checksums\",\"file\":\"bin-checksums.txt\",\"size\":${checksum_size}}")

# 8. Lobster workflow state
backup_dir "${WORKSPACE_BASE}/workflows" "Lobster Workflows" "workflows"

# ─── Output JSON manifest ───────────────────────────────────────────────────

TOTAL_SIZE=$(du -sb "${BACKUP_DIR}" 2>/dev/null | cut -f1 || du -sk "${BACKUP_DIR}" 2>/dev/null | awk '{print $1*1024}' || echo "0")

# Build JSON array from items
ITEMS_JSON="["
for i in "${!MANIFEST_ITEMS[@]}"; do
  if [ "$i" -gt 0 ]; then
    ITEMS_JSON+=","
  fi
  ITEMS_JSON+="${MANIFEST_ITEMS[$i]}"
done
ITEMS_JSON+="]"

cat <<MANIFEST_EOF
{
  "timestamp": "${TIMESTAMP}",
  "backup_dir": "${BACKUP_DIR}",
  "total_size": ${TOTAL_SIZE},
  "items": ${ITEMS_JSON}
}
MANIFEST_EOF

echo "[backup] Complete: ${BACKUP_DIR} (${TOTAL_SIZE} bytes)" >&2
