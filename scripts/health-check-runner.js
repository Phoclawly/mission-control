#!/usr/bin/env node
/**
 * health-check-runner.js — Run all health checks and POST results to Mission Control
 *
 * Env:
 *   MISSION_CONTROL_URL  - Base URL of MC (e.g. http://localhost:4000)
 *   DATABASE_PATH         - Path to mission-control.db (for resolving target IDs)
 *
 * Run: node scripts/health-check-runner.js
 * Cron: every 15 minutes (or manually)
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:4000';

// ─── Helpers ────────────────────────────────────────────────────────────────

function runCmd(cmd, timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  try {
    const stdout = execSync(cmd, {
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      ok: false,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
      message: err.message,
    };
  }
}

function timed(fn) {
  const start = Date.now();
  try {
    const result = fn();
    result.duration_ms = Date.now() - start;
    return result;
  } catch (err) {
    return {
      status: 'fail',
      message: err.message || String(err),
      duration_ms: Date.now() - start,
    };
  }
}

// ─── Health check definitions ───────────────────────────────────────────────

const checks = [
  {
    target_type: 'integration',
    target_id: 'integration-1password',
    name: '1Password CLI',
    run: function () {
      return timed(function () {
        var r = runCmd('op whoami');
        if (r.ok) {
          return { status: 'pass', message: 'Authenticated: ' + r.stdout.split('\n')[0] };
        }
        return { status: 'fail', message: r.stderr || r.message };
      });
    },
  },
  {
    target_type: 'integration',
    target_id: 'integration-notion',
    name: 'Notion Integration',
    run: function () {
      return timed(function () {
        var r = runCmd('op read "op://Openclaw/Notion - integration API/credential"');
        if (r.ok && r.stdout.length > 0) {
          return { status: 'pass', message: 'Notion credential retrieved from 1Password' };
        }
        return { status: 'fail', message: r.stderr || r.message || 'Credential empty' };
      });
    },
  },
  {
    target_type: 'integration',
    target_id: 'integration-slack',
    name: 'Slack Bot Token',
    run: function () {
      return timed(function () {
        var token = process.env.SLACK_BOT_TOKEN;
        if (token && token.startsWith('xoxb-')) {
          return { status: 'pass', message: 'SLACK_BOT_TOKEN present and well-formed' };
        }
        if (token) {
          return { status: 'warn', message: 'SLACK_BOT_TOKEN present but unexpected format' };
        }
        return { status: 'fail', message: 'SLACK_BOT_TOKEN not set' };
      });
    },
  },
  {
    target_type: 'integration',
    target_id: 'integration-google-sheets',
    name: 'Google Sheets (gog)',
    run: function () {
      return timed(function () {
        var r = runCmd('gog auth check');
        if (r.ok) {
          return { status: 'pass', message: 'gog auth: ' + r.stdout };
        }
        return { status: 'fail', message: r.stderr || r.message };
      });
    },
  },
  {
    target_type: 'capability',
    target_id: 'capability-browsermcp',
    name: 'BrowserMCP Server',
    run: function () {
      return timed(function () {
        var r = runCmd('pgrep -f browsermcp || pgrep -f browser-mcp');
        if (r.ok && r.stdout) {
          return { status: 'pass', message: 'BrowserMCP process running (PID: ' + r.stdout.split('\n')[0] + ')' };
        }
        return { status: 'fail', message: 'BrowserMCP process not found' };
      });
    },
  },
  {
    target_type: 'capability',
    target_id: 'capability-playwright',
    name: 'Playwright',
    run: function () {
      return timed(function () {
        var r = runCmd('npx playwright --version');
        if (r.ok) {
          return { status: 'pass', message: 'Playwright ' + r.stdout };
        }
        return { status: 'fail', message: r.stderr || r.message };
      });
    },
  },
  {
    target_type: 'capability',
    target_id: 'capability-browser-use',
    name: 'browser-use',
    run: function () {
      return timed(function () {
        try {
          require.resolve('browser-use');
          return { status: 'pass', message: 'browser-use module resolvable' };
        } catch (e) {
          if (e.code === 'MODULE_NOT_FOUND') {
            return { status: 'fail', message: 'browser-use module not installed' };
          }
          return { status: 'warn', message: 'browser-use found but errored: ' + e.message };
        }
      });
    },
  },
];

// ─── POST result to MC ──────────────────────────────────────────────────────

async function postResult(result) {
  var url = MISSION_CONTROL_URL + '/api/health';
  try {
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_type: result.target_type,
        target_id: result.target_id,
        status: result.status,
        message: result.message,
        duration_ms: result.duration_ms,
      }),
    });
    if (!resp.ok) {
      var body = await resp.text();
      console.warn('[health] POST failed for ' + result.target_id + ': ' + resp.status + ' ' + body);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[health] POST error for ' + result.target_id + ': ' + err.message);
    return false;
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

async function main() {
  var startTime = Date.now();
  console.log('[health] Starting health checks at ' + new Date().toISOString());
  console.log('[health] Mission Control URL: ' + MISSION_CONTROL_URL);

  var results = [];
  var posted = 0;
  var failed = 0;

  for (var i = 0; i < checks.length; i++) {
    var check = checks[i];
    console.log('[health] Running: ' + check.name + ' ...');

    var result = check.run();
    result.target_type = check.target_type;
    result.target_id = check.target_id;
    result.name = check.name;

    console.log('[health]   ' + result.status.toUpperCase() + ' — ' + result.message + ' (' + result.duration_ms + 'ms)');

    var ok = await postResult(result);
    if (ok) {
      posted++;
    } else {
      failed++;
    }

    results.push({
      target_type: result.target_type,
      target_id: result.target_id,
      name: result.name,
      status: result.status,
      message: result.message,
      duration_ms: result.duration_ms,
      posted: ok,
    });
  }

  var elapsed = Date.now() - startTime;

  var summary = {
    timestamp: new Date().toISOString(),
    total: checks.length,
    pass: results.filter(function (r) { return r.status === 'pass'; }).length,
    fail: results.filter(function (r) { return r.status === 'fail'; }).length,
    warn: results.filter(function (r) { return r.status === 'warn'; }).length,
    skip: results.filter(function (r) { return r.status === 'skip'; }).length,
    posted: posted,
    post_failures: failed,
    elapsed_ms: elapsed,
    results: results,
  };

  console.log('\n' + JSON.stringify(summary, null, 2));
  return summary;
}

main().catch(function (err) {
  console.error('[health] Fatal: ' + err.message);
  process.exit(1);
});
