#!/usr/bin/env bash
set -euo pipefail

# skill-validate.sh
# Runs Gates A-D validation on a skill directory
# Usage: skill-validate.sh <skill-dir>
#
# Gate A: Metadata check (SKILL.md exists, has required fields)
# Gate B: Dependency check (package.json deps installable)
# Gate C: Functional test (run skill's test suite if present)
# Gate D: Docker resilience (skill works after container recreate simulation)

usage() {
  echo "Usage: $(basename "$0") <skill-dir>" >&2
  echo "  Validates a skill directory through Gates A-D" >&2
  exit 1
}

if [ $# -lt 1 ] || [ -z "$1" ]; then
  usage
fi

SKILL_DIR="$1"

if [ ! -d "$SKILL_DIR" ]; then
  echo "Error: Skill directory not found: $SKILL_DIR" >&2
  exit 1
fi

# Resolve to absolute path
SKILL_DIR=$(cd "$SKILL_DIR" && pwd)
SKILL_NAME=$(basename "$SKILL_DIR")

# Result tracking
gate_a="fail"
gate_a_details=""
gate_b="fail"
gate_b_details=""
gate_c="fail"
gate_c_details=""
gate_d="fail"
gate_d_details=""

# --- Gate A: Metadata Check ---
gate_a_run() {
  local skill_md="${SKILL_DIR}/SKILL.md"

  if [ ! -f "$skill_md" ]; then
    gate_a_details="SKILL.md not found"
    return 1
  fi

  # Check required fields in SKILL.md
  local missing=""
  local required_fields="name description version"

  for field in $required_fields; do
    # Look for field as a heading or key-value pattern
    if ! grep -qiE "^#+\s*${field}|^${field}\s*:" "$skill_md" 2>/dev/null; then
      missing="$missing $field"
    fi
  done

  if [ -n "$missing" ]; then
    gate_a_details="Missing required fields:${missing}"
    return 1
  fi

  gate_a_details="All required fields present"
  return 0
}

if gate_a_run; then
  gate_a="pass"
fi

# --- Gate B: Dependency Check ---
gate_b_run() {
  local pkg_json="${SKILL_DIR}/package.json"

  if [ ! -f "$pkg_json" ]; then
    gate_b_details="No package.json found (skipped)"
    # No package.json is acceptable - pass the gate
    return 0
  fi

  # Validate package.json is valid JSON
  if ! jq empty "$pkg_json" 2>/dev/null; then
    gate_b_details="Invalid package.json (malformed JSON)"
    return 1
  fi

  # Check if there are dependencies
  local has_deps
  has_deps=$(jq 'has("dependencies") or has("devDependencies")' "$pkg_json" 2>/dev/null)
  if [ "$has_deps" != "true" ]; then
    gate_b_details="No dependencies declared"
    return 0
  fi

  # Attempt a dry-run install to verify deps are resolvable
  local install_output
  if command -v npm >/dev/null 2>&1; then
    install_output=$(cd "$SKILL_DIR" && npm install --dry-run 2>&1) && {
      gate_b_details="Dependencies resolvable"
      return 0
    }
    gate_b_details="npm install dry-run failed: $(echo "$install_output" | tail -3)"
    return 1
  else
    gate_b_details="npm not available, cannot verify dependencies"
    return 1
  fi
}

if gate_b_run; then
  gate_b="pass"
fi

# --- Gate C: Functional Test ---
gate_c_run() {
  # Check for test script in package.json
  local pkg_json="${SKILL_DIR}/package.json"
  local has_test_script=false

  if [ -f "$pkg_json" ]; then
    local test_cmd
    test_cmd=$(jq -r '.scripts.test // empty' "$pkg_json" 2>/dev/null)
    if [ -n "$test_cmd" ] && [ "$test_cmd" != "echo \"Error: no test specified\" && exit 1" ]; then
      has_test_script=true
    fi
  fi

  # Check for test directories/files
  local has_test_files=false
  if [ -d "${SKILL_DIR}/test" ] || [ -d "${SKILL_DIR}/tests" ] || \
     [ -d "${SKILL_DIR}/__tests__" ] || \
     ls "${SKILL_DIR}"/*.test.* >/dev/null 2>&1 || \
     ls "${SKILL_DIR}"/*.spec.* >/dev/null 2>&1; then
    has_test_files=true
  fi

  if [ "$has_test_script" = false ] && [ "$has_test_files" = false ]; then
    gate_c_details="No test suite found (skipped)"
    return 0
  fi

  # Run the test suite
  local test_output
  if [ "$has_test_script" = true ]; then
    test_output=$(cd "$SKILL_DIR" && npm test 2>&1) && {
      gate_c_details="Test suite passed"
      return 0
    }
    gate_c_details="Test suite failed: $(echo "$test_output" | tail -5)"
    return 1
  fi

  # If no npm test script but test files exist, try common runners
  if command -v npx >/dev/null 2>&1; then
    if [ -d "${SKILL_DIR}/__tests__" ] || ls "${SKILL_DIR}"/*.test.* >/dev/null 2>&1; then
      test_output=$(cd "$SKILL_DIR" && npx jest --passWithNoTests 2>&1) && {
        gate_c_details="Jest tests passed"
        return 0
      }
    fi
  fi

  gate_c_details="Test files found but could not execute"
  return 1
}

if gate_c_run; then
  gate_c="pass"
fi

# --- Gate D: Docker Resilience ---
gate_d_run() {
  # Simulate container recreate: verify skill works from a clean state
  # This tests that the skill doesn't depend on ephemeral container state

  local temp_dir
  temp_dir=$(mktemp -d "/tmp/skill-validate-${SKILL_NAME}-XXXXXX")

  # Copy skill to temp directory (simulating fresh volume mount)
  cp -r "$SKILL_DIR"/* "$temp_dir/" 2>/dev/null || {
    gate_d_details="Failed to copy skill to temp directory"
    rm -rf "$temp_dir"
    return 1
  }

  # Check that the skill can initialize from the copied state
  local init_ok=true

  # Verify essential files survived the copy
  if [ -f "${SKILL_DIR}/SKILL.md" ] && [ ! -f "${temp_dir}/SKILL.md" ]; then
    init_ok=false
    gate_d_details="SKILL.md missing after simulated recreate"
  fi

  # If package.json exists, verify node_modules can be restored
  if [ -f "${temp_dir}/package.json" ]; then
    # Remove node_modules to simulate fresh container
    rm -rf "${temp_dir}/node_modules"
    if command -v npm >/dev/null 2>&1; then
      local install_output
      install_output=$(cd "$temp_dir" && npm install --ignore-scripts 2>&1) || {
        init_ok=false
        gate_d_details="Dependencies failed to install in clean state: $(echo "$install_output" | tail -3)"
      }
    fi
  fi

  # Check for hardcoded absolute paths in source files
  local hardcoded
  hardcoded=$(grep -rl '/home/\|/root/\|/opt/' "$temp_dir" --include='*.js' --include='*.ts' --include='*.json' 2>/dev/null | head -5 || true)
  if [ -n "$hardcoded" ]; then
    gate_d_details="Warning: Possible hardcoded paths found in: $(echo "$hardcoded" | tr '\n' ', ')"
    # This is a warning, not a failure
  fi

  # Cleanup
  rm -rf "$temp_dir"

  if [ "$init_ok" = true ]; then
    if [ -z "$gate_d_details" ]; then
      gate_d_details="Resilience check passed"
    fi
    return 0
  fi
  return 1
}

if gate_d_run; then
  gate_d="pass"
fi

# --- Output Results ---
jq -n \
  --arg skill "$SKILL_NAME" \
  --arg dir "$SKILL_DIR" \
  --arg ga "$gate_a" \
  --arg ga_d "$gate_a_details" \
  --arg gb "$gate_b" \
  --arg gb_d "$gate_b_details" \
  --arg gc "$gate_c" \
  --arg gc_d "$gate_c_details" \
  --arg gd "$gate_d" \
  --arg gd_d "$gate_d_details" \
  '{
    skill: $skill,
    directory: $dir,
    gate_a: $ga,
    gate_a_details: $ga_d,
    gate_b: $gb,
    gate_b_details: $gb_d,
    gate_c: $gc,
    gate_c_details: $gc_d,
    gate_d: $gd,
    gate_d_details: $gd_d,
    overall: (if ($ga == "pass" and $gb == "pass" and $gc == "pass" and $gd == "pass") then "pass" else "fail" end)
  }'
