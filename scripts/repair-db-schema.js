#!/usr/bin/env node

'use strict';

const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || '/home/node/.openclaw/workspace/mission-control.db';
const db = new Database(dbPath);

try {
  const cols = new Set(
    db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name)
  );

  if (!cols.has('initiative_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN initiative_id TEXT');
    console.log('[repair-db] Added initiative_id');
  }

  if (!cols.has('external_request_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN external_request_id TEXT');
    console.log('[repair-db] Added external_request_id');
  }

  if (!cols.has('source')) {
    db.exec('ALTER TABLE tasks ADD COLUMN source TEXT');
    console.log('[repair-db] Added source');
  }

  db.exec("UPDATE tasks SET source = 'mission-control' WHERE source IS NULL OR source = ''");
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_initiative_id ON tasks(initiative_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source_external_request_id ON tasks(source, external_request_id) WHERE external_request_id IS NOT NULL');

  const migrationExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
    .get();

  if (migrationExists) {
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (id, name) VALUES ('008', 'repair_tasks_initiative_contract_columns')"
    ).run();
    console.log('[repair-db] Marked migration 008 as applied');
  }

  const colsAfter = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
  console.log('[repair-db] Final tasks columns:', colsAfter.join(', '));
} finally {
  db.close();
}
