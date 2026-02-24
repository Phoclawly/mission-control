#!/usr/bin/env node
/**
 * sync-capabilities.js — Sync skills, integrations, and cron jobs → SQLite
 *
 * Reads:
 *   - $WORKSPACE_BASE_PATH/../skills/ (shared skills)
 *   - $WORKSPACE_BASE_PATH/../workspace-*/skills/ (agent-specific skills)
 *   - $WORKSPACE_BASE_PATH/../openclaw.json (config: skills, MCP plugins, cron)
 *   - System crontab (if available)
 *
 * Writes to:
 *   - capabilities, agent_capabilities, integrations, cron_jobs tables
 *
 * Run: node sync-capabilities.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const WORKSPACE = process.env.WORKSPACE_BASE_PATH || '/home/node/.openclaw/workspace';
const DB_PATH = process.env.DATABASE_PATH || path.join(WORKSPACE, 'mission-control.db');
const BASE_DIR = path.resolve(WORKSPACE, '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.warn(`[sync] Could not read ${filePath}: ${e.message}`);
    return null;
  }
}

function now() {
  return new Date().toISOString();
}

/**
 * List directories matching a glob-like pattern under BASE_DIR.
 * Returns array of full paths.
 */
function listDirs(parentDir, prefix) {
  try {
    return fs.readdirSync(parentDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith(prefix))
      .map(d => path.join(parentDir, d.name));
  } catch {
    return [];
  }
}

/**
 * List skill directories inside a given skills folder.
 * Each subdirectory with a skill.json or SOUL.md is considered a skill.
 */
