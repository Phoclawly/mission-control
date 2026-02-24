#!/usr/bin/env bash
set -euo pipefail

# op-get-secret.sh
# 1Password wrapper: retrieves a secret value from 1Password or falls back to .env
# Usage: op-get-secret.sh <vault/item/field>
#   e.g.: op-get-secret.sh Personal/GitHub/token

usage() {
  echo "Usage: $(basename "$0") <vault/item/field>" >&2
  echo "  Retrieves a secret from 1Password, with .env fallback" >&2
  echo "" >&2
  echo "  Examples:" >&2
  echo "    $(basename "$0") Personal/GitHub/token" >&2
  echo "    $(basename "$0") Shared/OpenAI/api_key" >&2
  exit 1
}

if [ $# -lt 1 ] || [ -z "$1" ]; then
  usage
fi

SECRET_PATH="$1"

# Parse the path into components
IFS='/' read -r vault item field <<< "$SECRET_PATH"

if [ -z "$vault" ] || [ -z "$item" ] || [ -z "$field" ]; then
  echo "Error: Secret path must be in format vault/item/field" >&2
  exit 1
fi

# --- Try 1Password first ---
if command -v op >/dev/null 2>&1; then
  # Check if we have a valid session
  session_valid=false

  if op whoami >/dev/null 2>&1; then
    session_valid=true
  elif [ -n "${OP_SESSION:-}" ]; then
    # Try using existing session token
    if op whoami --session "$OP_SESSION" >/dev/null 2>&1; then
      session_valid=true
    fi
  fi

  # Attempt to sign in if no valid session
  if [ "$session_valid" = false ]; then
    if [ -t 0 ]; then
      # Interactive terminal available, attempt signin
      eval "$(op signin 2>/dev/null)" && session_valid=true
    fi
  fi

  if [ "$session_valid" = true ]; then
    # Retrieve the secret from 1Password
    secret=$(op read "op://${vault}/${item}/${field}" 2>/dev/null) && {
      echo "$secret"
      exit 0
    }
    # If op read fails, try item get
    secret=$(op item get "$item" --vault "$vault" --fields "$field" 2>/dev/null) && {
      echo "$secret"
      exit 0
    }
    echo "Error: Could not retrieve ${SECRET_PATH} from 1Password" >&2
    exit 1
  else
    echo "Warning: 1Password session not available, falling back to .env" >&2
  fi
else
  echo "Warning: op CLI not installed, falling back to .env" >&2
fi

# --- Fallback: .env file lookup ---
# Convert the secret path to an env var name convention
# e.g., Personal/GitHub/token -> GITHUB_TOKEN
env_var_name=$(echo "${item}_${field}" | tr '[:lower:]' '[:upper:]' | tr '-' '_' | tr ' ' '_')

# Search for the variable in .env files
ENV_SEARCH_PATHS=(
  "${PWD}/.env"
  "${PWD}/.env.local"
  "${HOME}/.env"
  "${HOME}/.config/.env"
)

for env_path in "${ENV_SEARCH_PATHS[@]}"; do
  if [ -f "$env_path" ]; then
    # Extract value for the matching variable
    value=$(grep -E "^${env_var_name}=" "$env_path" 2>/dev/null | head -1 | cut -d'=' -f2-)
    if [ -n "$value" ]; then
      # Strip surrounding quotes
      value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
      echo "$value"
      exit 0
    fi
  fi
done

echo "Error: Secret '${SECRET_PATH}' not found in 1Password or .env files" >&2
echo "  Looked for env var: ${env_var_name}" >&2
exit 1
