#!/usr/bin/env node
/**
 * seed-integrations.js — Seed the integrations table with known services
 *
 * Env:
 *   DATABASE_PATH  - Path to mission-control.db
 *   WORKSPACE_BASE_PATH - Fallback for DB location
 *
 * Run: node scripts/seed-integrations.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const WORKSPACE = process.env.WORKSPACE_BASE_PATH || '/home/node/.openclaw/workspace';
const DB_PATH = process.env.DATABASE_PATH || path.join(WORKSPACE, 'mission-control.db');

function now() {
  return new Date().toISOString();
}

// ─── Integration definitions ────────────────────────────────────────────────

const integrations = [
  {
    id: 'integration-notion',
    name: 'Notion',
    type: 'mcp_plugin',
    provider: 'notion',
    credential_source: '1password:Openclaw/Notion - integration API',
    config: JSON.stringify({
      vault: 'Openclaw',
      item: 'Notion - integration API',
      field: 'credential',
    }),
    metadata: JSON.stringify({
      description: 'Notion workspace integration via MCP plugin',
      docs: 'https://developers.notion.com',
    }),
  },
  {
    id: 'integration-slack',
    name: 'Slack',
    type: 'mcp_plugin',
    provider: 'slack',
    credential_source: 'openclaw.json or .env',
    config: JSON.stringify({
      env_var: 'SLACK_BOT_TOKEN',
      token_prefix: 'xoxb-',
    }),
    metadata: JSON.stringify({
      description: 'Slack bot integration via MCP plugin',
      docs: 'https://api.slack.com',
    }),
  },
  {
    id: 'integration-google-sheets',
    name: 'Google Sheets',
    type: 'cli_auth',
    provider: 'google-sheets',
    credential_source: 'gog:default-profile',
    config: JSON.stringify({
      cli: 'gog',
      auth_check: 'gog auth check',
    }),
    metadata: JSON.stringify({
      description: 'Google Sheets access via gog CLI',
    }),
  },
  {
    id: 'integration-1password',
    name: '1Password',
    type: 'credential_provider',
    provider: '1password',
    credential_source: 'op:session',
    config: JSON.stringify({
      cli: 'op',
      auth_check: 'op whoami',
    }),
    metadata: JSON.stringify({
      description: '1Password CLI for credential management',
      docs: 'https://developer.1password.com/docs/cli',
    }),
  },
  {
    id: 'integration-browsermcp',
    name: 'BrowserMCP',
    type: 'mcp_server',
    provider: 'browsermcp',
    credential_source: 'none',
    config: JSON.stringify({
      process_name: 'browsermcp',
    }),
    metadata: JSON.stringify({
      description: 'Browser automation MCP server',
    }),
  },
  {
    id: 'integration-firecrawl',
    name: 'Firecrawl',
    type: 'api_key',
    provider: 'firecrawl',
    credential_source: '.env:FIRECRAWL_API_KEY',
    config: JSON.stringify({
      env_var: 'FIRECRAWL_API_KEY',
    }),
    metadata: JSON.stringify({
      description: 'Firecrawl web scraping API',
      docs: 'https://firecrawl.dev',
    }),
  },
  {
    id: 'integration-last30days',
    name: 'Last30Days',
    type: 'api_key',
    provider: 'last30days',
    credential_source: '.env:OPENAI_API_KEY + XAI_API_KEY',
    config: JSON.stringify({
      env_vars: ['OPENAI_API_KEY', 'XAI_API_KEY'],
    }),
    metadata: JSON.stringify({
      description: 'Last30Days analytics requiring OpenAI and xAI keys',
    }),
  },
];

// ─── Entry point ────────────────────────────────────────────────────────────

function main() {
  console.log('[seed-integrations] Starting at ' + now());

  if (!fs.existsSync(DB_PATH)) {
    console.error('[seed-integrations] Database not found at ' + DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const upsert = db.prepare(`
    INSERT INTO integrations (
      id, name, type, provider, status,
      credential_source, config, metadata,
      created_at, updated_at
    )
    VALUES (
      @id, @name, @type, @provider, @status,
      @credential_source, @config, @metadata,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name              = excluded.name,
      type              = excluded.type,
      provider          = excluded.provider,
      credential_source = excluded.credential_source,
      config            = excluded.config,
      metadata          = excluded.metadata,
      updated_at        = excluded.updated_at
  `);

  const seedAll = db.transaction(function (items) {
    var count = 0;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      upsert.run({
        id: item.id,
        name: item.name,
        type: item.type,
        provider: item.provider,
        status: 'unknown',
        credential_source: item.credential_source,
        config: item.config || null,
        metadata: item.metadata || null,
        created_at: now(),
        updated_at: now(),
      });
      count++;
      console.log('[seed-integrations]   Upserted: ' + item.name + ' (' + item.id + ')');
    }
    return count;
  });

  try {
    var count = seedAll(integrations);
    console.log('[seed-integrations] Done: ' + count + ' integrations seeded');
  } catch (err) {
    console.error('[seed-integrations] Error: ' + err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
