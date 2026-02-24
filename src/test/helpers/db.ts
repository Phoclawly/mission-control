/**
 * Database test helpers.
 *
 * Strategy: this module owns a direct better-sqlite3 connection (_db) to the
 * test database file.  It does NOT import @/lib/db (which reads DB_PATH at
 * module load time), so the application's module can load *after* we set
 * DATABASE_PATH, ensuring both connections point at the same file.
 *
 * Usage pattern (per test file):
 *   beforeAll(() => setupTestDb())
 *   beforeEach(() => resetTables())
 *   afterAll(() => teardownTestDb())
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { schema } from '@/lib/db/schema';
import { runMigrations } from '@/lib/db/migrations';

// ─── Internal state ───────────────────────────────────────────────────────────

let _db: Database.Database | null = null;
let _testDbPath: string | null = null;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Creates a fresh SQLite file for this test run and initialises the full
 * schema + migrations.  Sets DATABASE_PATH so the app's @/lib/db module uses
 * the same file when it is first imported.
 *
 * Call in beforeAll().
 */
export function setupTestDb(): void {
  _testDbPath = path.join(
    os.tmpdir(),
    `mc-test-${process.pid}-${Date.now()}.db`
  );
  process.env.DATABASE_PATH = _testDbPath;

  _db = new Database(_testDbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(schema);
  runMigrations(_db);
}

/**
 * Closes and deletes the test database.  Call in afterAll().
 */
export function teardownTestDb(): void {
  _db?.close();
  _db = null;

  if (_testDbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${_testDbPath}${suffix}`); } catch { /* ignore */ }
    }
    _testDbPath = null;
  }
}

/**
 * Deletes all rows from every table (schema intact).  Call in beforeEach().
 */
export function resetTables(): void {
  if (!_db) throw new Error('setupTestDb() was not called');
  _db.pragma('foreign_keys = OFF');
  _db.exec(`
    DELETE FROM agent_memory_index;
    DELETE FROM health_checks;
    DELETE FROM cron_jobs;
    DELETE FROM agent_capabilities;
    DELETE FROM capabilities;
    DELETE FROM integrations;
    DELETE FROM task_deliverables;
    DELETE FROM task_activities;
    DELETE FROM openclaw_sessions;
    DELETE FROM planning_specs;
    DELETE FROM planning_questions;
    DELETE FROM messages;
    DELETE FROM conversation_participants;
    DELETE FROM conversations;
    DELETE FROM events;
    DELETE FROM tasks;
    DELETE FROM agents;
    DELETE FROM workspaces;
    DELETE FROM businesses;
  `);
  _db.pragma('foreign_keys = ON');
}

// ─── Query helpers (use the test DB directly, not the app's singleton) ────────

export function dbQueryAll<T>(sql: string, params: unknown[] = []): T[] {
  if (!_db) throw new Error('setupTestDb() was not called');
  return _db.prepare(sql).all(...params) as T[];
}

export function dbQueryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  if (!_db) throw new Error('setupTestDb() was not called');
  return _db.prepare(sql).get(...params) as T | undefined;
}

export function dbRun(sql: string, params: unknown[] = []): Database.RunResult {
  if (!_db) throw new Error('setupTestDb() was not called');
  return _db.prepare(sql).run(...params);
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export interface SeedWorkspace { id: string; name: string; slug: string }
export function seedWorkspace(
  overrides: Partial<SeedWorkspace & { description: string }> = {}
): SeedWorkspace {
  const ws: SeedWorkspace = {
    id:   overrides.id   ?? uuidv4(),
    name: overrides.name ?? 'Test Workspace',
    slug: overrides.slug ?? 'test-workspace',
  };
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO workspaces (id, name, slug, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ws.id, ws.name, ws.slug, overrides.description ?? 'A test workspace', now, now]
  );
  return ws;
}

export interface SeedAgent { id: string; name: string; workspace_id: string; is_master: number }
export function seedAgent(
  workspaceId: string,
  overrides: Partial<Omit<SeedAgent, 'workspace_id'> & { status: string; role: string }> = {}
): SeedAgent {
  const agent: SeedAgent = {
    id:        overrides.id        ?? uuidv4(),
    name:      overrides.name      ?? 'Test Agent',
    is_master: overrides.is_master ?? 0,
    workspace_id: workspaceId,
  };
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO agents
       (id, name, role, avatar_emoji, status, is_master, workspace_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agent.id,
      agent.name,
      overrides.role   ?? 'assistant',
      '🤖',
      overrides.status ?? 'standby',
      agent.is_master,
      agent.workspace_id,
      now,
      now,
    ]
  );
  return agent;
}

export interface SeedTask { id: string; title: string; status: string; workspace_id: string }
export function seedTask(
  workspaceId: string,
  overrides: Partial<{
    id: string; title: string; status: string;
    assigned_agent_id: string | null;
    external_request_id: string | null;
    source: string;
    initiative_id: string | null;
    priority: string;
    task_type: string;
    task_type_config: string | null;
  }> = {}
): SeedTask {
  const task: SeedTask = {
    id:           overrides.id     ?? uuidv4(),
    title:        overrides.title  ?? 'Test Task',
    status:       overrides.status ?? 'inbox',
    workspace_id: workspaceId,
  };
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO tasks
       (id, title, status, workspace_id, assigned_agent_id,
        external_request_id, source, initiative_id, priority,
        task_type, task_type_config,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id, task.title, task.status, task.workspace_id,
      overrides.assigned_agent_id   ?? null,
      overrides.external_request_id ?? null,
      overrides.source              ?? 'mission-control',
      overrides.initiative_id       ?? null,
      overrides.priority            ?? 'normal',
      overrides.task_type           ?? 'openclaw-native',
      overrides.task_type_config    ?? null,
      now, now,
    ]
  );
  return task;
}

// ─── Capabilities system seed helpers ─────────────────────────────────────────

export interface SeedCapability { id: string; name: string; category: string; status: string }
export function seedCapability(
  overrides: Partial<{
    id: string; name: string; category: string; description: string;
    provider: string; version: string; status: string; is_shared: number;
  }> = {}
): SeedCapability {
  const cap: SeedCapability = {
    id:       overrides.id       ?? uuidv4(),
    name:     overrides.name     ?? 'Test Capability',
    category: overrides.category ?? 'cli_tool',
    status:   overrides.status   ?? 'unknown',
  };
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO capabilities (id, name, category, description, provider, version, is_shared, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [cap.id, cap.name, cap.category, overrides.description ?? null, overrides.provider ?? null,
     overrides.version ?? null, overrides.is_shared ?? 1, cap.status, now, now]
  );
  return cap;
}

export interface SeedIntegration { id: string; name: string; type: string; status: string }
export function seedIntegration(
  overrides: Partial<{
    id: string; name: string; type: string; provider: string; status: string;
    credential_source: string;
  }> = {}
): SeedIntegration {
  const integ: SeedIntegration = {
    id:     overrides.id     ?? uuidv4(),
    name:   overrides.name   ?? 'Test Integration',
    type:   overrides.type   ?? 'api_key',
    status: overrides.status ?? 'unknown',
  };
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO integrations (id, name, type, provider, status, credential_source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [integ.id, integ.name, integ.type, overrides.provider ?? null,
     integ.status, overrides.credential_source ?? null, now, now]
  );
  return integ;
}

export interface SeedCronJob { id: string; name: string; agent_id: string | null; status: string }
export function seedCronJob(
  overrides: Partial<{
    id: string; name: string; schedule: string; command: string;
    agent_id: string | null; type: string; status: string; description: string;
  }> = {}
): SeedCronJob {
  const cron: SeedCronJob = {
    id:       overrides.id       ?? uuidv4(),
    name:     overrides.name     ?? 'Test Cron',
    agent_id: overrides.agent_id ?? null,
    status:   overrides.status   ?? 'active',
  };
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO cron_jobs (id, name, schedule, command, agent_id, type, status, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [cron.id, cron.name, overrides.schedule ?? '0 7 * * *', overrides.command ?? 'echo test',
     cron.agent_id, overrides.type ?? 'shell', cron.status, overrides.description ?? null, now, now]
  );
  return cron;
}

// ─── INITIATIVES.json helpers ─────────────────────────────────────────────────

export function setupInitiativesDir(): string {
  const tmpDir = path.join(
    os.tmpdir(),
    `mc-initiatives-${process.pid}-${Date.now()}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.SQUAD_STATUS_PATH = tmpDir;
  return tmpDir;
}

export function writeInitiativesFile(dir: string, initiatives: object[] = []): void {
  fs.writeFileSync(
    path.join(dir, 'INITIATIVES.json'),
    JSON.stringify({ lastUpdate: new Date().toISOString(), initiatives }, null, 2),
    'utf-8'
  );
}

export function readInitiativesFile(dir: string): {
  lastUpdate?: string;
  initiatives?: object[];
} {
  const filePath = path.join(dir, 'INITIATIVES.json');
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function teardownInitiativesDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  delete process.env.SQUAD_STATUS_PATH;
}
