# Tool Creation Guide

Quick-reference guide for creating, categorizing, and improving tools within the Mission Control capabilities ecosystem.

---

## Table of Contents

1. [5-Step Quick Start](#5-step-quick-start)
2. [Tool Categories](#tool-categories)
3. [Improvement Flow](#improvement-flow)
4. [Templates](#templates)
5. [Best Practices](#best-practices)

---

## 5-Step Quick Start

### Step 1: Decide the Category

Every tool belongs to one of seven categories in the capabilities registry. Pick the one that best matches your tool's function:

| Category | When to Use |
|----------|-------------|
| `browser_automation` | Controls a browser (BrowserMCP, Playwright, browser-use) |
| `mcp_server` | Implements the MCP protocol (Model Context Protocol server) |
| `cli_tool` | Command-line utility invoked via shell (gog, op, etc.) |
| `api_integration` | Connects to an external API (REST, GraphQL) |
| `skill` | Reusable agent skill (see [SKILL-DEVELOPMENT-GUIDE.md](./SKILL-DEVELOPMENT-GUIDE.md)) |
| `workflow` | Lobster workflow definition (YAML-based orchestration) |
| `credential_provider` | Manages secrets and authentication (1Password) |

### Step 2: Scaffold the Tool

Create the directory structure and metadata files.

```bash
# Pick the appropriate location
TOOL_DIR="/home/node/.openclaw/skills/my-tool"   # shared
# or
TOOL_DIR="/home/node/.openclaw/workspace-{agent}/skills/my-tool"  # agent-specific

mkdir -p "$TOOL_DIR/tests"

# Create the metadata file
cat > "$TOOL_DIR/SKILL.md" << 'EOF'
# My Tool

Brief description of what this tool does.

## Metadata

- **Name**: my-tool
- **Version**: 0.1.0
- **Category**: cli_tool
- **Author**: {your-agent-id}
- **Scope**: shared
- **Status**: development

## Usage

```bash
node /home/node/.openclaw/skills/my-tool/index.js [options]
```

## Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--target` | string | Yes | Target to operate on |
| `--dry-run` | flag | No | Preview without side effects |

## Outputs

Describe what the tool produces.

## Dependencies

- List any npm packages or system tools required

## Health Check

```bash
node /home/node/.openclaw/skills/my-tool/index.js --dry-run
```

## Changelog

- **0.1.0** -- Initial scaffold
EOF
```

### Step 3: Implement

Write the tool logic. Use the category-specific templates in the [Templates](#templates) section below.

```bash
# If the tool has npm dependencies
cd "$TOOL_DIR"
npm init -y
npm install {dependencies}
```

### Step 4: Validate

Run the validation gates to ensure the tool meets quality standards.

```bash
# Metadata check
skill-validate.sh --gate A "$TOOL_DIR"

# Dependency check
skill-validate.sh --gate B "$TOOL_DIR"

# Functional tests
skill-validate.sh --gate C "$TOOL_DIR"

# Docker resilience (run before production deploy)
skill-validate.sh --gate D "$TOOL_DIR"
```

### Step 5: Deploy and Register

```bash
# Trigger sync to register in Mission Control
node /path/to/scripts/sync-capabilities.js

# Verify registration
curl http://localhost:4000/api/capabilities?category={your-category}

# Set status to healthy after verification
curl -X PATCH http://localhost:4000/api/capabilities/{id} \
  -H 'Content-Type: application/json' \
  -d '{"status": "healthy"}'

# Assign to agent (if agent-specific)
curl -X POST http://localhost:4000/api/agents/{agent-id}/capabilities \
  -H 'Content-Type: application/json' \
  -d '{"capability_id": "{tool-capability-id}"}'
```

---

## Tool Categories

### browser_automation

Tools that control a web browser to perform automated tasks.

**Examples**: BrowserMCP, Playwright scripts, browser-use automations

**Characteristics:**
- Require a running browser instance or browser profile
- Often interact with web UIs (form filling, scraping, navigation)
- May need credential injection for authenticated sessions
- Health checks verify browser connectivity

**Registration fields:**
```json
{
  "name": "browser-mcp",
  "category": "browser_automation",
  "provider": "BrowserMCP",
  "install_path": "/home/node/.openclaw/browser-mcp",
  "config_ref": "op://Vault/BrowserMCP/config",
  "is_shared": true
}
```

### mcp_server

Tools implementing the Model Context Protocol, allowing LLMs to interact with external systems through a standardized interface.

**Examples**: Filesystem MCP, database MCP, custom API MCP servers

**Characteristics:**
- Run as long-lived processes accepting MCP protocol messages
- Expose tools, resources, or prompts to connected LLMs
- Managed via the agent's MCP configuration (typically in `claude_desktop_config.json` or equivalent)
- Health checks verify the server process is running and responsive

**Registration fields:**
```json
{
  "name": "filesystem-mcp",
  "category": "mcp_server",
  "provider": "Anthropic",
  "version": "1.0.0",
  "install_path": "/home/node/.openclaw/mcp-servers/filesystem",
  "config_ref": "workspace-{agent}/.claude/claude_desktop_config.json",
  "is_shared": false
}
```

### cli_tool

Command-line utilities that agents invoke via shell execution.

**Examples**: `gog` (Git helper), `op` (1Password CLI), custom shell scripts

**Characteristics:**
- Invoked via `execSync`/`spawn` or direct shell calls
- Accept arguments and flags, produce stdout/stderr output
- Should support `--help` and `--version` flags
- Must be on the system PATH or referenced by absolute path

**Registration fields:**
```json
{
  "name": "gog",
  "category": "cli_tool",
  "provider": "internal",
  "version": "2.1.0",
  "install_path": "/usr/local/bin/gog",
  "is_shared": true
}
```

### api_integration

Tools that connect to external REST or GraphQL APIs.

**Examples**: Notion API client, Slack webhook sender, Google Sheets accessor

**Characteristics:**
- Make HTTP requests to external services
- Require API keys, OAuth tokens, or other credentials
- Should handle rate limiting, retries, and error responses
- Credential source typically points to 1Password or environment variables

**Registration fields:**
```json
{
  "name": "notion-client",
  "category": "api_integration",
  "provider": "Notion",
  "version": "1.2.0",
  "install_path": "/home/node/.openclaw/skills/notion-client",
  "config_ref": "op://Automation/Notion/api-key",
  "is_shared": true
}
```

### skill

Reusable agent skills with full lifecycle management. See [SKILL-DEVELOPMENT-GUIDE.md](./SKILL-DEVELOPMENT-GUIDE.md) for comprehensive documentation.

**Registration fields:**
```json
{
  "name": "daily-report-generator",
  "category": "skill",
  "provider": "argus",
  "version": "1.0.0",
  "install_path": "/home/node/.openclaw/workspace-argus/skills/daily-report-generator",
  "is_shared": false
}
```

### workflow

Lobster workflow definitions written in YAML that orchestrate multi-step agent tasks.

**Examples**: Purchase workflows, accounting sync workflows, browser task sequences

**Characteristics:**
- Defined in `.lobster.yaml` files
- Orchestrate multiple steps, potentially involving different tools or agents
- Managed via cron or triggered manually
- The Lobster runtime interprets and executes the workflow

**Registration fields:**
```json
{
  "name": "plati-purchase",
  "category": "workflow",
  "provider": "lobster",
  "version": "1.0.0",
  "install_path": "/home/node/.openclaw/skills/workflows/plati-purchase.lobster.yaml",
  "is_shared": true
}
```

### credential_provider

Tools that manage secrets, API keys, and authentication tokens.

**Examples**: 1Password CLI integration, vault wrappers, token refreshers

**Characteristics:**
- Provide credentials to other tools on demand
- Must never log or expose secrets in output
- Health checks verify vault connectivity without exposing secret values
- Typically a singleton -- one provider shared across all agents

**Registration fields:**
```json
{
  "name": "1password-cli",
  "category": "credential_provider",
  "provider": "1Password",
  "version": "2.24.0",
  "install_path": "/usr/local/bin/op",
  "config_ref": "op://Automation",
  "is_shared": true
}
```

---

## Improvement Flow

Use this process to upgrade an existing tool.

### 1. Assess

- Review health check history: `GET /api/health/history?target_id={capability-id}`
- Check cron job error counts: `GET /api/crons?agent_id={agent-id}`
- Read agent memory logs for invocation failures
- Identify the specific issue or enhancement needed

### 2. Plan

- Determine if this is a bug fix, enhancement, or refactor
- Check if the change affects other tools or agents
- Decide if the version bump is patch (bug fix), minor (new feature), or major (breaking change)

### 3. Implement

- Make changes in the tool directory
- Update the version in `SKILL.md`
- Add a Changelog entry
- Update tests to cover the change

### 4. Validate

```bash
# Re-run all validation gates
skill-validate.sh --all /path/to/tool-dir
```

### 5. Deploy

- For shared tools: deploy directly, all agents pick up changes on next invocation
- For agent-specific tools: deploy to the specific agent's workspace
- Update capability status if needed:

```bash
curl -X PATCH http://localhost:4000/api/capabilities/{id} \
  -H 'Content-Type: application/json' \
  -d '{"version": "1.1.0", "status": "healthy"}'
```

### 6. Monitor

- Watch health checks for the next few cycles
- Verify error counts remain at zero
- Check agent logs for any regressions

---

## Templates

### CLI Tool Template

```javascript
#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');

const options = {
  help:      { type: 'boolean', short: 'h', default: false },
  version:   { type: 'boolean', short: 'V', default: false },
  'dry-run': { type: 'boolean', default: false },
  verbose:   { type: 'boolean', short: 'v', default: false },
  target:    { type: 'string', short: 't' },
};

const VERSION = '1.0.0';
const NAME = 'my-cli-tool';

function usage() {
  console.log(`Usage: ${NAME} [options]

Options:
  -t, --target <value>   Target to operate on (required)
  -h, --help             Show this help message
  -V, --version          Show version
  -v, --verbose          Verbose output
      --dry-run          Preview without side effects`);
}

async function main() {
  const { values } = parseArgs({ options, allowPositionals: false });

  if (values.help) { usage(); process.exit(0); }
  if (values.version) { console.log(VERSION); process.exit(0); }
  if (!values.target) {
    console.error('Error: --target is required');
    usage();
    process.exit(2);
  }

  const log = values.verbose
    ? (msg) => console.log(`[${NAME}] ${msg}`)
    : () => {};

  log(`Target: ${values.target}`);

  if (values['dry-run']) {
    console.log(`[${NAME}] Dry run -- would process: ${values.target}`);
    process.exit(0);
  }

  // Tool logic here
  console.log(`[${NAME}] Done.`);
}

main().catch(err => {
  console.error(`[${NAME}] Fatal: ${err.message}`);
  process.exit(1);
});
```

### API Integration Template

```javascript
#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const https = require('https');

const NAME = 'my-api-integration';

// Credential retrieval via 1Password
function getSecret(ref) {
  return execSync(`op read "${ref}"`, { encoding: 'utf8' }).trim();
}

// HTTP request helper
function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      method,
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const apiKey = getSecret('op://Vault/Service/api-key');

  const result = await request('GET', 'https://api.example.com/data', {
    Authorization: `Bearer ${apiKey}`,
  });

  console.log(`[${NAME}] Fetched ${result.length} records`);
}

main().catch(err => {
  console.error(`[${NAME}] Fatal: ${err.message}`);
  process.exit(1);
});
```

### MCP Server Template

```javascript
#!/usr/bin/env node
'use strict';

/**
 * Minimal MCP server skeleton.
 * Implements the stdio transport for Model Context Protocol.
 */

const readline = require('readline');

const SERVER_NAME = 'my-mcp-server';
const SERVER_VERSION = '1.0.0';

// Tool definitions
const TOOLS = [
  {
    name: 'my_tool',
    description: 'Description of what this tool does',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The input query' },
      },
      required: ['query'],
    },
  },
];

// Tool handlers
async function handleTool(name, args) {
  switch (name) {
    case 'my_tool':
      return { content: [{ type: 'text', text: `Result for: ${args.query}` }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP message handler
async function handleMessage(msg) {
  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call':
      return await handleTool(msg.params.name, msg.params.arguments || {});
    case 'notifications/initialized':
      return null; // No response needed for notifications
    default:
      throw new Error(`Unknown method: ${msg.method}`);
  }
}

// Stdio transport
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);
    const result = await handleMessage(msg);
    if (result !== null && msg.id !== undefined) {
      const response = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result });
      process.stdout.write(response + '\n');
    }
  } catch (err) {
    if (JSON.parse(line).id !== undefined) {
      const error = JSON.stringify({
        jsonrpc: '2.0',
        id: JSON.parse(line).id,
        error: { code: -32603, message: err.message },
      });
      process.stdout.write(error + '\n');
    }
  }
});

