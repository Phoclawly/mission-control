#!/usr/bin/env node
/**
 * sync-daemon.js — Runs all sync scripts every 5 minutes as a pm2 process
 *
 * Persistent sync daemon that keeps Mission Control SQLite in sync with:
 *   - INITIATIVES.json and agent-*.json files (sync-from-json.js)
 *   - Skills, integrations, and cron jobs (sync-capabilities.js)
 *   - Agent memory file index (sync-memory-index.js)
 *
 * Managed by pm2 as 'mc-sync-daemon'
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  { name: 'sync-from-json', path: path.join(__dirname, 'sync-from-json.js') },
  { name: 'sync-capabilities', path: path.join(__dirname, 'sync-capabilities.js') },
  { name: 'sync-memory-index', path: path.join(__dirname, 'sync-memory-index.js') },
  { name: 'sync-learnings-index', path: path.join(__dirname, 'sync-learnings-index.js') },
];
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function runSync() {
  const ts = new Date().toISOString();
  for (const script of SCRIPTS) {
    try {
      const output = execSync(`node "${script.path}"`, {
        cwd: path.join(__dirname, '..'),
        timeout: 30000,
        encoding: 'utf8',
      });
      console.log(`[${ts}] ${script.name} OK: ${output.trim().split('\n').pop()}`);
    } catch (e) {
      console.error(`[${ts}] ${script.name} FAILED: ${e.message}`);
    }
  }
}

// Run immediately on start
runSync();

// Then every 5 minutes
setInterval(runSync, INTERVAL_MS);

console.log(`[sync-daemon] Started. Will run ${SCRIPTS.length} sync scripts every ${INTERVAL_MS / 1000}s`);
