/**
 * Global test setup — runs once per worker before any test file.
 * Each test file declares its own vi.mock() calls (hoisted by Vitest).
 * This file only handles global env guards.
 */

// Ensure tests never accidentally write to a production DB.
// Each test file sets DATABASE_PATH to a unique tmp path via helpers/db.ts.
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = '/tmp/mc-test-guard.db';
}

// Never hit a real OpenClaw Gateway in tests.
process.env.OPENCLAW_GATEWAY_URL = 'ws://127.0.0.1:19999'; // port no one listens on