process.stderr.write(`[${SERVER_NAME}] Started on stdio\n`);
```

### Workflow Template (Lobster YAML)

```yaml
name: my-workflow
version: "1.0.0"
description: Brief description of what this workflow does
trigger: manual  # or: cron, event

steps:
  - id: step-1
    name: First Step
    type: shell
    command: echo "Step 1 executing"
    on_failure: abort

  - id: step-2
    name: Second Step
    type: shell
    command: echo "Step 2 executing"
    depends_on:
      - step-1
    on_failure: continue

  - id: step-3
    name: Final Step
    type: shell
    command: echo "Workflow complete"
    depends_on:
      - step-2
```

### Test Template

```bash
#!/bin/bash
# tests/test-my-tool.sh
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$TOOL_DIR/index.js"
PASS=0
FAIL=0

run_test() {
  local name="$1"
  shift
  echo "--- Test: $name ---"
  if "$@"; then
    echo "PASS: $name"
    ((PASS++))
  else
    echo "FAIL: $name"
    ((FAIL++))
  fi
}

# Test 1: Help flag
run_test "help flag" node "$ENTRY" --help

# Test 2: Version flag
run_test "version flag" node "$ENTRY" --version

# Test 3: Dry run
run_test "dry run" node "$ENTRY" --target test-value --dry-run

