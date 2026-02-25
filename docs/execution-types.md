# Execution Types

Task types define how a task is dispatched and executed by agents. Each type has a unique dispatch message format and optional configuration.

## Discovery

Agents discover available task types via:
```
GET /api/task-types
GET /api/task-types?implemented_only=true
GET /api/task-types?include_config_schema=true
```

## Types

### openclaw-native (OC)
**Status:** Implemented

Standard task dispatched directly to the assigned OpenClaw agent. No config required.

### claude-team (CT)
**Status:** Implemented

Spawns a Claude Code Agent Team for parallel multi-agent execution.

**Config schema:**
```json
{
  "team_size": 3,
  "team_members": [
    { "name": "Agent A", "focus": "backend", "role": "developer" }
  ],
  "model": "optional-model-override"
}
```
- `team_size` (required): 1-10
- `team_members` (optional): named team member definitions
- `model` (optional): model override

### multi-hypothesis (MH)
**Status:** Implemented

Dispatches N parallel investigators via `sessions_spawn`, each exploring a different approach.

**Config schema:**
```json
{
  "hypotheses": [
    { "label": "Approach A", "focus_description": "Focus on simplicity" },
    { "label": "Approach B", "focus_description": "Focus on performance" }
  ],
  "coordinator_agent_id": "optional-agent-id"
}
```
- `hypotheses` (required): 1-10 investigation angles
- `coordinator_agent_id` (optional): agent to coordinate results

### e2e-validation, prd-flow, mcp-task
**Status:** Not yet implemented (planned)

## Adding a New Task Type

1. Add entry to `TASK_TYPE_REGISTRY` in `src/lib/task-types.ts`
2. Add message builder function (`buildXxxMessage`)
3. Add case to `buildDispatchMessage()` switch
4. Add config schema in `src/lib/validation.ts` (`TASK_TYPE_CONFIG_SCHEMAS`)
5. Add `configSchema` JSON schema to the registry entry

## Dispatch Message Enrichment

When a task belongs to an initiative, the dispatch message includes an **INITIATIVE CONTEXT** block with the initiative title, status, and task count. This gives agents awareness of the broader context.

## Validation

Config is validated at the API boundary via `superRefine` in `CreateTaskSchema` and `UpdateTaskSchema`. Invalid configs for known types return 400 with detailed error messages.
