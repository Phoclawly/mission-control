import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { schema } from './schema';
import { runMigrations } from './migrations';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'mission-control.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const isNewDb = !fs.existsSync(DB_PATH);

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    if (isNewDb) {
      // New database: schema creates all tables + indexes in one shot
      db.exec(schema);
      runMigrations(db);
      console.log('[DB] New database created at:', DB_PATH);
    } else {
      // Existing database: run migrations FIRST to add any missing columns,
      // then exec schema to create any missing tables/indexes.
      // This prevents CREATE INDEX from failing on columns that only exist
      // after a migration runs (e.g. evaluation_status, completion_summary).
      runMigrations(db);
      db.exec(schema);
    }
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Type-safe query helpers
export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}

// Export migration utilities for CLI use
export { runMigrations, getMigrationStatus } from './migrations';
