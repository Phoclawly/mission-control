#!/usr/bin/env node
/**
 * sync-from-json.js — Sync INITIATIVES.json + agent-*.json → SQLite
 *
 * Reads:
 *   - $SQUAD_STATUS_PATH/INITIATIVES.json
 *   - $SQUAD_STATUS_PATH/agent-*.json
 *
 * Writes to:
 *   - $DATABASE_PATH (or $WORKSPACE_BASE_PATH/mission-control.db)
 *
 * Run: node sync-from-json.js
 * Cron: every 5 minutes
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const WORKSPACE = process.env.WORKSPACE_BASE_PATH || '/home/node/.openclaw/workspace';
const INTEL_STATUS = process.env.SQUAD_STATUS_PATH || path.join(WORKSPACE, 'intel/status');
const DB_PATH = process.env.DATABASE_PATH || path.join(WORKSPACE, 'mission-control.db');
const INITIATIVES_FILE = path.join(INTEL_STATUS, 'INITIATIVES.json');

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.warn(`[sync] Could not read ${filePath}: ${e.message}`);
    return null;
  }
}

function readFileText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function now() {
  return new Date().toISOString();
}

// ─── SOUL.md parser ─────────────────────────────────────────────────────────

/**
 * Parse agent name and role from SOUL.md header line.
 * Matches patterns like:
 *   "# SOUL.md — Apollo (Marketing & Creative)"
 *   "# SOUL.md - Pho (Main Orchestrator)"
 *   "# Argus — Ops & Monitoring"
 */
