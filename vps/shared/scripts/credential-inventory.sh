#!/usr/bin/env bash
set -euo pipefail

# credential-inventory.sh
# Scans all credential sources and outputs a JSON inventory
# Sources: 1Password items, .env files, openclaw.json

SCAN_DIR="${1:-$HOME}"
INVENTORY='[]'

add_entry() {
  local source="$1" name="$2" type="$3" status="$4"
  INVENTORY=$(echo "$INVENTORY" | jq \
    --arg source "$source" \
    --arg name "$name" \
    --arg type "$type" \
    --arg status "$status" \
    '. + [{"source": $source, "name": $name, "type": $type, "status": $status}]')
}

# --- 1Password items ---
if command -v op >/dev/null 2>&1; then
  if op whoami >/dev/null 2>&1; then
    op_items=$(op item list --format=json 2>/dev/null || echo '[]')
    item_count=$(echo "$op_items" | jq 'length')
    for i in $(seq 0 $((item_count - 1))); do
      item_name=$(echo "$op_items" | jq -r ".[$i].title // \"unknown\"")
      item_category=$(echo "$op_items" | jq -r ".[$i].category // \"unknown\"")
      add_entry "1password" "$item_name" "$item_category" "available"
    done
  else
    add_entry "1password" "session" "auth" "not_signed_in"
  fi
else
  add_entry "1password" "op-cli" "tool" "not_installed"
fi

# --- .env files ---
while IFS= read -r -d '' env_file; do
  # Extract lines matching credential patterns
  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$line" ]] && continue

    # Extract variable name
    var_name="${line%%=*}"
    var_name=$(echo "$var_name" | xargs)

    # Check if it matches credential patterns
    if [[ "$var_name" =~ (_KEY|_TOKEN|_SECRET|_PASSWORD|_API_KEY|_AUTH|_CREDENTIAL)$ ]]; then
      var_value="${line#*=}"
      var_value=$(echo "$var_value" | xargs | tr -d '"' | tr -d "'")
      if [ -n "$var_value" ] && [ "$var_value" != '""' ] && [ "$var_value" != "''" ]; then
        status="set"
      else
        status="empty"
      fi
      # Determine type from suffix
      case "$var_name" in
        *_API_KEY|*_KEY) cred_type="api_key" ;;
        *_TOKEN) cred_type="token" ;;
        *_SECRET) cred_type="secret" ;;
        *_PASSWORD) cred_type="password" ;;
        *_AUTH|*_CREDENTIAL) cred_type="credential" ;;
        *) cred_type="unknown" ;;
      esac
      add_entry "env:$(basename "$env_file")" "$var_name" "$cred_type" "$status"
    fi
  done < "$env_file"
done < <(find "$SCAN_DIR" -maxdepth 3 -name '.env' -o -name '.env.*' 2>/dev/null | tr '\n' '\0')

# --- openclaw.json ---
OPENCLAW_PATHS=(
  "$HOME/.config/openclaw/openclaw.json"
  "$HOME/.openclaw.json"
  "/etc/openclaw/openclaw.json"
)

for openclaw_path in "${OPENCLAW_PATHS[@]}"; do
  if [ -f "$openclaw_path" ]; then
    # Extract MCP credentials
    mcp_servers=$(jq -r '.mcpServers // {} | keys[]' "$openclaw_path" 2>/dev/null || true)
    for server in $mcp_servers; do
      # Check for env vars in the server config
      env_keys=$(jq -r ".mcpServers[\"$server\"].env // {} | keys[]" "$openclaw_path" 2>/dev/null || true)
      for key in $env_keys; do
        if [[ "$key" =~ (KEY|TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL) ]]; then
          value=$(jq -r ".mcpServers[\"$server\"].env[\"$key\"] // \"\"" "$openclaw_path" 2>/dev/null)
          if [ -n "$value" ]; then
            status="set"
          else
            status="empty"
          fi
          add_entry "openclaw:$server" "$key" "mcp_credential" "$status"
        fi
      done
    done

    # Extract top-level API keys
    api_keys=$(jq -r 'to_entries[] | select(.key | test("key|token|secret|api"; "i")) | .key' "$openclaw_path" 2>/dev/null || true)
    for key in $api_keys; do
      value=$(jq -r ".[\"$key\"] // \"\"" "$openclaw_path" 2>/dev/null)
      if [ -n "$value" ]; then
        status="set"
      else
        status="empty"
      fi
      add_entry "openclaw:root" "$key" "api_key" "$status"
    done
    break  # Use first found openclaw.json
  fi
done

# Output final inventory
echo "$INVENTORY" | jq '.'