function listSkills(skillsDir) {
  try {
    if (!fs.existsSync(skillsDir)) return [];
    return fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const skillPath = path.join(skillsDir, d.name);
        const skillJson = readJSON(path.join(skillPath, 'skill.json'));
        const hasSoul = fs.existsSync(path.join(skillPath, 'SOUL.md'));
        if (!skillJson && !hasSoul) return null;
        return {
          name: d.name,
          path: skillPath,
          config: skillJson,
          hasSoul,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Extract agent ID from a workspace-{id} directory name.
 */
function agentIdFromWorkspaceDir(dirPath) {
  const base = path.basename(dirPath);
  const match = base.match(/^workspace-(.+)$/);
  return match ? match[1] : null;
}

/**
 * Read crontab entries for the current user.
 */
function readCrontab() {
  try {
    const output = execSync('crontab -l 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    return output
      .split('\n')
      .filter(line => line.trim() && !line.startsWith('#'))
      .map(line => {
        // Standard cron format: min hour dom month dow command
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) return null;
        const schedule = parts.slice(0, 5).join(' ');
        const command = parts.slice(5).join(' ');
        return { schedule, command, raw: line.trim() };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Sync shared capabilities (skills) ──────────────────────────────────────

function syncSharedSkills(db) {
  const sharedSkillsDir = path.join(BASE_DIR, 'skills');
  const skills = listSkills(sharedSkillsDir);

  const upsertCapability = db.prepare(`
    INSERT INTO capabilities (
      id, name, category, description, provider, version,
      install_path, config_ref, is_shared, status, metadata,
      created_at, updated_at
    )
    VALUES (
      @id, @name, @category, @description, @provider, @version,
      @install_path, @config_ref, @is_shared, @status, @metadata,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name         = excluded.name,
      description  = excluded.description,
      provider     = excluded.provider,
      version      = excluded.version,
      install_path = excluded.install_path,
      config_ref   = excluded.config_ref,
      is_shared    = excluded.is_shared,
      metadata     = excluded.metadata,
      updated_at   = excluded.updated_at
  `);

  const syncMany = db.transaction((skillList) => {
    let count = 0;
    for (const skill of skillList) {
      const id = `skill-${skill.name}`;
      const config = skill.config || {};

      upsertCapability.run({
        id,
        name: config.name || skill.name,
        category: 'skill',
        description: config.description || null,
        provider: config.provider || null,
        version: config.version || null,
        install_path: skill.path,
        config_ref: config.config_ref || null,
        is_shared: 1,
        status: 'unknown',
        metadata: Object.keys(config).length > 0 ? JSON.stringify(config) : null,
        created_at: now(),
        updated_at: now(),
      });
      count++;
    }
    return count;
  });

  return syncMany(skills);
}

// ─── Sync agent-specific capabilities ────────────────────────────────────────

function syncAgentSkills(db) {
  const workspaceDirs = listDirs(BASE_DIR, 'workspace-');

  const upsertCapability = db.prepare(`
    INSERT INTO capabilities (
      id, name, category, description, provider, version,
      install_path, config_ref, is_shared, status, metadata,
      created_at, updated_at
    )
    VALUES (
      @id, @name, @category, @description, @provider, @version,
      @install_path, @config_ref, @is_shared, @status, @metadata,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name         = excluded.name,
      description  = excluded.description,
      provider     = excluded.provider,
      version      = excluded.version,
      install_path = excluded.install_path,
      config_ref   = excluded.config_ref,
      is_shared    = excluded.is_shared,
      metadata     = excluded.metadata,
      updated_at   = excluded.updated_at
  `);

  const upsertAgentCap = db.prepare(`
    INSERT INTO agent_capabilities (agent_id, capability_id, enabled)
    VALUES (@agent_id, @capability_id, 1)
    ON CONFLICT(agent_id, capability_id) DO UPDATE SET
      enabled = 1
  `);

  const syncMany = db.transaction((dirs) => {
    let count = 0;
    for (const wsDir of dirs) {
      const agentId = agentIdFromWorkspaceDir(wsDir);
      if (!agentId) continue;

      const skillsDir = path.join(wsDir, 'skills');
      const skills = listSkills(skillsDir);

      for (const skill of skills) {
        const id = `skill-${agentId}-${skill.name}`;
        const config = skill.config || {};

        upsertCapability.run({
          id,
          name: config.name || skill.name,
          category: 'skill',
          description: config.description || null,
          provider: config.provider || null,
          version: config.version || null,
          install_path: skill.path,
          config_ref: config.config_ref || null,
          is_shared: 0,
          status: 'unknown',
          metadata: Object.keys(config).length > 0 ? JSON.stringify(config) : null,
          created_at: now(),
          updated_at: now(),
        });

        // Check if agent exists before linking
        const agentExists = db.prepare('SELECT 1 FROM agents WHERE id = ?').get(agentId);
        if (agentExists) {
          upsertAgentCap.run({ agent_id: agentId, capability_id: id });
        }

        count++;
      }
    }
    return count;
  });

  return syncMany(workspaceDirs);
}

// ─── Sync from openclaw.json: skills config_ref, MCP plugins, cron ──────────

function syncFromOpenclawJson(db) {
  const configPath = path.join(BASE_DIR, 'openclaw.json');
  const config = readJSON(configPath);
  if (!config) return { skills: 0, integrations: 0, crons: 0 };

  let skillsUpdated = 0;
  let integrationsCount = 0;
  let cronsCount = 0;

  // --- Skills entries from openclaw.json ---
  if (config.skills && config.skills.entries) {
    const updateConfigRef = db.prepare(`
      UPDATE capabilities SET config_ref = @config_ref, updated_at = @updated_at
      WHERE id = @id
    `);

    const upsertCapability = db.prepare(`
      INSERT INTO capabilities (
        id, name, category, description, provider, version,
        install_path, config_ref, is_shared, status, metadata,
        created_at, updated_at
      )
      VALUES (
        @id, @name, @category, @description, @provider, @version,
        @install_path, @config_ref, @is_shared, @status, @metadata,
        @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name         = excluded.name,
        description  = excluded.description,
        config_ref   = excluded.config_ref,
        metadata     = excluded.metadata,
        updated_at   = excluded.updated_at
    `);

    const syncSkillEntries = db.transaction((entries) => {
      let count = 0;
      for (const [skillName, skillConfig] of Object.entries(entries)) {
        const id = `skill-${skillName}`;
        const existing = db.prepare('SELECT 1 FROM capabilities WHERE id = ?').get(id);
        const configRef = typeof skillConfig === 'string' ? skillConfig : JSON.stringify(skillConfig);

        if (existing) {
          updateConfigRef.run({ id, config_ref: configRef, updated_at: now() });
        } else {
          // Skill defined in config but not found on filesystem
          upsertCapability.run({
            id,
            name: skillName,
            category: 'skill',
            description: null,
            provider: null,
            version: null,
            install_path: null,
            config_ref: configRef,
            is_shared: 1,
            status: 'unknown',
            metadata: typeof skillConfig === 'object' ? JSON.stringify(skillConfig) : null,
            created_at: now(),
            updated_at: now(),
          });
        }
        count++;
      }
      return count;
    });

    skillsUpdated = syncSkillEntries(config.skills.entries);
  }

  // --- MCP plugins from openclaw.json ---
  if (config.mcp) {
    const upsertIntegration = db.prepare(`
      INSERT INTO integrations (
        id, name, type, provider, status, credential_source,
        config, metadata, created_at, updated_at
      )
      VALUES (
        @id, @name, @type, @provider, @status, @credential_source,
        @config, @metadata, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name              = excluded.name,
        provider          = excluded.provider,
        config            = excluded.config,
        metadata          = excluded.metadata,
        updated_at        = excluded.updated_at
    `);

    const syncMcp = db.transaction((mcpConfig) => {
      let count = 0;
      // Handle both mcpServers and plugins patterns
      const servers = mcpConfig.mcpServers || mcpConfig.servers || mcpConfig;
      if (typeof servers !== 'object') return 0;

      for (const [name, serverConfig] of Object.entries(servers)) {
        if (typeof serverConfig !== 'object' || serverConfig === null) continue;

        const id = `integration-mcp-${name}`;
        upsertIntegration.run({
          id,
          name: `MCP: ${name}`,
          type: 'mcp_plugin',
          provider: serverConfig.command || serverConfig.provider || name,
          status: 'unknown',
          credential_source: serverConfig.env ? Object.keys(serverConfig.env).join(', ') : null,
          config: JSON.stringify(serverConfig),
          metadata: null,
          created_at: now(),
          updated_at: now(),
        });
        count++;
      }
      return count;
    });

    integrationsCount = syncMcp(config.mcp);
  }

  // --- Cron entries from openclaw.json ---
  if (config.cron && Array.isArray(config.cron)) {
    const upsertCron = db.prepare(`
      INSERT INTO cron_jobs (
        id, name, schedule, command, agent_id, type,
        status, description, created_at, updated_at
      )
      VALUES (
        @id, @name, @schedule, @command, @agent_id, @type,
        @status, @description, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name        = excluded.name,
        schedule    = excluded.schedule,
        command     = excluded.command,
        agent_id    = excluded.agent_id,
        type        = excluded.type,
        description = excluded.description,
        updated_at  = excluded.updated_at
    `);

    const syncCronEntries = db.transaction((entries) => {
      let count = 0;
      for (const entry of entries) {
        if (!entry.name || !entry.schedule || !entry.command) continue;

        const id = `cron-${entry.name}`;
        const agentId = entry.agent || entry.agent_id || null;

        // Validate agent exists if specified
        let validAgentId = null;
        if (agentId) {
          const agentExists = db.prepare('SELECT 1 FROM agents WHERE id = ?').get(agentId);
          validAgentId = agentExists ? agentId : null;
        }

        upsertCron.run({
          id,
          name: entry.name,
          schedule: entry.schedule,
          command: entry.command,
          agent_id: validAgentId,
          type: entry.type || 'shell',
          status: 'active',
          description: entry.description || null,
          created_at: now(),
          updated_at: now(),
        });
        count++;
      }
      return count;
    });

    cronsCount = syncCronEntries(config.cron);
  }

  return { skills: skillsUpdated, integrations: integrationsCount, crons: cronsCount };
}

// ─── Sync system crontab entries ─────────────────────────────────────────────

function syncSystemCrontab(db) {
  const entries = readCrontab();
  if (entries.length === 0) return 0;

  const upsertCron = db.prepare(`
    INSERT INTO cron_jobs (
      id, name, schedule, command, type,
      status, description, created_at, updated_at
    )
    VALUES (
      @id, @name, @schedule, @command, @type,
      @status, @description, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      schedule    = excluded.schedule,
      command     = excluded.command,
      description = excluded.description,
      updated_at  = excluded.updated_at
  `);

  const syncMany = db.transaction((cronEntries) => {
    let count = 0;
    for (const entry of cronEntries) {
      // Generate deterministic ID from command hash
      const cmdSlug = entry.command
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60);
      const id = `cron-sys-${cmdSlug}`;

      upsertCron.run({
        id,
        name: `System: ${entry.command.substring(0, 80)}`,
        schedule: entry.schedule,
        command: entry.command,
        type: 'shell',
        status: 'active',
        description: `From system crontab: ${entry.raw}`,
        created_at: now(),
        updated_at: now(),
      });
      count++;
    }
    return count;
  });

  return syncMany(entries);
}

// ─── Link shared capabilities to agents ──────────────────────────────────────

function linkSharedCapabilitiesToAgents(db) {
  // All shared capabilities should be linked to all agents
  const sharedCaps = db.prepare(
    'SELECT id FROM capabilities WHERE is_shared = 1'
  ).all();
  const agents = db.prepare('SELECT id FROM agents').all();

  if (sharedCaps.length === 0 || agents.length === 0) return 0;

  const upsertAgentCap = db.prepare(`
    INSERT INTO agent_capabilities (agent_id, capability_id, enabled)
    VALUES (@agent_id, @capability_id, 1)
    ON CONFLICT(agent_id, capability_id) DO NOTHING
  `);

  const linkAll = db.transaction(() => {
    let count = 0;
    for (const agent of agents) {
      for (const cap of sharedCaps) {
        upsertAgentCap.run({ agent_id: agent.id, capability_id: cap.id });
        count++;
      }
    }
    return count;
  });

  return linkAll();
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function main() {
  const start = Date.now();
  console.log(`[sync] sync-capabilities starting at ${now()}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[sync] Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    const sharedCount = syncSharedSkills(db);
    console.log(`[sync] Shared skills: ${sharedCount} upserted`);

    const agentCount = syncAgentSkills(db);
    console.log(`[sync] Agent-specific skills: ${agentCount} upserted`);

    const ocResult = syncFromOpenclawJson(db);
    console.log(`[sync] openclaw.json: skills=${ocResult.skills} integrations=${ocResult.integrations} crons=${ocResult.crons}`);

    const sysCrons = syncSystemCrontab(db);
    console.log(`[sync] System crontab: ${sysCrons} entries`);

    const linkedCount = linkSharedCapabilitiesToAgents(db);
    console.log(`[sync] Agent-capability links: ${linkedCount} upserted`);

    const totalCaps = sharedCount + agentCount + ocResult.skills;
    const totalIntegrations = ocResult.integrations;
    const totalCrons = ocResult.crons + sysCrons;

    const elapsed = Date.now() - start;
    console.log(`[sync] Complete in ${elapsed}ms — capabilities=${totalCaps} integrations=${totalIntegrations} crons=${totalCrons}`);
  } catch (e) {
    console.error(`[sync] Fatal error: ${e.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
