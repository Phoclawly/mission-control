#!/usr/bin/env node
/**
 * sync-memory-index.js — Index agent memory files → SQLite
 *
 * Reads:
 *   - $WORKSPACE_BASE_PATH/memory/ (main workspace memory)
 *   - $WORKSPACE_BASE_PATH/../workspace-{name}/memory/ (per-agent memory)
 *
 * Writes to:
 *   - agent_memory_index table
 *
 * Run: node sync-memory-index.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const WORKSPACE = process.env.WORKSPACE_BASE_PATH || '/home/node/.openclaw/workspace';
const DB_PATH = process.env.DATABASE_PATH || path.join(WORKSPACE, 'mission-control.db');
const BASE_DIR = path.resolve(WORKSPACE, '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * Extract a short summary from a memory file (first 500 chars of content).
 */
function extractSummary(content) {
  if (!content) return null;
  // Strip leading YAML front matter if present
  let text = content;
  if (text.startsWith('---')) {
    const endIdx = text.indexOf('---', 3);
    if (endIdx !== -1) {
      text = text.substring(endIdx + 3).trim();
    }
  }
  // Take first 500 chars
  return text.substring(0, 500).trim() || null;
}

/**
 * Count entries in a memory file.
 * Entries are lines starting with '- ' (list items) or '## ' (h2 headers).
 */
function countEntries(content) {
  if (!content) return 0;
  const lines = content.split('\n');
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('- ') || trimmed.startsWith('## ')) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a filename is a YYYY-MM-DD.md date-based memory file.
 */
function isDateMemoryFile(filename) {
  return /^\d{4}-\d{2}-\d{2}\.md$/.test(filename);
}

/**
 * Extract the date from a YYYY-MM-DD.md filename.
 */
function dateFromFilename(filename) {
  return filename.replace(/\.md$/, '');
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
 * Scan a memory directory and return file metadata.
 */
function scanMemoryDir(memoryDir) {
  try {
    if (!fs.existsSync(memoryDir)) return [];
    return fs.readdirSync(memoryDir)
      .filter(isDateMemoryFile)
      .map(filename => {
        const filePath = path.join(memoryDir, filename);
        try {
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf8');
          return {
            date: dateFromFilename(filename),
            filePath,
            fileSize: stat.size,
            summary: extractSummary(content),
            entryCount: countEntries(content),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Sync memory index ───────────────────────────────────────────────────────

function syncMemoryIndex(db) {
  const upsert = db.prepare(`
    INSERT INTO agent_memory_index (
      id, agent_id, date, file_path, file_size_bytes,
      summary, entry_count, created_at
    )
    VALUES (
      @id, @agent_id, @date, @file_path, @file_size_bytes,
      @summary, @entry_count, @created_at
    )
    ON CONFLICT(agent_id, date) DO UPDATE SET
      file_path       = excluded.file_path,
      file_size_bytes = excluded.file_size_bytes,
      summary         = excluded.summary,
      entry_count     = excluded.entry_count
  `);

  let totalFiles = 0;
  const agentsSeen = new Set();

  // --- Main workspace memory (pho / main agent) ---
  const mainMemoryDir = path.join(WORKSPACE, 'memory');
  const mainFiles = scanMemoryDir(mainMemoryDir);
  const mainAgentId = 'pho'; // Main workspace belongs to pho/main orchestrator

  if (mainFiles.length > 0) {
    // Check if main agent exists in DB
    const agentExists = db.prepare('SELECT 1 FROM agents WHERE id = ?').get(mainAgentId);
    if (agentExists) {
      const syncMain = db.transaction((files) => {
        for (const file of files) {
          upsert.run({
            id: `memory-${mainAgentId}-${file.date}`,
            agent_id: mainAgentId,
            date: file.date,
            file_path: file.filePath,
            file_size_bytes: file.fileSize,
            summary: file.summary,
            entry_count: file.entryCount,
            created_at: now(),
          });
        }
      });
      syncMain(mainFiles);
      totalFiles += mainFiles.length;
      agentsSeen.add(mainAgentId);
    }
  }

  // --- Per-agent workspace memory ---
  try {
    const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    const workspaceDirs = entries
      .filter(d => d.isDirectory() && d.name.startsWith('workspace-'))
      .map(d => path.join(BASE_DIR, d.name));

    for (const wsDir of workspaceDirs) {
      const agentId = agentIdFromWorkspaceDir(wsDir);
      if (!agentId) continue;

      // Check if agent exists in DB
      const agentExists = db.prepare('SELECT 1 FROM agents WHERE id = ?').get(agentId);
      if (!agentExists) continue;

      const memoryDir = path.join(wsDir, 'memory');
      const files = scanMemoryDir(memoryDir);
      if (files.length === 0) continue;

      const syncAgent = db.transaction((memFiles) => {
        for (const file of memFiles) {
          upsert.run({
            id: `memory-${agentId}-${file.date}`,
            agent_id: agentId,
            date: file.date,
            file_path: file.filePath,
            file_size_bytes: file.fileSize,
            summary: file.summary,
            entry_count: file.entryCount,
            created_at: now(),
          });
        }
      });
      syncAgent(files);
      totalFiles += files.length;
      agentsSeen.add(agentId);
    }
  } catch (e) {
    console.warn(`[sync] Could not scan workspace directories: ${e.message}`);
  }

  return { totalFiles, agentCount: agentsSeen.size };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function main() {
  const start = Date.now();
  console.log(`[sync] sync-memory-index starting at ${now()}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[sync] Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    const result = syncMemoryIndex(db);

    const elapsed = Date.now() - start;
    console.log(`[sync] Complete in ${elapsed}ms — memory_files=${result.totalFiles} agents=${result.agentCount}`);
  } catch (e) {
    console.error(`[sync] Fatal error: ${e.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