# Test 4: Missing required argument should fail
echo "--- Test: missing required arg ---"
if node "$ENTRY" 2>/dev/null; then
  echo "FAIL: missing required arg (should have exited non-zero)"
  ((FAIL++))
else
  echo "PASS: missing required arg"
  ((PASS++))
fi

# Summary
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
```

---

## Best Practices

### Error Handling

- Always exit with a meaningful exit code (see conventions in the [Skill Development Guide](./SKILL-DEVELOPMENT-GUIDE.md#coding-patterns))
- Log errors to stderr, normal output to stdout
- Include the tool name prefix in all log lines for filtering: `[tool:name]`
- Catch and wrap errors with context rather than letting raw stack traces propagate

```javascript
try {
  await riskyOperation();
} catch (err) {
  console.error(`[my-tool] Failed during operation: ${err.message}`);
  process.exit(1);
}
```

### Health Checks

Every tool should define a health check method. The health check system will call this to verify the tool is operational.

**Guidelines:**

- Health checks must complete within 30 seconds
- Use `--dry-run` or `--health-check` flags for non-destructive verification
- Return meaningful status messages, not just "OK"
- Check all external dependencies (API reachability, credential validity, file access)

**Recording health check results:**

```bash
curl -X POST http://localhost:4000/api/health \
  -H 'Content-Type: application/json' \
  -d '{
    "target_type": "capability",
    "target_id": "{capability-uuid}",
    "status": "pass",
    "message": "All 3 checks passed: API reachable, credentials valid, output dir writable",
    "duration_ms": 1250
  }'