function parseAgentNameFromSoul(soulMd) {
  if (!soulMd) return null;
  // Pattern 1: "# SOUL.md — Name (Role)" or "# SOUL.md — Multi Word Name (Role)"
  const match1 = soulMd.match(/^#\s+SOUL\.md\s*[—–-]\s*(.+?)\s*\(([^)]+)\)/m);
  if (match1) return { name: match1[1].trim(), role: match1[2].trim() };
  // Pattern 1b: "# SOUL.md — Name" (no parenthesized role)
  const match1b = soulMd.match(/^#\s+SOUL\.md\s*[—–-]\s*(.+)/m);
  if (match1b) return { name: match1b[1].trim(), role: null };
  // Pattern 2: "# Name — Role" (no SOUL.md prefix)
  const match2 = soulMd.match(/^#\s+(.+?)\s*[—–-]\s*(.+)/m);
  if (match2) return { name: match2[1].trim(), role: match2[2].trim() || null };
  return null;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Status mappers ──────────────────────────────────────────────────────────

// Valid task statuses: pending_dispatch, planning, inbox, assigned,
//                      in_progress, testing, review, done
function mapInitiativeStatus(status) {
  const map = {
    'in-progress': 'in_progress',
    'completed': 'done',
    'canceled': 'done',      // closest available
    'cancelled': 'done',
    'blocked': 'in_progress', // keep visible
    'pending': 'inbox',
    'todo': 'inbox',
  };
  return map[status] || 'inbox';
}

function mapAgentStatus(status) {
  const map = {
    'working': 'working',
    'idle': 'standby',
    'standby': 'standby',
    'blocked': 'standby',
    'error': 'offline',
    'offline': 'offline',
  };
  return map[status] || 'standby';
}

// ─── Sync initiatives → tasks table ─────────────────────────────────────────

function syncInitiatives(db) {
  const data = readJSON(INITIATIVES_FILE);
  if (!data || !Array.isArray(data.initiatives)) {
    console.warn('[sync] INITIATIVES.json missing or malformed');
    return 0;
  }

  // Get the primary workspace_id
  const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get();
  const workspace_id = workspace ? workspace.id : null;

  const upsert = db.prepare(`
    INSERT INTO tasks (
      id, title, status, description, workspace_id,
      initiative_id, external_request_id, source,
      created_at, updated_at
    )
    VALUES (
      @id, @title, @status, @description, @workspace_id,
      @initiative_id, @external_request_id, @source,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      title               = excluded.title,
      status              = excluded.status,
      description         = excluded.description,
      initiative_id       = excluded.initiative_id,
      external_request_id = excluded.external_request_id,
      source              = excluded.source,
      updated_at          = excluded.updated_at
  `);

  const syncMany = db.transaction((initiatives) => {
    let count = 0;
    for (const init of initiatives) {
      const id = `initiative-${init.id.toLowerCase()}`;
      const title = `${init.id}: ${init.title}`;
      const status = mapInitiativeStatus(init.status);

      const descParts = [];
      if (init.summary) descParts.push(init.summary);
      if (init.lead) descParts.push(`Lead: ${init.lead}`);
      if (init.participants?.length) descParts.push(`Participants: ${init.participants.join(', ')}`);
      if (init.priority) descParts.push(`Priority: ${init.priority}`);
      if (init.target) descParts.push(`Target: ${init.target}`);
      const description = descParts.join('\n');

      // Last history entry timestamp for created_at
      const firstHistory = init.history?.[0];
      const created_at = firstHistory?.at || init.created || now();

      upsert.run({
        id,
        title,
        status,
        description,
        workspace_id,
        initiative_id: init.id || null,
        external_request_id: `initiative:${init.id || id}`,
        source: init.source || 'sync-from-json',
        created_at,
        updated_at: now(),
      });
      count++;
    }
    return count;
  });

  const count = syncMany(data.initiatives);
  console.log(`[sync] Initiatives: ${count} upserted`);
  return count;
}

// ─── Sync agent JSON files → agents table ───────────────────────────────────

function syncAgents(db) {
  const agentFiles = fs.readdirSync(INTEL_STATUS).filter(f =>
    f.match(/^agent-(?!status-template).*\.json$/)
  );

  // Get the primary workspace_id
  const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get();
  const workspace_id = workspace ? workspace.id : null;

  // agents table columns: id, name, role, description, avatar_emoji, status,
  //   is_master, workspace_id, soul_md, user_md, agents_md, tools_md, model,
  //   current_activity, created_at, updated_at
  const upsert = db.prepare(`
    INSERT INTO agents (id, name, role, status, description, current_activity,
      is_master, workspace_id,
      soul_md, tools_md, user_md, agents_md,
      created_at, updated_at)
    VALUES (@id, @name, @role, @status, @description, @current_activity,
      @is_master, @workspace_id,
      @soul_md, @tools_md, @user_md, @agents_md,
      @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      status           = excluded.status,
      current_activity = excluded.current_activity,
      is_master        = excluded.is_master,
      soul_md  = COALESCE(excluded.soul_md, agents.soul_md),
      tools_md = COALESCE(excluded.tools_md, agents.tools_md),
      user_md  = COALESCE(excluded.user_md, agents.user_md),
      agents_md = COALESCE(excluded.agents_md, agents.agents_md),
      name     = CASE WHEN excluded.name != excluded.id THEN excluded.name ELSE agents.name END,
      role     = CASE WHEN excluded.role != excluded.id THEN excluded.role ELSE agents.role END,
      updated_at = excluded.updated_at
  `);

  const syncMany = db.transaction((files) => {
    let count = 0;
    for (const file of files) {
      const agentData = readJSON(path.join(INTEL_STATUS, file));
      if (!agentData) continue;

      const agentId = agentData.agent ||
        file.replace(/^agent-/, '').replace(/\.json$/, '');

      // Read workspace markdown files
      // Main agent workspace is just "workspace" (no suffix), others are "workspace-{id}"
      const wsBase = path.resolve(WORKSPACE, '..');
      const wsDir = (agentId === 'main' || agentId === 'pho')
        ? WORKSPACE
        : path.join(wsBase, `workspace-${agentId}`);
      const soul_md = readFileText(path.join(wsDir, 'SOUL.md'));
      const tools_md = readFileText(path.join(wsDir, 'TOOLS.md'));
      const user_md = readFileText(path.join(wsDir, 'USER.md'));
      const agents_md = readFileText(path.join(wsDir, 'AGENTS.md'));

      // Parse name/role from SOUL.md header (preferred over agent-*.json)
      const parsedSoul = parseAgentNameFromSoul(soul_md);
      const name = parsedSoul?.name || agentData.name || capitalize(agentId);
      const role = parsedSoul?.role || agentData.role || agentId;

      // Build current_activity from task info (separate from description)
      const activityParts = [];
      if (agentData.currentTask) {
        const ct = typeof agentData.currentTask === 'string'
          ? agentData.currentTask
          : JSON.stringify(agentData.currentTask);
        activityParts.push(`Current: ${ct}`);
      }
      if (agentData.last_task_description) {
        activityParts.push(`Last: ${agentData.last_task_description}`);
      }
      if (agentData.initiative) {
        activityParts.push(`Initiative: ${agentData.initiative}`);
      }
      if (agentData.blockers?.length) {
        activityParts.push(`Blockers: ${agentData.blockers.length}`);
      }
      const current_activity = activityParts.join(' | ') || null;

      // Description: use agent-*.json description field only (not task info)
      const description = agentData.description || null;

      // Master orchestrator: pho or main agent
      const is_master = (agentId === 'pho' || agentId === 'main') ? 1 : 0;

      upsert.run({
        id: agentId,
        name,
        role,
        status: mapAgentStatus(agentData.status),
        description,
        current_activity,
        is_master,
        workspace_id,
        soul_md,
        tools_md,
        user_md,
        agents_md,
        created_at: agentData.lastUpdate || now(),
        updated_at: agentData.lastUpdate || now(),
      });
      count++;
    }
    return count;
  });

  const count = syncMany(agentFiles);
  console.log(`[sync] Agents: ${count} upserted`);
  return count;
}

// ─── Sync initiatives → initiative_cache table ──────────────────────────────

function syncInitiativeCache(db) {
  const data = readJSON(INITIATIVES_FILE);
  if (!data || !Array.isArray(data.initiatives)) {
    console.warn('[sync] INITIATIVES.json missing or malformed (cache)');
    return 0;
  }

  // Get the primary workspace_id
  const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get();
  const workspace_id = workspace ? workspace.id : null;

  const upsert = db.prepare(`
    INSERT INTO initiative_cache (
      id, title, status, lead, participants, priority,
      created, target, summary, source, external_request_id,
      history, raw_json, workspace_id, synced_at,
      created_at, updated_at
    )
    VALUES (
      @id, @title, @status, @lead, @participants, @priority,
      @created, @target, @summary, @source, @external_request_id,
      @history, @raw_json, @workspace_id, @synced_at,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      title               = excluded.title,
      status              = excluded.status,
      lead                = excluded.lead,
      participants        = excluded.participants,
      priority            = excluded.priority,
      created             = excluded.created,
      target              = excluded.target,
      summary             = excluded.summary,
      source              = excluded.source,
      external_request_id = excluded.external_request_id,
      history             = excluded.history,
      raw_json            = excluded.raw_json,
      workspace_id        = excluded.workspace_id,
      synced_at           = excluded.synced_at,
      updated_at          = excluded.updated_at
  `);

  const syncMany = db.transaction((initiatives) => {
    let count = 0;
    for (const init of initiatives) {
      upsert.run({
        id: init.id,
        title: init.title,
        status: init.status,
        lead: init.lead || null,
        participants: JSON.stringify(init.participants || []),
        priority: init.priority || null,
        created: init.created || null,
        target: init.target || null,
        summary: init.summary || null,
        source: init.source || null,
        external_request_id: init.external_request_id || null,
        history: JSON.stringify(init.history || []),
        raw_json: JSON.stringify(init),
        workspace_id,
        synced_at: now(),
        created_at: init.created || now(),
        updated_at: now(),
      });
      count++;
    }
    return count;
  });

  const count = syncMany(data.initiatives);
  console.log(`[sync] Initiative cache: ${count} upserted`);
  return count;
}

// ─── Log sync event ──────────────────────────────────────────────────────────

function logSyncEvent(db, initiativeCount, agentCount) {
  try {
    // events columns: id, type, agent_id, task_id, message, metadata, created_at
    db.prepare(`
      INSERT INTO events (type, message, metadata, created_at)
      VALUES ('sync', @message, @metadata, @created_at)
    `).run({
      message: `JSON sync: ${initiativeCount} initiatives, ${agentCount} agents`,
      metadata: JSON.stringify({
        source: 'sync-from-json.js',
        initiatives_synced: initiativeCount,
        agents_synced: agentCount,
      }),
      created_at: now(),
    });
  } catch (e) {
    // Non-fatal — events table schema may vary
    console.warn(`[sync] Could not log event: ${e.message}`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function main() {
  const start = Date.now();
  console.log(`[sync] Starting at ${now()}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[sync] Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    const initCount = syncInitiatives(db);
    const cacheCount = syncInitiativeCache(db);
    const agentCount = syncAgents(db);
    logSyncEvent(db, initCount, agentCount);

    const elapsed = Date.now() - start;
    console.log(`[sync] Complete in ${elapsed}ms — initiatives=${initCount} cache=${cacheCount} agents=${agentCount}`);
  } catch (e) {
    console.error(`[sync] Fatal error: ${e.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
