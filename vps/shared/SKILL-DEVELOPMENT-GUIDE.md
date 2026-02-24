# Skill Development Guide

Complete lifecycle documentation for creating, validating, deploying, and maintaining agent skills within the Mission Control ecosystem.

---

## Table of Contents

1. [Overview](#overview)
2. [Proposal](#1-proposal)
3. [Development](#2-development)
4. [Validation Gates](#3-validation-gates)
5. [Staging](#4-staging)
6. [Rollout](#5-rollout)
7. [Improvement Cycle](#6-improvement-cycle)
8. [Reference](#reference)

---

## Overview

A **skill** is a reusable, self-contained capability that an agent can invoke to accomplish a specific task. Skills are registered in the Mission Control capabilities registry under the `skill` category and are synced automatically via the sync daemon.

Skills live on the VPS filesystem in one of two locations:

- **Shared skills**: `/home/node/.openclaw/skills/` -- available to all agents
- **Agent-specific skills**: `/home/node/.openclaw/workspace-{agent}/skills/` -- scoped to a single agent

Each skill is a directory containing a `SKILL.md` metadata file, optional `package.json`, and implementation files.

---

## 1. Proposal

Before building a skill, formalize the proposal so the team can evaluate scope, overlap, and priority.

### What to Include in a Proposal

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Short, kebab-case identifier (e.g., `notion-sync`) |
| **Purpose** | Yes | One-sentence description of what the skill does |
| **Trigger** | Yes | How the skill is invoked (manual, cron, event-driven) |
| **Inputs** | Yes | What data the skill expects (arguments, env vars, files) |
| **Outputs** | Yes | What the skill produces (files, API calls, stdout) |
| **Dependencies** | No | External tools, APIs, or npm packages required |
| **Scope** | Yes | `shared` (all agents) or `agent-specific` (single agent) |
| **Estimated Complexity** | No | Low / Medium / High |
| **Existing Overlap** | No | List any skills with similar functionality |

### Proposal Template

```markdown
## Skill Proposal: {skill-name}

**Purpose**: {one-sentence description}
**Scope**: shared | agent-specific ({agent-id})
**Trigger**: manual | cron ({schedule}) | event ({event-type})

### Inputs
- `ARG_1`: description
- `ENV_VAR`: description

### Outputs
- {description of what is produced}

### Dependencies
- {npm package or system tool}

### Notes
- {any additional context, constraints, or design decisions}
```

### Review Checklist

Before development begins, confirm:

- [ ] No existing skill already covers this use case
- [ ] The skill scope (shared vs. agent-specific) is appropriate
- [ ] Required external services or APIs are available
- [ ] Credential requirements are documented

---

## 2. Development

### Directory Structure

Each skill is a directory under the appropriate skills root.

**Shared skill example:**

```
/home/node/.openclaw/skills/
  notion-sync/
    SKILL.md            # Required: metadata and documentation
    package.json        # Optional: npm dependencies
    index.js            # Main entry point
    lib/
      api-client.js     # Supporting modules
    tests/
      test-sync.sh      # Test suite
```

**Agent-specific skill example:**

```
/home/node/.openclaw/workspace-apollo/skills/
  campaign-builder/
    SKILL.md
    package.json
    index.js
    templates/
      email.hbs
    tests/
      test-campaign.sh
```

### SKILL.md Format

Every skill **must** contain a `SKILL.md` file at the root of its directory. This file serves as both documentation and machine-readable metadata.

```markdown
# {Skill Name}

{One-paragraph description of what this skill does.}

## Metadata

- **Name**: {kebab-case-name}
- **Version**: {semver, e.g., 1.0.0}
- **Category**: skill
- **Author**: {agent-id or team}
- **Scope**: shared | agent-specific
- **Status**: development | staging | production | deprecated

## Usage

{How to invoke the skill. Include command examples.}

```bash
# Example invocation
node /home/node/.openclaw/skills/{name}/index.js --arg1 value
```

## Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--arg1` | string | Yes | Description |
| `ENV_VAR` | env | No | Description (default: value) |

## Outputs

{Describe what the skill produces: files, stdout, API side effects.}

## Dependencies

- `axios` ^1.6.0 -- HTTP client for API calls
- `op` CLI -- 1Password credential retrieval

## Health Check

{How to verify the skill is working. Used by the health check system.}

```bash
# Quick smoke test
node /home/node/.openclaw/skills/{name}/index.js --dry-run
```

## Changelog

- **1.0.0** -- Initial release
```

### Coding Patterns

**Entry point pattern:**

```javascript
#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');

const options = {
  'dry-run': { type: 'boolean', default: false },
  'verbose': { type: 'boolean', short: 'v', default: false },
};

async function main() {
  const { values } = parseArgs({ options, allowPositionals: true });

  if (values['dry-run']) {
    console.log('[skill] Dry run mode -- no side effects');
    process.exit(0);
  }

  // Skill logic here
}

main().catch(err => {
  console.error(`[skill] Fatal: ${err.message}`);
  process.exit(1);
});
```

**Credential access pattern (via 1Password CLI):**

```javascript
const { execSync } = require('child_process');

function getSecret(ref) {
  try {
    return execSync(`op read "${ref}"`, { encoding: 'utf8' }).trim();
  } catch (err) {
    throw new Error(`Failed to read secret ${ref}: ${err.message}`);
  }
}

// Usage:
const apiKey = getSecret('op://Vault/Item/field');
```

**Logging pattern:**

```javascript
const PREFIX = '[skill:notion-sync]';

function log(msg) { console.log(`${PREFIX} ${msg}`); }
function warn(msg) { console.warn(`${PREFIX} WARN: ${msg}`); }
function error(msg) { console.error(`${PREFIX} ERROR: ${msg}`); }
```

**Exit code conventions:**

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |
| `3` | Missing dependency |
| `4` | External service unavailable |
| `5` | Authentication failure |

---

## 3. Validation Gates

Every skill must pass four validation gates before production deployment. These gates are enforced by `skill-validate.sh`.

### Gate A: Metadata Check

Verifies that `SKILL.md` exists and contains required fields.

**What is checked:**

- `SKILL.md` file exists in the skill root directory
- Contains a `# {Name}` header (H1)
- Contains a `## Metadata` section with Name, Version, Category, and Status fields
- Contains a `## Usage` section
- Contains a `## Health Check` section

**Pass criteria:** All required sections and fields present.

**Common failures:**

- Missing `SKILL.md` entirely
- Metadata section missing required fields
- No Health Check section defined

```bash
# Run Gate A only
skill-validate.sh --gate A /path/to/skill-dir
```

### Gate B: Dependency Check

Verifies that all declared dependencies can be resolved.

**What is checked:**

- If `package.json` exists, `npm install --dry-run` succeeds
- System dependencies (CLI tools) referenced in SKILL.md are available on PATH
- Environment variables referenced in the Inputs section are documented

**Pass criteria:** All npm dependencies resolvable, all system tools found.

**Common failures:**

- `package.json` references a private or nonexistent package
- System tool (e.g., `op`, `gog`) not installed on the VPS
- Missing `node_modules` after install

```bash
# Run Gate B only
skill-validate.sh --gate B /path/to/skill-dir
```

### Gate C: Functional Test

Runs the skill's test suite to verify it works as expected.

**What is checked:**

- `tests/` directory exists with at least one test file
- Tests execute without error (exit code 0)
- If the skill supports `--dry-run`, that mode is tested first

**Pass criteria:** All tests pass.

**Common failures:**

- No test directory or test files
- Tests depend on external services that are unreachable
- Tests leave side effects (files, API state) that break re-runs

**Writing effective tests:**

```bash
#!/bin/bash
# tests/test-notion-sync.sh
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$SKILL_DIR/index.js"

echo "=== Test: dry-run mode ==="
node "$SCRIPT" --dry-run
echo "PASS: dry-run"

echo "=== Test: missing required arg ==="
if node "$SCRIPT" 2>/dev/null; then
  echo "FAIL: should have exited with error"
  exit 1
fi
echo "PASS: missing arg rejected"

echo "=== All tests passed ==="
```

```bash
# Run Gate C only
skill-validate.sh --gate C /path/to/skill-dir
```

### Gate D: Docker Resilience

Verifies the skill survives a Docker container recreate cycle.

**What is checked:**

- Skill directory persists after `docker compose down && docker compose up`
- `node_modules` can be restored from `package.json` (not baked into images)
- Skill entry point runs successfully after container recreation

**Pass criteria:** Skill starts and passes a basic health check after container rebuild.

**Common failures:**

- Dependencies installed globally in the container image but not in `package.json`
- Hardcoded paths that change between container instances
- Reliance on container-local state (temp files, caches) that is lost on recreate

```bash
# Run Gate D only (destructive -- rebuilds container)
skill-validate.sh --gate D /path/to/skill-dir
```

### Running All Gates

```bash
# Run all gates A through D
skill-validate.sh --all /path/to/skill-dir

# Expected output:
# [Gate A] Metadata Check ... PASS
# [Gate B] Dependency Check ... PASS
# [Gate C] Functional Test ... PASS
# [Gate D] Docker Resilience ... PASS
# === All gates passed ===
```

---

## 4. Staging

Before deploying to production, test the skill in a staging environment.

### Staging Workflow

1. **Place the skill in the target directory:**

   ```bash
   # Shared skill
   cp -r ./my-skill /home/node/.openclaw/skills/my-skill

   # Agent-specific skill
   cp -r ./my-skill /home/node/.openclaw/workspace-{agent}/skills/my-skill
   ```

2. **Install dependencies:**

   ```bash
   cd /home/node/.openclaw/skills/my-skill
   npm install --production    # if package.json exists
   ```

3. **Run validation gates A-C:**

   ```bash
   skill-validate.sh --gate A /home/node/.openclaw/skills/my-skill
   skill-validate.sh --gate B /home/node/.openclaw/skills/my-skill
   skill-validate.sh --gate C /home/node/.openclaw/skills/my-skill
   ```

4. **Trigger a sync daemon cycle** (or wait for the next 5-minute interval):

   ```bash
   node /path/to/scripts/sync-capabilities.js
   ```

   This registers the skill in the `capabilities` table with `status: 'unknown'`.

5. **Verify registration in Mission Control:**

   ```bash
   curl http://localhost:4000/api/capabilities?category=skill
   ```

   Confirm your skill appears in the list.

6. **Test agent assignment (if agent-specific):**

   ```bash
   # Assign to agent
   curl -X POST http://localhost:4000/api/agents/{agent-id}/capabilities \
     -H 'Content-Type: application/json' \
     -d '{"capability_id": "{skill-capability-id}"}'
   ```

7. **Run a manual health check:**

   ```bash
   curl -X POST http://localhost:4000/api/health \
     -H 'Content-Type: application/json' \
     -d '{
       "target_type": "capability",
       "target_id": "{skill-capability-id}",
       "status": "pass",
       "message": "Manual staging validation"
     }'
   ```

### Staging Checklist

- [ ] Gates A-C pass
- [ ] Skill appears in capabilities registry
- [ ] Health check records successfully
- [ ] Agent assignment works (if applicable)
- [ ] Skill executes correctly when invoked by the assigned agent
- [ ] Logs are clean (no unhandled warnings or errors)

---

## 5. Rollout

### Production Deployment Steps

1. **Pass Gate D (Docker resilience):**

   ```bash
   skill-validate.sh --gate D /home/node/.openclaw/skills/my-skill
   ```

2. **Update SKILL.md status:**

   Change the Status field in the Metadata section from `staging` to `production`.

3. **Set capability status to healthy:**

   ```bash
   curl -X PATCH http://localhost:4000/api/capabilities/{id} \
     -H 'Content-Type: application/json' \
     -d '{"status": "healthy"}'
   ```

4. **Configure cron schedule (if applicable):**

   ```bash
   curl -X POST http://localhost:4000/api/crons \
     -H 'Content-Type: application/json' \
     -d '{
       "name": "my-skill-daily",
       "schedule": "0 6 * * *",
       "command": "node /home/node/.openclaw/skills/my-skill/index.js",
       "agent_id": "{agent-id}",
       "type": "shell",
       "description": "Daily execution of my-skill"
     }'
   ```

5. **Verify in the Mission Control dashboard:**

   Navigate to the Capabilities page and confirm the skill shows as `healthy`.

### Shared vs. Agent-Specific Deployment

| Aspect | Shared | Agent-Specific |
|--------|--------|----------------|
| **Location** | `/home/node/.openclaw/skills/` | `/home/node/.openclaw/workspace-{agent}/skills/` |
| **Visibility** | All agents | Single agent only |
| **Assignment** | Auto-assigned to all via sync | Assigned via `agent_capabilities` table |
| **Use case** | Common utilities, cross-cutting tools | Agent-specific workflows, specialized tasks |
| **Updates** | Coordinate across all agents | Update independently |

### Rollback Procedure

If a production skill causes issues:

1. **Disable immediately:**

   ```bash
   curl -X PATCH http://localhost:4000/api/capabilities/{id} \
     -H 'Content-Type: application/json' \
     -d '{"status": "disabled"}'
   ```

2. **Investigate logs** for error messages.

3. **Restore previous version** from backup or version control.

4. **Re-validate** with all four gates before re-enabling.

---

## 6. Improvement Cycle

Skills are living artifacts. Use this cycle to maintain and improve them over time.

### Monitoring

- **Health checks**: The health check runner periodically tests skill health. Monitor results via `GET /api/health` and `GET /api/health/history`.
- **Cron job results**: If the skill runs on a schedule, check `last_run`, `last_result`, and `error_count` on the cron job record.
- **Error count threshold**: A cron job with `error_count > 3` should trigger investigation.

### Feedback Sources

- Agent logs: Check the agent's memory files (`/home/node/.openclaw/workspace-{agent}/memory/YYYY-MM-DD.md`) for skill invocation records.
- Mission Control events: The `events` table logs sync results and capability updates.
- Health check history: `GET /api/health/history?target_id={capability-id}` shows the trend.

### Iteration Process

1. **Identify the issue** from monitoring data or agent feedback.
2. **Create a branch or copy** of the skill directory for development.
3. **Make changes** and update the version in `SKILL.md`.
4. **Re-run validation gates** A-C in the development environment.
5. **Deploy to staging**, test, then promote to production.
6. **Update the Changelog** section in `SKILL.md`.

### Deprecation

When a skill is no longer needed:

1. Set status to `deprecated` in `SKILL.md`.
2. Update the capability status in Mission Control:

   ```bash
   curl -X PATCH http://localhost:4000/api/capabilities/{id} \
     -H 'Content-Type: application/json' \
     -d '{"status": "disabled"}'
   ```

3. Remove agent assignments if the skill was agent-specific.
4. After a grace period, delete the skill directory. The next sync daemon cycle will mark the capability as missing.

---

## Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_BASE_PATH` | `/home/node/.openclaw/workspace` | Base workspace path |
| `DATABASE_PATH` | `{WORKSPACE_BASE_PATH}/mission-control.db` | SQLite database location |

### Capabilities Registry Schema

The `capabilities` table tracks all skills:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID identifier |
| `name` | TEXT | Skill name |
| `category` | TEXT | Always `skill` for skills |
| `description` | TEXT | From SKILL.md |
| `provider` | TEXT | Author or team |
| `version` | TEXT | Semver version |
| `install_path` | TEXT | Filesystem path to skill directory |
| `config_ref` | TEXT | Path to config file or 1Password ref |
| `is_shared` | INTEGER | 1 = shared, 0 = agent-specific |
| `status` | TEXT | healthy, degraded, broken, unknown, disabled |
| `last_health_check` | TEXT | ISO timestamp of last check |
| `health_message` | TEXT | Result message from last check |
| `metadata` | TEXT | JSON blob for additional data |

### Related API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/capabilities?category=skill` | List all skills |
| POST | `/api/capabilities` | Register a new skill |
| PATCH | `/api/capabilities/{id}` | Update skill metadata or status |
| DELETE | `/api/capabilities/{id}` | Remove skill from registry |
| POST | `/api/health` | Record a health check result |
| GET | `/api/health/history` | View health check history |
| POST | `/api/agents/{id}/capabilities` | Assign skill to agent |

### Naming Conventions

- **Skill directories**: `kebab-case` (e.g., `notion-sync`, `campaign-builder`)
- **Entry points**: `index.js` (default) or named per function
- **Test files**: `tests/test-{name}.sh` or `tests/test-{name}.js`
- **Log prefixes**: `[skill:{name}]` for consistent log filtering