```

Health check status values:
- `pass` -- tool is fully operational (maps to capability status `healthy`)
- `warn` -- tool works but with degraded performance (maps to `degraded`)
- `fail` -- tool is broken (maps to `broken`)
- `skip` -- check could not run (maps to `unknown`)

### Credential Management

- Never hardcode credentials in source files
- Use 1Password CLI (`op read`) for secret retrieval at runtime
- Reference credentials via `config_ref` in the capability registration
- Validate credentials early (at startup, not mid-execution)
- If a credential is expired or invalid, exit with code 5 and a clear error message

```javascript
function requireSecret(ref, name) {
  try {
    const val = execSync(`op read "${ref}"`, { encoding: 'utf8' }).trim();
    if (!val) throw new Error('empty value');
    return val;
  } catch (err) {
    console.error(`[my-tool] Missing credential '${name}': ${err.message}`);
    console.error(`[my-tool] Ensure 1Password CLI is authenticated: op signin`);
    process.exit(5);
  }
}
```

### Idempotency

- Tools should be safe to run multiple times without creating duplicate side effects
- Use upsert patterns for database writes
- Check for existing resources before creating new ones
- Support `--dry-run` to preview what would happen without doing it

### Documentation

- Every tool must have a `SKILL.md` file (even non-skill tools use this format)
- Keep the Changelog section updated
- Document all environment variables and configuration options
- Include at least one usage example in the Usage section

### Performance

- Avoid synchronous I/O in hot paths
- Set reasonable timeouts for external API calls (default: 30 seconds)
- For long-running tools, emit periodic progress to stdout
- Record `duration_ms` in health check results to track performance trends
