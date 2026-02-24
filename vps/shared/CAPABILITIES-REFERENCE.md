# Capabilities Reference

Technical architecture documentation for the Mission Control capabilities system: the registry, health checks, cron management, memory browser, and integration points.

---

## Table of Contents

1. [Capabilities Registry](#1-capabilities-registry)
2. [Health Check System](#2-health-check-system)
3. [Cron Management](#3-cron-management)
4. [Memory Browser](#4-memory-browser)
5. [Integration Points](#5-integration-points)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Capabilities Registry

The capabilities registry is the central catalog of all tools, skills, MCP servers, workflows, CLI tools, and credential providers available in the swarm. It lives in the SQLite database and is kept in sync with the VPS filesystem via the sync daemon.

### Database Schema

#### `capabilities` table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL | Human-readable name |
| `category` | TEXT | NOT NULL, CHECK | One of: `browser_automation`, `mcp_server`, `cli_tool`, `api_integration`, `skill`, `workflow`, `credential_provider` |
| `description` | TEXT | | Purpose and usage notes |
| `provider` | TEXT | | Author, vendor, or team |
| `version` | TEXT | | Semver string |
| `install_path` | TEXT | | Absolute filesystem path on the VPS |
| `config_ref` | TEXT | | Path to config file or 1Password secret reference |
| `is_shared` | INTEGER | DEFAULT 1 | 1 = shared across all agents, 0 = agent-specific |
| `status` | TEXT | DEFAULT 'unknown', CHECK | One of: `healthy`, `degraded`, `broken`, `unknown`, `disabled` |
| `last_health_check` | TEXT | | ISO timestamp of most recent health check |
| `health_message` | TEXT | | Human-readable result from last health check |
| `metadata` | TEXT | | JSON blob for arbitrary extra data |
| `created_at` | TEXT | DEFAULT datetime('now') | Creation timestamp |
| `updated_at` | TEXT | DEFAULT datetime('now') | Last modification timestamp |

**Indexes:**
- `idx_capabilities_category` on `category`
- `idx_capabilities_status` on `status`

#### `agent_capabilities` table (junction)

Links agents to their assigned capabilities.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Agent identifier |
| `capability_id` | TEXT | NOT NULL, FK capabilities(id) ON DELETE CASCADE | Capability identifier |
| `enabled` | INTEGER | DEFAULT 1 | 1 = active, 0 = disabled for this agent |
| `config_override` | TEXT | | Agent-specific config JSON overriding defaults |

**Primary key:** `(agent_id, capability_id)`

**Indexes:**
- `idx_agent_capabilities_agent` on `agent_id`
- `idx_agent_capabilities_capability` on `capability_id`

### API Endpoints

#### List capabilities

```
GET /api/capabilities
```

Query parameters:
- `category` (string) -- filter by category
- `status` (string) -- filter by status
- `agent_id` (string) -- filter to capabilities assigned to this agent

Response: JSON array of capability objects.

#### Create capability

```
POST /api/capabilities
Content-Type: application/json

{
  "name": "browser-mcp",
  "category": "browser_automation",
  "description": "BrowserMCP for web automation",
  "provider": "BrowserMCP",
  "version": "1.0.0",
  "install_path": "/home/node/.openclaw/browser-mcp",
  "config_ref": "op://Vault/BrowserMCP/config",
  "is_shared": true,
  "status": "unknown"
}
```

Response: `201` with the created capability object.

Validation (via Zod):
- `name`: required, 1-200 chars
- `category`: required, must be a valid category enum value
- `description`: optional, max 2000 chars
- `provider`: optional, max 200 chars
- `version`: optional, max 50 chars
- `install_path`: optional, max 500 chars
- `config_ref`: optional, max 500 chars
- `is_shared`: optional boolean
- `status`: optional, valid status enum
- `metadata`: optional string (JSON)

#### Get single capability

```
GET /api/capabilities/{id}
```

Response: single capability object or `404`.

#### Update capability

```
PATCH /api/capabilities/{id}
Content-Type: application/json

{
  "status": "healthy",
  "version": "1.1.0"
}
```

All fields are optional. Updates `updated_at` automatically. Emits `capability_updated` SSE event.

#### Delete capability

```
DELETE /api/capabilities/{id}
```

Cascades to `agent_capabilities` via ON DELETE CASCADE. Returns `{ "success": true }`.

#### Capabilities overview (dashboard)

```
GET /api/capabilities/overview
```

Returns an aggregated object:

```json
{
  "capabilities": {
    "total": 12,
    "byCategory": { "skill": 5, "cli_tool": 3, "mcp_server": 2, "browser_automation": 1, "credential_provider": 1 },
    "byStatus": { "healthy": 9, "unknown": 2, "broken": 1 }
  },
  "integrations": {
    "total": 6,
    "byStatus": { "connected": 4, "broken": 1, "unknown": 1 }
  },
  "agents": [
    {
      "id": "apollo",
      "name": "Apollo",
      "capabilityCount": 8,
      "uniqueCapabilities": 8,
      "cronCount": 2,
      "latestMemory": "2026-02-24"
    }
  ],
  "alerts": [
    { "type": "error", "target": "notion-client", "message": "API key expired" }
  ],
  "cronSummary": { "active": 5, "disabled": 1, "stale": 0 },
  "lastFullCheck": "2026-02-24T10:00:00.000Z"
}
```

The alerts array is built from:
- Capabilities with status `broken` (type: `error`) or `degraded` (type: `warning`)
- Integrations with status `broken` (type: `error`) or `expired` (type: `warning`)

#### Agent capability assignment

```
GET /api/agents/{id}/capabilities
```

Returns capabilities assigned to the agent, including `enabled` and `config_override` fields.

```
POST /api/agents/{id}/capabilities
Content-Type: application/json

{ "capability_id": "{uuid}", "enabled": true, "config_override": "{json}" }
```

Returns `201` on success, `409` if already assigned.

```
DELETE /api/agents/{id}/capabilities
Content-Type: application/json

{ "capability_id": "{uuid}" }
```

Returns `{ "success": true }` or `404` if not assigned.

### Sync Flow

The sync daemon (`sync-daemon.js`) runs every 5 minutes via pm2 and executes three sync scripts in sequence:

1. **`sync-from-json.js`** -- Syncs `INITIATIVES.json` and `agent-*.json` files into the `tasks` and `agents` tables
2. **`sync-capabilities.js`** -- Scans the VPS filesystem for tools, skills, and integrations, then upserts into `capabilities`, `integrations`, and `cron_jobs` tables
3. **`sync-memory-index.js`** -- Scans agent memory directories for `YYYY-MM-DD.md` files and upserts into `agent_memory_index`

#### sync-capabilities.js scan targets

The capabilities sync script scans these filesystem locations:

| What | Path Pattern | Category |
|------|-------------|----------|
| Shared skills | `/home/node/.openclaw/skills/*/SKILL.md` | `skill` |
| Agent skills | `/home/node/.openclaw/workspace-*/skills/*/SKILL.md` | `skill` |
| MCP configs | `/home/node/.openclaw/workspace-*/.claude/claude_desktop_config.json` | `mcp_server` |
| Workflow files | `/home/node/.openclaw/skills/workflows/*.lobster.yaml` | `workflow` |
| CLI tools | Well-known paths (`/usr/local/bin/gog`, `/usr/local/bin/op`, etc.) | `cli_tool` |

For each discovered item, the sync script:
1. Parses metadata from `SKILL.md` or config files
2. Generates a deterministic ID based on the path
3. Upserts into the `capabilities` table (insert or update on conflict)
4. Links agent-specific capabilities via `agent_capabilities`

### Real-Time Events

The capabilities system emits SSE events via the `/api/events` stream:

| Event Type | Payload | Triggered By |
|------------|---------|--------------|
| `capability_updated` | Capability object | POST, PATCH on `/api/capabilities` |
| `integration_updated` | Integration object | POST, PATCH on `/api/integrations` |
| `health_check_completed` | HealthCheck object | POST on `/api/health` |

UI components subscribe to these events for live updates without polling.

### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `CapabilitiesOverview` | `src/components/CapabilitiesOverview.tsx` | Dashboard with summary cards, alerts, agent grid |
| `CapabilityTable` | `src/components/CapabilityTable.tsx` | Filterable table of all capabilities |
| `IntegrationCard` | `src/components/IntegrationCard.tsx` | Card display for each integration |
| `HealthLog` | `src/components/HealthLog.tsx` | Health check history timeline |
| `CronJobsTable` | `src/components/CronJobsTable.tsx` | Cron job list with status indicators |
| `MemoryBrowser` | `src/components/MemoryBrowser.tsx` | Agent memory file browser |
| `MemoryCalendar` | `src/components/MemoryCalendar.tsx` | Calendar view of memory entries |

The capabilities page is served at `/workspace/{slug}/capabilities`.

---

## 2. Health Check System

The health check system monitors the operational status of capabilities and integrations, recording results in a historical log and updating the target's status fields.

### Health Check Schema

#### `health_checks` table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `target_type` | TEXT | NOT NULL, CHECK | `capability` or `integration` |
| `target_id` | TEXT | NOT NULL | UUID of the target capability or integration |
| `status` | TEXT | NOT NULL, CHECK | `pass`, `fail`, `warn`, or `skip` |
| `message` | TEXT | | Human-readable result description |
| `duration_ms` | INTEGER | | Execution time in milliseconds |
| `checked_at` | TEXT | DEFAULT datetime('now') | When the check was performed |

**Indexes:**
- `idx_health_checks_target` on `(target_type, target_id)`
- `idx_health_checks_checked` on `checked_at DESC`

### Status Mapping

When a health check result is recorded, the target's status fields are automatically updated:

**Capabilities** (`capabilities` table):

| Health Check Status | Capability Status | Fields Updated |
|--------------------|-------------------|----------------|
| `pass` | `healthy` | `status`, `last_health_check`, `health_message`, `updated_at` |
| `warn` | `degraded` | same |
| `fail` | `broken` | same |
| `skip` | `unknown` | same |

**Integrations** (`integrations` table):

| Health Check Status | Integration Status | Fields Updated |
|--------------------|-------------------|----------------|
| `pass` | `connected` | `status`, `last_validated`, `validation_message`, `updated_at` |
| `fail` | `broken` | same |
| `warn` / `skip` | `unknown` | same |

### API Endpoints

#### Get current health status

```
GET /api/health
```

Returns the latest health check per capability and per integration, plus a summary:

```json
{
  "summary": {
    "total": 18,
    "pass": 14,
    "fail": 2,
    "warn": 1,
    "skip": 1
  },
  "capabilities": [
    {
      "id": "...",
      "target_type": "capability",
      "target_id": "...",
      "status": "pass",
      "message": "All checks passed",
      "duration_ms": 450,
      "checked_at": "2026-02-24T10:00:00.000Z",
      "target_name": "browser-mcp"
    }
  ],
  "integrations": [
    {
      "id": "...",
      "target_type": "integration",
      "target_id": "...",
      "status": "fail",
      "message": "API key expired",
      "duration_ms": 120,
      "checked_at": "2026-02-24T10:00:00.000Z",
      "target_name": "Notion"
    }
  ]
}
```

The "latest check per target" is determined by `MAX(checked_at)` grouped by `target_id`.

#### Record a health check

```
POST /api/health
Content-Type: application/json

{
  "target_type": "capability",
  "target_id": "{capability-uuid}",
  "status": "pass",
  "message": "API reachable, credentials valid",
  "duration_ms": 1250
}
```

Required fields: `target_type`, `target_id`, `status`.
Validates that the referenced target exists in the corresponding table.
Emits `health_check_completed` SSE event.

#### Health check history

```
GET /api/health/history
```

Query parameters:
- `target_type` (string) -- filter to `capability` or `integration`
- `target_id` (string) -- filter to a specific target UUID
- `limit` (number) -- max results, default 50

Returns: JSON array of health check objects with `target_name` resolved via JOIN.

### Health Check Runner

The `health-check-runner.js` script (`scripts/health-check-runner.js`) orchestrates automated health checks:

1. Queries all capabilities and integrations from the database
2. For each target, runs the appropriate check:
   - **Capabilities**: executes the health check command from `SKILL.md` or checks `install_path` existence
   - **Integrations**: validates credentials and tests connectivity
3. Records results via `POST /api/health`
4. Can be run manually or on a cron schedule

### Health Check Definitions

Health checks are defined in `src/lib/health-checks.ts`, which provides check definitions for each capability category:

| Category | Check Method |
|----------|-------------|
| `browser_automation` | Verify browser process running, test page navigation |
| `mcp_server` | Connect to stdio/SSE transport, send `initialize` message |
| `cli_tool` | Run `{tool} --version` or `{tool} --help`, verify exit code 0 |
| `api_integration` | HTTP GET to the API health endpoint, verify 2xx response |
| `skill` | Run `{skill} --dry-run` or `--health-check` flag |
| `workflow` | Validate YAML syntax, check referenced tools exist |
| `credential_provider` | Run `op whoami` or equivalent authentication check |

---

## 3. Cron Management

Cron jobs are scheduled tasks assigned to specific agents or shared across the system.

### Database Schema

#### `cron_jobs` table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL | Human-readable job name |
| `schedule` | TEXT | NOT NULL | Cron expression (e.g., `0 6 * * *`) |
| `command` | TEXT | NOT NULL | Shell command or script path to execute |
| `agent_id` | TEXT | FK agents(id) ON DELETE SET NULL | Assigned agent (null = system-level) |
| `type` | TEXT | DEFAULT 'shell', CHECK | `lobster` (workflow), `shell` (script), or `llm` (AI-driven) |
| `status` | TEXT | DEFAULT 'active', CHECK | `active`, `disabled`, or `stale` |
| `last_run` | TEXT | | ISO timestamp of most recent execution |
| `last_result` | TEXT | | Output or summary from last execution |
| `last_duration_ms` | INTEGER | | Execution time of last run |
| `error_count` | INTEGER | DEFAULT 0 | Consecutive error count |
| `description` | TEXT | | Human-readable description of the job's purpose |
| `created_at` | TEXT | DEFAULT datetime('now') | |
| `updated_at` | TEXT | DEFAULT datetime('now') | |

**Indexes:**
- `idx_cron_jobs_agent` on `agent_id`
- `idx_cron_jobs_status` on `status`

### Job Types

#### `shell`

Standard shell commands or scripts. Executed via `child_process.execSync` or `spawn`.

```json
{
  "name": "daily-backup",
  "schedule": "0 2 * * *",
  "command": "bash /home/node/.openclaw/skills/scripts/pre-update-backup.sh",
  "type": "shell"
}
```

#### `lobster`

Lobster workflow definitions in YAML. The Lobster runtime parses and executes the workflow steps.

```json
{
  "name": "plati-purchase-check",
  "schedule": "0 */4 * * *",
  "command": "/home/node/.openclaw/skills/workflows/plati-purchase.lobster.yaml",
  "type": "lobster"
}
```

#### `llm`

AI-driven tasks that invoke an LLM agent to perform reasoning or generation.

```json
{
  "name": "daily-summary",
  "schedule": "0 18 * * *",
  "command": "generate-daily-summary --agent argus",
  "type": "llm"
}
```

### API Endpoints

#### List all cron jobs

```
GET /api/crons
```

Returns all cron jobs with `agent_name` resolved via JOIN.

#### Create cron job

```
POST /api/crons
Content-Type: application/json

{
  "name": "health-check-sweep",
  "schedule": "*/30 * * * *",
  "command": "node /path/to/scripts/health-check-runner.js",
  "agent_id": "argus",
  "type": "shell",
  "description": "Run health checks every 30 minutes"
}
```

Validation:
- `name`: required, 1-200 chars
- `schedule`: required, 1-100 chars (cron expression)
- `command`: required, 1-2000 chars
- `agent_id`: optional string
- `type`: optional, defaults to `shell`
- `status`: optional, defaults to `active`
- `description`: optional, max 1000 chars

#### Get/Update/Delete single cron job

```
GET    /api/crons/{id}
PATCH  /api/crons/{id}
DELETE /api/crons/{id}
```

Update supports all creation fields plus: `last_run`, `last_result`, `last_duration_ms`, `error_count`.

#### Agent-scoped cron endpoints

```
GET  /api/agents/{id}/crons     -- List cron jobs for a specific agent
POST /api/agents/{id}/crons     -- Create a cron job assigned to the agent
```

The POST endpoint automatically sets `agent_id` from the URL parameter.

### Staleness Detection

A cron job is considered `stale` when:
- `status` is `active` but `last_run` is significantly older than the `schedule` interval
- `error_count` exceeds a threshold (typically 3+)

The sync-capabilities script can detect stale cron jobs during its filesystem scan and update their status accordingly.

### Monitoring

- **Dashboard**: The `CronJobsTable` component displays all cron jobs with status indicators
- **Overview endpoint**: `GET /api/capabilities/overview` returns `cronSummary` with counts by status
- **Alerts**: Cron jobs with high `error_count` generate alerts in the capabilities overview

---

## 4. Memory Browser

The memory browser provides indexed access to agent memory files, which are daily Markdown logs generated by each agent during operation.

### Memory File Format

Agent memory files follow the naming convention `YYYY-MM-DD.md` and are stored at:

```
/home/node/.openclaw/workspace-{agent}/memory/YYYY-MM-DD.md
```

Each file contains timestamped log entries recording the agent's activities, decisions, and outputs for that day.

### Database Schema

#### `agent_memory_index` table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `agent_id` | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Agent identifier |
| `date` | TEXT | NOT NULL | Date string in `YYYY-MM-DD` format |
| `file_path` | TEXT | NOT NULL | Absolute path to the memory file on disk |
| `file_size_bytes` | INTEGER | DEFAULT 0 | File size for display purposes |
| `summary` | TEXT | | Brief summary of the day's activity |
| `entry_count` | INTEGER | DEFAULT 0 | Number of entries/sections in the file |
| `created_at` | TEXT | DEFAULT datetime('now') | When the index entry was created |

**Unique constraint:** `(agent_id, date)` -- one entry per agent per day.

**Index:** `idx_agent_memory_agent_date` on `(agent_id, date DESC)`

### Sync Process

The `sync-memory-index.js` script runs as part of the sync daemon pipeline:

1. Lists all agent workspace directories matching `/home/node/.openclaw/workspace-*/memory/`
2. For each directory, scans for `YYYY-MM-DD.md` files
3. For each file:
   - Reads file size via `fs.stat`
   - Counts entries by looking for heading markers (`##` or timestamp patterns)
   - Extracts a brief summary (first meaningful line or first heading)
4. Upserts into `agent_memory_index` with `ON CONFLICT(agent_id, date) DO UPDATE`

### API Endpoints

#### List memory index for an agent

```
GET /api/agents/{id}/memory
```

Query parameters:
- `limit` (number) -- max entries, default 50

Returns: JSON array of `AgentMemoryEntry` objects, ordered by `date DESC`.

```json
[
  {
    "id": "...",
    "agent_id": "apollo",
    "date": "2026-02-24",
    "file_path": "/home/node/.openclaw/workspace-apollo/memory/2026-02-24.md",
    "file_size_bytes": 15420,
    "summary": "Worked on campaign content creation and Notion sync",
    "entry_count": 12,
    "created_at": "2026-02-24T06:00:00.000Z"
  }
]
```

#### Read memory file content

```
GET /api/agents/{id}/memory/{date}
```

Where `{date}` is `YYYY-MM-DD` format.

Returns the full content of the memory file if it exists on disk:

```json
{
  "id": "...",
  "agent_id": "apollo",
  "date": "2026-02-24",
  "file_path": "/home/node/.openclaw/workspace-apollo/memory/2026-02-24.md",
  "file_size_bytes": 15420,
  "summary": "...",
  "entry_count": 12,
  "content": "# 2026-02-24\n\n## 06:00 - Morning initialization\n...",
  "source": "file"
}
```

If the file is missing from disk but the index entry exists, returns the summary with a note:

```json
{
  "...": "...",
  "content": "Worked on campaign content creation and Notion sync",
  "source": "index",
  "note": "Original file not found on disk. Showing summary from index."
}
```

### UI Components

| Component | Purpose |
|-----------|---------|
| `MemoryBrowser` | Lists memory entries with date, size, summary, and entry count. Click to view content. |
| `MemoryCalendar` | Calendar grid showing which dates have memory entries, with visual indicators for entry density. |

The memory page is served at `/workspace/{slug}/memory`.

---

## 5. Integration Points

This section describes how the capabilities system components connect to each other and to external systems.

### Integrations Registry

The `integrations` table tracks external service connections.

#### `integrations` table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL | Integration name (e.g., "Notion", "Slack") |
| `type` | TEXT | NOT NULL, CHECK | `mcp_plugin`, `oauth_token`, `api_key`, `cli_auth`, `browser_profile`, `cron_job`, `webhook` |
| `provider` | TEXT | | External service provider name |
| `status` | TEXT | DEFAULT 'unknown', CHECK | `connected`, `expired`, `broken`, `unconfigured`, `unknown` |
| `credential_source` | TEXT | | Where credentials come from (e.g., `op://Vault/Notion/api-key`) |
| `last_validated` | TEXT | | When credentials were last verified |
| `validation_message` | TEXT | | Result of last validation |
| `config` | TEXT | | JSON configuration blob |
| `metadata` | TEXT | | JSON metadata blob |
| `created_at` | TEXT | DEFAULT datetime('now') | |
| `updated_at` | TEXT | DEFAULT datetime('now') | |

**Index:** `idx_integrations_status` on `status`

#### Integration Types

| Type | Description | Example |
|------|-------------|---------|
| `mcp_plugin` | MCP protocol plugin integration | BrowserMCP, Firecrawl |
| `oauth_token` | OAuth2 token-based auth | Google Sheets, Slack |
| `api_key` | Simple API key authentication | Notion, OpenAI |
| `cli_auth` | CLI-based authentication | 1Password (`op signin`) |
| `browser_profile` | Stored browser session/profile | Authenticated browser sessions |
| `cron_job` | Integration tied to a scheduled job | Periodic data syncs |
| `webhook` | Incoming/outgoing webhook | Slack webhook, GitHub webhook |

#### Integration API Endpoints

```
GET    /api/integrations              -- List all (filter: ?status=, ?type=)
POST   /api/integrations              -- Create new
GET    /api/integrations/{id}         -- Get single
PATCH  /api/integrations/{id}         -- Update
DELETE /api/integrations/{id}         -- Delete
```

### Data Flow Diagram

```
VPS Filesystem                    Sync Daemon (every 5 min)              SQLite Database
================                  =========================              ===============

INITIATIVES.json  ──┐
agent-*.json      ──┤── sync-from-json.js ──────────────────> tasks, agents
                    │
skills/*/SKILL.md ──┤
workspace-*/skills──┤── sync-capabilities.js ───────────────> capabilities,
MCP configs       ──┤                                         integrations,
workflow YAMLs    ──┤                                         cron_jobs,
CLI tool paths    ──┘                                         agent_capabilities
                    │
workspace-*/memory──┘── sync-memory-index.js ───────────────> agent_memory_index


Health Check Runner                Next.js API                    UI (SSE)
===================                ===========                    ========

health-check-runner.js ──> POST /api/health ──> health_checks    CapabilitiesOverview
                                  │              capabilities     CapabilityTable
                                  └──> SSE ──>   HealthLog
                                                 IntegrationCard
                                                 CronJobsTable
                                                 MemoryBrowser
```

### Sync Daemon Pipeline

The sync daemon (`scripts/sync-daemon.js`) is a pm2-managed long-running process:

```
pm2 process: mc-sync-daemon
├── Runs immediately on start
├── Then every 5 minutes (300,000 ms)
│
├── Step 1: sync-from-json.js
│   └── Reads: INITIATIVES.json, agent-*.json
│   └── Writes: tasks, agents tables
│
├── Step 2: sync-capabilities.js
│   └── Reads: VPS filesystem (skills, MCP configs, workflows, CLI tools)
│   └── Writes: capabilities, integrations, cron_jobs, agent_capabilities tables
│
└── Step 3: sync-memory-index.js
    └── Reads: workspace-*/memory/*.md files
    └── Writes: agent_memory_index table
```

Each step runs as a child process with a 30-second timeout. Failures in one step do not prevent subsequent steps from running.

### SSE Event Pipeline

The capabilities system uses Server-Sent Events for real-time UI updates:

1. API route handler performs a database write (INSERT, UPDATE)
2. Handler calls `broadcast()` from `src/lib/events.ts` with the event type and payload
3. The SSE endpoint (`/api/events`) sends the event to all connected clients
4. React components listening for the event type re-fetch or update local state

Event types relevant to capabilities:

| Event | Description |
|-------|-------------|
| `capability_updated` | A capability was created or modified |
| `integration_updated` | An integration was created or modified |
| `health_check_completed` | A new health check result was recorded |

### Cross-Table Relationships

```
agents
  │
  ├──< agent_capabilities >──┤ capabilities
  │                           │
  ├──< cron_jobs              ├──< health_checks (target_type='capability')
  │                           │
  ├──< agent_memory_index     │
  │                           │
  └──< openclaw_sessions      integrations
                                │
                                └──< health_checks (target_type='integration')
```

Key relationship rules:
- Deleting an agent cascades to `agent_capabilities`, `agent_memory_index`
- Deleting a capability cascades to `agent_capabilities`
- Deleting an agent sets `cron_jobs.agent_id` to NULL (ON DELETE SET NULL)
- `health_checks` references `target_id` without a foreign key constraint (soft reference)

---

## 6. Troubleshooting

### Common Issues

#### Capability not appearing after sync

**Symptoms**: A new skill/tool exists on the filesystem but does not show up in `GET /api/capabilities`.

**Diagnosis**:
1. Verify the file is in the correct path:
   ```bash
   ls /home/node/.openclaw/skills/{name}/SKILL.md
   ```
2. Check sync daemon logs:
   ```bash
   pm2 logs mc-sync-daemon --lines 50
   ```
3. Run sync manually:
   ```bash
   node scripts/sync-capabilities.js
   ```
4. Check for SKILL.md parsing errors (missing required fields)

**Resolution**: Ensure SKILL.md exists with valid metadata. See [SKILL-DEVELOPMENT-GUIDE.md](./SKILL-DEVELOPMENT-GUIDE.md) for the required format.

#### Health check shows "fail" but tool works manually

**Symptoms**: A capability shows `broken` status in the dashboard but works fine when invoked directly.

**Diagnosis**:
1. Check the `health_message` field:
   ```bash
   curl http://localhost:4000/api/capabilities/{id} | jq '.health_message'
   ```
2. Review health check history:
   ```bash
   curl "http://localhost:4000/api/health/history?target_id={id}&limit=5"
   ```
3. Verify the health check command runs correctly in the daemon's environment (same user, same PATH, same env vars)

**Resolution**: Health checks run in the sync daemon context, which may differ from your interactive shell. Common differences include missing environment variables, different working directories, or 1Password session expiry. Ensure the health check command is fully self-contained with absolute paths.

#### Cron job with increasing error_count

**Symptoms**: A cron job's `error_count` keeps climbing; `last_result` shows error messages.

**Diagnosis**:
1. Check the cron job details:
   ```bash
   curl http://localhost:4000/api/crons/{id}
   ```
2. Run the command manually to reproduce:
   ```bash
   {command from cron job}
   ```
3. Check if dependent services are down:
   ```bash
   curl http://localhost:4000/api/health
   ```

**Resolution**: Fix the underlying issue, then reset the error count:
```bash
curl -X PATCH http://localhost:4000/api/crons/{id} \
  -H 'Content-Type: application/json' \
  -d '{"error_count": 0, "status": "active"}'
```

#### Memory files not indexed

**Symptoms**: `GET /api/agents/{id}/memory` returns empty or stale data, but memory files exist on disk.

**Diagnosis**:
1. Verify files exist:
   ```bash
   ls /home/node/.openclaw/workspace-{agent}/memory/
   ```
2. Check file naming format (must be `YYYY-MM-DD.md`)
3. Run memory sync manually:
   ```bash
   node scripts/sync-memory-index.js
   ```

**Resolution**: Ensure files follow the `YYYY-MM-DD.md` naming convention exactly. Files with other names (e.g., `notes.md`, `2026-2-24.md`) are ignored by the sync script.

#### Integration shows "unconfigured"

**Symptoms**: An integration exists but shows `unconfigured` status.

**Diagnosis**:
1. Check if credentials are set:
   ```bash
   curl http://localhost:4000/api/integrations/{id} | jq '.credential_source'
   ```
2. If using 1Password, verify the reference is valid:
   ```bash
   op read "{credential_source}"
   ```

**Resolution**: Set the credential source and validate:
```bash
curl -X PATCH http://localhost:4000/api/integrations/{id} \
  -H 'Content-Type: application/json' \
  -d '{"credential_source": "op://Vault/Service/api-key", "status": "connected"}'
```

#### Database locked errors

**Symptoms**: API calls return 500 errors with "SQLITE_BUSY" in the logs.

**Diagnosis**: Multiple processes are trying to write to the SQLite database simultaneously.

**Resolution**: The database uses WAL mode (`PRAGMA journal_mode = WAL`) which should handle concurrent reads. If write contention is the issue:
1. Ensure only one instance of the sync daemon is running
2. Check for long-running transactions that hold the write lock
3. Verify the database file is on a local filesystem (not NFS/network mount)

#### SSE events not arriving in the UI

**Symptoms**: Changes made via API or sync are visible on page refresh but not updating live.

**Diagnosis**:
1. Check the browser's Network tab for the SSE connection to `/api/events`
2. Look for connection drops or errors
3. Verify the `broadcast()` function is being called in the API route

**Resolution**: The SSE connection may have timed out or been interrupted by a proxy. Refresh the page to re-establish the connection. If persistent, check for reverse proxy timeouts (nginx `proxy_read_timeout` should be set high for SSE endpoints).
