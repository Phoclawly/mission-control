#!/usr/bin/env node
/**
 * sync-daemon.js — Runs sync-from-json every 5 minutes as a pm2 process
 * 
 * Persistent sync daemon that keeps Mission Control SQLite in sync with
 * INITIATIVES.json and agent-*.json files.
 * 
 * Managed by pm2 as 'mc-sync-daemon'
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'sync-from-json.js');
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function runSync() {
  const ts = new Date().toISOString();
  try {
    const output = execSync(`node "${SCRIPT}"`, {
      cwd: path.join(__dirname, '..'),
      timeout: 30000,
      encoding: 'utf8',
    });
    console.log(`[${ts}] sync OK: ${output.trim().split('\n').pop()}`);
  } catch (e) {
    console.error(`[${ts}] sync FAILED: ${e.message}`);
  }
}

// Run immediately on start
runSync();

// Then every 5 minutes
setInterval(runSync, INTERVAL_MS);

console.log(`[sync-daemon] Started. Will sync every ${INTERVAL_MS / 1000}s`);
