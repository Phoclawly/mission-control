/**
 * Integration tests — POST /api/tasks
 *
 * Tests map to plan:
 *   TC-TASK-001  Create task (nominal)
 *   TC-TASK-002  Idempotency via external_request_id
 *   TC-TASK-003  Concurrent creation — no duplicates
 *   TC-TASK-004  Source scoping for idempotency
 *   TC-NEG-002   Invalid agent_id FK
 *   TC-NEG-005   Schema columns present (feature-detect)
 *   TC-NEG-006   Validation failures (missing required fields)
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  setupTestDb,
  teardownTestDb,
  resetTables,
  seedWorkspace,
  seedAgent,
  dbQueryAll,
  dbQueryOne,
} from '../helpers/db';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

vi.mock('@/lib/openclaw/client', () => ({
  getOpenClawClient: vi.fn(() => ({
    isConnected: vi.fn(() => false),
    connect: vi.fn().mockResolvedValue(undefined),
    call: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

vi.mock('@/lib/events', () => ({
  broadcast: vi.fn(),
  registerClient: vi.fn(),
  unregisterClient: vi.fn(),
  getActiveConnectionCount: vi.fn(() => 0),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(() => setupTestDb());
afterAll(() => teardownTestDb());
beforeEach(() => resetTables());

// ─── Helper ──────────────────────────────────────────────────────────────────

async function postTask(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import('@/app/api/tasks/route');
  const req = new NextRequest('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

// ─── TC-TASK-001: Nominal creation ───────────────────────────────────────────

describe('POST /api/tasks — nominal creation (TC-TASK-001)', () => {
  it('creates task and returns 201', async () => {
    const ws = seedWorkspace();
    const res = await postTask({ title: 'First task', workspace_id: ws.id });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.title).toBe('First task');
    expect(body.status).toBe('inbox');
  });

  it('defaults status to inbox when not provided', async () => {
    const ws = seedWorkspace();
    const res = await postTask({ title: 'No status task', workspace_id: ws.id });
    const body = await res.json();
    expect(body.status).toBe('inbox');
  });

  it('defaults priority to normal when not provided', async () => {
    const ws = seedWorkspace();
    const res = await postTask({ title: 'No priority', workspace_id: ws.id });
    const body = await res.json();
    expect(body.priority).toBe('normal');
  });

  it('uses first workspace when workspace_id is omitted', async () => {
    const ws = seedWorkspace({ slug: 'first-ws' });
    const res = await postTask({ title: 'No workspace param' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.workspace_id).toBe(ws.id);
  });

  it('persists source field (defaults to mission-control)', async () => {
    const ws = seedWorkspace();
    const res = await postTask({ title: 'Source test', workspace_id: ws.id });
    const body = await res.json();
    expect(body.source).toBe('mission-control');
  });

  it('accepts custom source', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Custom source',
      workspace_id: ws.id,
      source: 'webhook',
    });
    const body = await res.json();
    expect(body.source).toBe('webhook');
  });
});

// ─── TC-TASK-002: Idempotency ─────────────────────────────────────────────────

describe('POST /api/tasks — idempotency (TC-TASK-002)', () => {
  it('second POST with same external_request_id returns existing task (no duplicate)', async () => {
    const ws = seedWorkspace();
    const reqBody = {
      title: 'Idempotent task',
      workspace_id: ws.id,
      external_request_id: 'req-idem-001',
      source: 'mission-control',
    };

    const res1 = await postTask(reqBody);
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    const res2 = await postTask(reqBody);
    // Should succeed (200) and return the same task, not create a new one
    expect([200, 201]).toContain(res2.status);
    const body2 = await res2.json();

    expect(body2.id).toBe(body1.id);

    // Verify only 1 row in DB
    const rows = dbQueryAll<{ id: string }>(
      "SELECT id FROM tasks WHERE external_request_id = 'req-idem-001'"
    );
    expect(rows).toHaveLength(1);
  });

  it('different external_request_id creates a separate task', async () => {
    const ws = seedWorkspace();
    await postTask({
      title: 'Task A',
      workspace_id: ws.id,
      external_request_id: 'req-a',
    });
    const res = await postTask({
      title: 'Task B',
      workspace_id: ws.id,
      external_request_id: 'req-b',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.external_request_id).toBe('req-b');
  });
});

// ─── TC-TASK-003: Concurrent creation ────────────────────────────────────────

describe('POST /api/tasks — concurrent requests (TC-TASK-003)', () => {
  it('3 concurrent POSTs with same external_request_id yield exactly 1 row', async () => {
    const ws = seedWorkspace();
    const reqBody = {
      title: 'Concurrent task',
      workspace_id: ws.id,
      external_request_id: 'req-concurrent-001',
      source: 'mission-control',
    };

    // Fire 3 concurrent requests
    const results = await Promise.allSettled([
      postTask(reqBody),
      postTask(reqBody),
      postTask(reqBody),
    ]);

    // All should resolve (not throw)
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }

    // Exactly 1 row in DB
    const rows = dbQueryAll<{ id: string }>(
      "SELECT id FROM tasks WHERE external_request_id = 'req-concurrent-001'"
    );
    expect(rows).toHaveLength(1);

    // At least one response should be 201 or 200
    const statuses = await Promise.all(
      results
        .filter((r): r is PromiseFulfilledResult<Response> => r.status === 'fulfilled')
        .map((r) => r.value.status)
    );
    expect(statuses.some((s) => s === 201 || s === 200)).toBe(true);
  });
});

// ─── TC-TASK-004: Source scoping ──────────────────────────────────────────────

describe('POST /api/tasks — source scoping (TC-TASK-004)', () => {
  it('same external_request_id with different source creates separate tasks', async () => {
    const ws = seedWorkspace();

    const res1 = await postTask({
      title: 'From webhook',
      workspace_id: ws.id,
      external_request_id: 'req-scope-001',
      source: 'webhook',
    });
    expect(res1.status).toBe(201);

    const res2 = await postTask({
      title: 'From mission-control',
      workspace_id: ws.id,
      external_request_id: 'req-scope-001',
      source: 'mission-control',
    });
    expect(res2.status).toBe(201);

    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.id).not.toBe(body2.id);
  });
});

// ─── TC-NEG-006: Validation failures ─────────────────────────────────────────

describe('POST /api/tasks — validation (TC-NEG-006)', () => {
  it('returns 400 when title is missing', async () => {
    const res = await postTask({ description: 'No title here' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
  });

  it('returns 400 when title is empty string', async () => {
    const res = await postTask({ title: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when title exceeds 500 characters', async () => {
    const res = await postTask({ title: 'a'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status enum', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Bad status',
      workspace_id: ws.id,
      status: 'not-a-valid-status',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid priority enum', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Bad priority',
      workspace_id: ws.id,
      priority: 'super-urgent',
    });
    expect(res.status).toBe(400);
  });

  it('initiative_id must match INIT-* format', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Bad initiative',
      workspace_id: ws.id,
      initiative_id: 'invalid-initiative',
    });
    expect(res.status).toBe(400);
  });
});

// ─── TC-NEG-002: agent_id validation ─────────────────────────────────────────

describe('POST /api/tasks — invalid agent_id (TC-NEG-002)', () => {
  it('creates task with non-existent assigned_agent_id (FK is nullable)', async () => {
    // SQLite FK checks: assigned_agent_id REFERENCES agents(id) — but it is nullable.
    // If the agent doesn't exist and is assigned, it should either:
    //   a) store null (if validation strips unknown IDs), or
    //   b) fail FK constraint when foreign_keys = ON
    // The route does NOT validate agent existence before INSERT.
    // With foreign_keys ON, this should fail unless agent exists.
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'FK test',
      workspace_id: ws.id,
      assigned_agent_id: 'agent-does-not-exist',
    });
    // Expect either 400/422 (validation catches it) or 500 (DB FK error)
    // The important thing: no silent data corruption.
    expect([400, 422, 500]).toContain(res.status);
  });

  it('creates task successfully when assigned_agent_id is valid', async () => {
    const ws = seedWorkspace();
    const agent = seedAgent(ws.id);
    const res = await postTask({
      title: 'Valid agent',
      workspace_id: ws.id,
      assigned_agent_id: agent.id,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assigned_agent_id).toBe(agent.id);
  });
});

// ─── TC-NEG-005: Schema column detection ─────────────────────────────────────

describe('POST /api/tasks — schema compatibility', () => {
  it('schema has required metadata columns (initiative_id, external_request_id, source)', () => {
    // Trigger DB init by seeding
    seedWorkspace();
    const columns = dbQueryAll<{ name: string }>('PRAGMA table_info(tasks)');
    const names = columns.map((c) => c.name);
    expect(names).toContain('initiative_id');
    expect(names).toContain('external_request_id');
    expect(names).toContain('source');
  });
});

// ─── GET /api/tasks — list + filters ─────────────────────────────────────────

describe('GET /api/tasks', () => {
  async function getTasks(params: Record<string, string> = {}): Promise<Response> {
    const { GET } = await import('@/app/api/tasks/route');
    const qs = new URLSearchParams(params).toString();
    const req = new NextRequest(`http://localhost/api/tasks${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
    return GET(req);
  }

  it('returns empty array when no tasks', async () => {
    const res = await getTasks();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns created tasks', async () => {
    const ws = seedWorkspace();
    await postTask({ title: 'List task 1', workspace_id: ws.id });
    await postTask({ title: 'List task 2', workspace_id: ws.id });

    const res = await getTasks();
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by status', async () => {
    const ws = seedWorkspace();
    await postTask({ title: 'Inbox task', workspace_id: ws.id, status: 'inbox' });
    await postTask({ title: 'Done task', workspace_id: ws.id, status: 'done' });

    const res = await getTasks({ status: 'done' });
    const body = await res.json();
    expect(body.every((t: { status: string }) => t.status === 'done')).toBe(true);
  });

  it('filters by comma-separated status list', async () => {
    const ws = seedWorkspace();
    await postTask({ title: 'Inbox', workspace_id: ws.id, status: 'inbox' });
    await postTask({ title: 'Done', workspace_id: ws.id, status: 'done' });
    await postTask({ title: 'Review', workspace_id: ws.id, status: 'review' });

    const res = await getTasks({ status: 'inbox,done' });
    const body: Array<{ status: string }> = await res.json();
    const statuses = [...new Set(body.map((t) => t.status))];
    expect(statuses).not.toContain('review');
    expect(statuses.every((s) => ['inbox', 'done'].includes(s))).toBe(true);
  });

  it('filters by workspace_id', async () => {
    const ws1 = seedWorkspace({ slug: 'ws1' });
    const { v4: uuidv4 } = await import('uuid');
    const ws2 = seedWorkspace({ id: uuidv4(), slug: 'ws2', name: 'WS2' });
    await postTask({ title: 'WS1 task', workspace_id: ws1.id });
    await postTask({ title: 'WS2 task', workspace_id: ws2.id });

    const res = await getTasks({ workspace_id: ws1.id });
    const body: Array<{ workspace_id: string }> = await res.json();
    expect(body.every((t) => t.workspace_id === ws1.id)).toBe(true);
  });
});

// ─── TC-TASK-005: Task type columns ───────────────────────────────────────────

describe('POST /api/tasks — task type (TC-TASK-005)', () => {
  it('default task_type is openclaw-native', async () => {
    const ws = seedWorkspace();
    const res = await postTask({ title: 'Default type task', workspace_id: ws.id });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task_type).toBe('openclaw-native');
  });

  it('explicit claude-team type is persisted', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Team task',
      workspace_id: ws.id,
      task_type: 'claude-team',
      task_type_config: { team_size: 3, team_members: [] },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task_type).toBe('claude-team');
  });

  it('returns 400 for unknown task_type enum value', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Bad type',
      workspace_id: ws.id,
      task_type: 'not-a-valid-type',
    });
    expect(res.status).toBe(400);
  });

  it('schema has task_type and task_type_config columns', () => {
    seedWorkspace();
    const columns = dbQueryAll<{ name: string }>('PRAGMA table_info(tasks)');
    const names = columns.map((c) => c.name);
    expect(names).toContain('task_type');
    expect(names).toContain('task_type_config');
  });
});
