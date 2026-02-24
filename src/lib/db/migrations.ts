/**
 * Database Migrations System
 * 
 * Handles schema changes in a production-safe way:
 * 1. Tracks which migrations have been applied
 * 2. Runs new migrations automatically on startup
 * 3. Never runs the same migration twice
 */

import Database from 'better-sqlite3';

interface Migration {
  id: string;
  name: string;
  up: (db: Database.Database) => void;
}

// All migrations in order - NEVER remove or reorder existing migrations
const migrations: Migration[] = [
  {
    id: '001',
    name: 'initial_schema',
    up: (db) => {
      // Core tables - these are created in schema.ts on fresh databases
      // This migration exists to mark the baseline for existing databases
      console.log('[Migration 001] Baseline schema marker');
    }
  },
  {
    id: '002',
    name: 'add_workspaces',
    up: (db) => {
      console.log('[Migration 002] Adding workspaces table and columns...');
      
      // Create workspaces table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          icon TEXT DEFAULT '📁',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Insert default workspace if not exists
      db.exec(`
        INSERT OR IGNORE INTO workspaces (id, name, slug, description, icon) 
        VALUES ('default', 'Default Workspace', 'default', 'Default workspace', '🏠');
      `);
      
      // Add workspace_id to tasks if not exists
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'workspace_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)`);
        console.log('[Migration 002] Added workspace_id to tasks');
      }
      
      // Add workspace_id to agents if not exists
      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      if (!agentsInfo.some(col => col.name === 'workspace_id')) {
        db.exec(`ALTER TABLE agents ADD COLUMN workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)`);
        console.log('[Migration 002] Added workspace_id to agents');
      }
    }
  },
  {
    id: '003',
    name: 'add_planning_tables',
    up: (db) => {
      console.log('[Migration 003] Adding planning tables...');
      
      // Create planning_questions table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS planning_questions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          category TEXT NOT NULL,
          question TEXT NOT NULL,
          question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'text', 'yes_no')),
          options TEXT,
          answer TEXT,
          answered_at TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Create planning_specs table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS planning_specs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
          spec_markdown TEXT NOT NULL,
          locked_at TEXT NOT NULL,
          locked_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Create index
      db.exec(`CREATE INDEX IF NOT EXISTS idx_planning_questions_task ON planning_questions(task_id, sort_order)`);
      
      // Update tasks status check constraint to include 'planning'
      // SQLite doesn't support ALTER CONSTRAINT, so we check if it's needed
      const taskSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
      if (taskSchema && !taskSchema.sql.includes("'planning'")) {
        console.log('[Migration 003] Note: tasks table needs planning status - will be handled by schema recreation on fresh dbs');
      }
    }
  },
  {
    id: '004',
    name: 'add_planning_session_columns',
    up: (db) => {
      console.log('[Migration 004] Adding planning session columns to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      // Add planning_session_key column
      if (!tasksInfo.some(col => col.name === 'planning_session_key')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_session_key TEXT`);
        console.log('[Migration 004] Added planning_session_key');
      }

      // Add planning_messages column (stores JSON array of messages)
      if (!tasksInfo.some(col => col.name === 'planning_messages')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_messages TEXT`);
        console.log('[Migration 004] Added planning_messages');
      }

      // Add planning_complete column
      if (!tasksInfo.some(col => col.name === 'planning_complete')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_complete INTEGER DEFAULT 0`);
        console.log('[Migration 004] Added planning_complete');
      }

      // Add planning_spec column (stores final spec JSON)
      if (!tasksInfo.some(col => col.name === 'planning_spec')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_spec TEXT`);
        console.log('[Migration 004] Added planning_spec');
      }

      // Add planning_agents column (stores generated agents JSON)
      if (!tasksInfo.some(col => col.name === 'planning_agents')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_agents TEXT`);
        console.log('[Migration 004] Added planning_agents');
      }
    }
  },
  {
    id: '005',
    name: 'add_agent_model_field',
    up: (db) => {
      console.log('[Migration 005] Adding model field to agents...');

      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];

      // Add model column
      if (!agentsInfo.some(col => col.name === 'model')) {
        db.exec(`ALTER TABLE agents ADD COLUMN model TEXT`);
        console.log('[Migration 005] Added model to agents');
      }
    }
  },
  {
    id: '006',
    name: 'add_planning_dispatch_error_column',
    up: (db) => {
      console.log('[Migration 006] Adding planning_dispatch_error column to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      // Add planning_dispatch_error column
      if (!tasksInfo.some(col => col.name === 'planning_dispatch_error')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_dispatch_error TEXT`);
        console.log('[Migration 006] Added planning_dispatch_error to tasks');
      }
    }
  },
  {
    id: '007',
    name: 'add_mission_control_initiative_contract_fields',
    up: (db) => {
      console.log('[Migration 007] Adding initiative contract fields to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      if (!tasksInfo.some(col => col.name === 'initiative_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN initiative_id TEXT`);
        console.log('[Migration 007] Added initiative_id to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'external_request_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN external_request_id TEXT`);
        console.log('[Migration 007] Added external_request_id to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'source')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'mission-control'`);
        console.log('[Migration 007] Added source to tasks');
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_initiative_id ON tasks(initiative_id)`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source_external_request_id ON tasks(source, external_request_id) WHERE external_request_id IS NOT NULL`);
    }
  },
  {
    id: '008',
    name: 'repair_tasks_initiative_contract_columns',
    up: (db) => {
      console.log('[Migration 008] Repairing initiative contract fields on tasks if missing...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      if (!tasksInfo.some(col => col.name === 'initiative_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN initiative_id TEXT`);
        console.log('[Migration 008] Added missing initiative_id to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'external_request_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN external_request_id TEXT`);
        console.log('[Migration 008] Added missing external_request_id to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'source')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'mission-control'`);
        console.log('[Migration 008] Added missing source to tasks');
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_initiative_id ON tasks(initiative_id)`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source_external_request_id ON tasks(source, external_request_id) WHERE external_request_id IS NOT NULL`);
    }
  },
  {
    id: '009',
    name: 'add_agent_tools_md',
    up: (db) => {
      console.log('[Migration 009] Adding tools_md field to agents...');
      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      if (!agentsInfo.some(col => col.name === 'tools_md')) {
        db.exec(`ALTER TABLE agents ADD COLUMN tools_md TEXT`);
        console.log('[Migration 009] Added tools_md to agents');
      }
    }
  },
  {
    id: '010',
    name: 'add_agent_current_activity',
    up: (db) => {
      console.log('[Migration 010] Adding current_activity field to agents...');
      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      if (!agentsInfo.some(col => col.name === 'current_activity')) {
        db.exec(`ALTER TABLE agents ADD COLUMN current_activity TEXT`);
        console.log('[Migration 010] Added current_activity to agents');
      }
    }
  },
  {
    id: '011',
    name: 'add_capabilities_integrations_crons_memory',
    up: (db) => {
      console.log('[Migration 011] Adding capabilities, integrations, crons, health_checks, and memory tables...');

      // Capabilities registry
      db.exec(`
        CREATE TABLE IF NOT EXISTS capabilities (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('browser_automation', 'mcp_server', 'cli_tool', 'api_integration', 'skill', 'workflow', 'credential_provider')),
          description TEXT,
          provider TEXT,
          version TEXT,
          install_path TEXT,
          config_ref TEXT,
          is_shared INTEGER DEFAULT 1,
          status TEXT DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'broken', 'unknown', 'disabled')),
          last_health_check TEXT,
          health_message TEXT,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Agent-capability junction
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_capabilities (
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          capability_id TEXT NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
          enabled INTEGER DEFAULT 1,
          config_override TEXT,
          PRIMARY KEY (agent_id, capability_id)
        );
      `);

      // Integrations
      db.exec(`
        CREATE TABLE IF NOT EXISTS integrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('mcp_plugin', 'oauth_token', 'api_key', 'cli_auth', 'browser_profile', 'cron_job', 'webhook')),
          provider TEXT,
          status TEXT DEFAULT 'unknown' CHECK (status IN ('connected', 'expired', 'broken', 'unconfigured', 'unknown')),
          credential_source TEXT,
          last_validated TEXT,
          validation_message TEXT,
          config TEXT,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Health checks log
      db.exec(`
        CREATE TABLE IF NOT EXISTS health_checks (
          id TEXT PRIMARY KEY,
          target_type TEXT NOT NULL CHECK (target_type IN ('capability', 'integration')),
          target_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'warn', 'skip')),
          message TEXT,
          duration_ms INTEGER,
          checked_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Cron jobs per agent
      db.exec(`
        CREATE TABLE IF NOT EXISTS cron_jobs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          schedule TEXT NOT NULL,
          command TEXT NOT NULL,
          agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
          type TEXT DEFAULT 'shell' CHECK (type IN ('lobster', 'shell', 'llm')),
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'stale')),
          last_run TEXT,
          last_result TEXT,
          last_duration_ms INTEGER,
          error_count INTEGER DEFAULT 0,
          description TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Agent memory index
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_memory_index (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          date TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size_bytes INTEGER DEFAULT 0,
          summary TEXT,
          entry_count INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(agent_id, date)
        );
      `);

      // Indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_capabilities_category ON capabilities(category);
        CREATE INDEX IF NOT EXISTS idx_capabilities_status ON capabilities(status);
        CREATE INDEX IF NOT EXISTS idx_agent_capabilities_agent ON agent_capabilities(agent_id);
        CREATE INDEX IF NOT EXISTS idx_agent_capabilities_capability ON agent_capabilities(capability_id);
        CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
        CREATE INDEX IF NOT EXISTS idx_health_checks_target ON health_checks(target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_health_checks_checked ON health_checks(checked_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent ON cron_jobs(agent_id);
        CREATE INDEX IF NOT EXISTS idx_cron_jobs_status ON cron_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_date ON agent_memory_index(agent_id, date DESC);
      `);

      console.log('[Migration 011] All new tables created');
    }
  },
  {
    id: '012',
    name: 'fix_integrations_type_constraint',
    up(db: Database.Database) {
      console.log('[Migration 012] Adding credential_provider to integrations type constraint...');
      db.exec(`
        CREATE TABLE IF NOT EXISTS integrations_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('mcp_plugin', 'oauth_token', 'api_key', 'cli_auth', 'browser_profile', 'cron_job', 'webhook', 'credential_provider')),
          provider TEXT,
          status TEXT DEFAULT 'unknown' CHECK (status IN ('connected', 'expired', 'broken', 'unconfigured', 'unknown')),
          credential_source TEXT,
          last_validated TEXT,
          validation_message TEXT,
          config TEXT,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO integrations_new SELECT * FROM integrations;
        DROP TABLE integrations;
        ALTER TABLE integrations_new RENAME TO integrations;
      `);
      console.log('[Migration 012] integrations table updated with credential_provider type');
    }
  },
  {
    id: '013',
    name: 'workspace_scoping',
    up: (db) => {
      console.log('[Migration 013] Adding workspace_id to capabilities and integrations...');

      const capsInfo = db.prepare("PRAGMA table_info(capabilities)").all() as { name: string }[];
      if (!capsInfo.some(col => col.name === 'workspace_id')) {
        db.exec(`ALTER TABLE capabilities ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`);
        db.exec(`UPDATE capabilities SET workspace_id = 'default' WHERE is_shared = 0`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_capabilities_workspace ON capabilities(workspace_id)`);
        console.log('[Migration 013] Added workspace_id to capabilities');
      }

      const intsInfo = db.prepare("PRAGMA table_info(integrations)").all() as { name: string }[];
      if (!intsInfo.some(col => col.name === 'workspace_id')) {
        db.exec(`ALTER TABLE integrations ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON integrations(workspace_id)`);
        console.log('[Migration 013] Added workspace_id to integrations');
      }
    }
  },
  {
    id: '014',
    name: 'add_skill_path',
    up: (db) => {
      console.log('[Migration 014] Adding skill_path to capabilities...');
      const capsInfo = db.prepare("PRAGMA table_info(capabilities)").all() as { name: string }[];
      if (!capsInfo.some(col => col.name === 'skill_path')) {
        db.exec(`ALTER TABLE capabilities ADD COLUMN skill_path TEXT`);
        console.log('[Migration 014] Added skill_path to capabilities');
      }
    }
  },
  {
    id: '015',
    name: 'delete_duplicate_1password_capability',
    up: (db) => {
      console.log('[Migration 015] Deleting duplicate credential-1password capability...');
      db.exec(`DELETE FROM capabilities WHERE id = 'credential-1password'`);
      console.log('[Migration 015] Deleted credential-1password capability');
    }
  }
  ,{
    id: '011',
    name: 'add_task_type_columns',
    up: (db) => {
      console.log('[Migration 011] Adding task_type columns to tasks...');
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'task_type')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'openclaw-native'`);
        console.log('[Migration 011] Added task_type to tasks');
      }
      if (!tasksInfo.some(col => col.name === 'task_type_config')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN task_type_config TEXT`);
        console.log('[Migration 011] Added task_type_config to tasks');
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type)`);
    }
  }
  ,{
    id: '016',
    name: 'add_learnings_index_and_eval_status',
    up: (db) => {
      console.log('[Migration 016] Adding agent_learnings_index table and evaluation_status column...');

      // Create learnings index table
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_learnings_index (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          learnings_count INTEGER DEFAULT 0,
          anti_patterns_count INTEGER DEFAULT 0,
          pending_count INTEGER DEFAULT 0,
          learnings_size_bytes INTEGER DEFAULT 0,
          last_learning_date TEXT,
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(agent_id)
        );
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_learnings_agent ON agent_learnings_index(agent_id)`);

      // Add evaluation_status to tasks
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'evaluation_status')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN evaluation_status TEXT DEFAULT 'none'`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_evaluation_status ON tasks(evaluation_status)`);
        console.log('[Migration 016] Added evaluation_status to tasks');
      }

      console.log('[Migration 016] agent_learnings_index table created');
    }
  }
];

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Get already applied migrations
  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map(m => m.id)
  );
  
  // Run pending migrations in order
  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    
    console.log(`[DB] Running migration ${migration.id}: ${migration.name}`);
    
    try {
      // Run migration in a transaction
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
      })();
      
      console.log(`[DB] Migration ${migration.id} completed`);
    } catch (error) {
      console.error(`[DB] Migration ${migration.id} failed:`, error);
      throw error;
    }
  }
}

/**
 * Get migration status
 */
export function getMigrationStatus(db: Database.Database): { applied: string[]; pending: string[] } {
  const applied = (db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map(m => m.id);
  const pending = migrations.filter(m => !applied.includes(m.id)).map(m => m.id);
  return { applied, pending };
}
