#!/usr/bin/env node
/**
 * sync-learnings-index.js — Index agent learnings files → SQLite
 *
 * Reads:
 *   - $WORKSPACE_BASE_PATH/../workspace-{name}/learnings/ (per-agent)
 *
 * Writes to:
 *   - agent_learnings_index table
 *
 * Run: node sync-learnings-index.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const WORKSPACE = process.env.WORKSPACE_BASE_PATH || '/home/node/.openclaw/workspace';
const DB_PATH = process.env.DATABASE_PATH || path.join(WORKSPACE, 'mission-control.db');
const BASE_DIR = path.resolve(WORKSPACE, '..');

function now() {
  return new Date().toISOString();
}

/**
 * Count entries in a markdown file by counting lines starting with '- '.
 */
function countEntries(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').filter(line => line.trimStart().startsWith('- ')).length;
  } catch {
    return 0;
  }
}

/**
 * Count reflections in pending-reflections.md (### headers).
 */
function countPending(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').filter(line => line.startsWith('### ')).length;
  } catch {
    return 0;
  }
}

/**
 * Get file size in bytes, 0 if not exists.
 */
function fileSize(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Extract last learning date from learnings.md (last ### header date).
 */
function lastLearningDate(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const dates = content.split('\n')
      .filter(line => line.startsWith('### '))
      .map(line => {
        const match = line.match(/(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    return dates.length > 0 ? dates[dates.length - 1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract agent ID from workspace-{id} directory name.
 */
function agentIdFromDir(dirName) {
  const match = dirName.match(/^workspace-(.+)$/);
  return match ? match[1] : null;
}

// ─── Sync learnings index ───────────────────────────────────────────────────

function syncLearningsIndex(db) {
  // Ensure table exists (in case migration hasn't run yet)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_learnings_index (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      learnings_count INTEGER DEFAULT 0,
      anti_patterns_count INTEGER DEFAULT 0,
      pending_count INTEGER DEFAULT 0,
      learnings_size_bytes INTEGER DEFAULT 0,
      last_learning_date TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agent_id)
    );
  `);

  const upsert = db.prepare(`
    INSERT INTO agent_learnings_index (
      id, agent_id, learnings_count, anti_patterns_count, pending_count,
      learnings_size_bytes, last_learning_date, updated_at
    )
    VALUES (
      @id, @agent_id, @learnings_count, @anti_patterns_count, @pending_count,
      @learnings_size_bytes, @last_learning_date, @updated_at
    )
    ON CONFLICT(agent_id) DO UPDATE SET
      learnings_count     = excluded.learnings_count,
      anti_patterns_count = excluded.anti_patterns_count,
      pending_count       = excluded.pending_count,
      learnings_size_bytes = excluded.learnings_size_bytes,
      last_learning_date  = excluded.last_learning_date,
      updated_at          = excluded.updated_at
  `);

  let agentCount = 0;

  try {
    const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    const workspaceDirs = entries
      .filter(d => d.isDirectory() && d.name.startsWith('workspace-'))
      .map(d => d.name);

    const syncAll = db.transaction((dirs) => {
      for (const dirName of dirs) {
        const agentId = agentIdFromDir(dirName);
        if (!agentId) continue;

        // Check if agent exists in DB
        const agentExists = db.prepare('SELECT 1 FROM agents WHERE id = ?').get(agentId);
        if (!agentExists) continue;

        const wsPath = path.join(BASE_DIR, dirName);
        const learningsPath = path.join(wsPath, 'learnings', 'learnings.md');
        const antiPatternsPath = path.join(wsPath, 'learnings', 'anti-patterns.md');
        const pendingPath = path.join(wsPath, 'learnings', 'pending-reflections.md');

        upsert.run({
          id: `learnings-${agentId}`,
          agent_id: agentId,
          learnings_count: countEntries(learningsPath),
          anti_patterns_count: countEntries(antiPatternsPath),
          pending_count: countPending(pendingPath),
          learnings_size_bytes: fileSize(learningsPath),
          last_learning_date: lastLearningDate(learningsPath),
          updated_at: now(),
        });

        agentCount++;
      }
    });

    syncAll(workspaceDirs);
  } catch (e) {
    console.warn(`[sync] Could not scan workspace directories: ${e.message}`);
  }

  return { agentCount };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function main() {
  const start = Date.now();
  console.log(`[sync] sync-learnings-index starting at ${now()}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[sync] Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    const result = syncLearningsIndex(db);
    const elapsed = Date.now() - start;
    console.log(`[sync] Complete in ${elapsed}ms — agents_with_learnings=${result.agentCount}`);
  } catch (e) {
    console.error(`[sync] Fatal error: ${e.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
