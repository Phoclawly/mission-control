/**
 * Integration tests — POST /api/workspaces/activate
 *
 * Tests map to plan:
 *   TC-ACTIVATE-001  Nominal activation
 *   TC-ACTIVATE-002  Idempotency (same external_request_id)
 *   TC-ACTIVATE-003  Activate with existing initiative_id
 *   TC-ACTIVATE-004  Concurrent activations
 *   TC-STATE-001/002 planning → in_progress transition
 *   TC-CONSISTENCY-001/002 DB ↔ INITIATIVES.json
 *   TC-NEG-001  Workspace not found → 404
 *   TC-NEG-006  Missing workspace field → 400
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  setupTestDb,
  teardownTestDb,
  resetTables,
  seedWorkspace,
  seedAgent,
  seedTask,
  setupInitiativesDir,
  writeInitiativesFile,
  readInitiativesFile,
  teardownInitiativesDir,
  dbQueryAll,
  dbQueryOne,
} from '../helpers/db';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

// Mock OpenClaw client — not connected by default (activate uses internal dispatch via fetch)
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

// Mock global fetch — the activate route POSTs to /api/tasks/[id]/dispatch internally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Setup ────────────────────────────────────────────────────────────────────

let initiativesDir: string;

beforeAll(() => {
  setupTestDb();
  initiativesDir = setupInitiativesDir();
});

afterAll(() => {
  teardownTestDb();
  teardownInitiativesDir(initiativesDir);
});

beforeEach(() => {
  resetTables();
  writeInitiativesFile(initiativesDir, []);
  // Default: dispatch call succeeds
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
    status: 200,
  } as Response);
});

// ─── Helper ──────────────────────────────────────────────────────────────────

async function postActivate(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import('@/app/api/workspaces/activate/route');
  const req = new NextRequest('http://localhost/api/workspaces/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

function getDb() {
  return { queryAll: dbQueryAll, queryOne: dbQueryOne };
}

// ─── TC-ACTIVATE-001: Nominal activation ─────────────────────────────────────

describe('POST /api/workspaces/activate — nominal (TC-ACTIVATE-001)', () => {
  it('returns 200 with success fields', async () => {
    const ws = seedWorkspace({ slug: 'apollo' });
    seedAgent(ws.id, { name: 'Apollo Agent' });

    const res = await postActivate({
      workspace: 'apollo',
      external_request_id: 'act-001',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.task_id).toBeTruthy();
    expect(body.workspace).toBe('apollo');
    expect(body.initiative_id).toMatch(/^INIT-/);
    expect(body.external_request_id).toBe('act-001');
  });

  it('creates exactly one task in DB', async () => {
    const ws = seedWorkspace({ slug: 'workspace-beta' });
    seedAgent(ws.id);

    await postActivate({ workspace: 'workspace-beta', external_request_id: 'act-beta-001' });

    const { queryAll } = getDb();
    const tasks = queryAll<{ id: string }>(
      "SELECT id FROM tasks WHERE source = 'mission-control' AND external_request_id = 'act-beta-001'"
    );
    expect(tasks).toHaveLength(1);
  });

  it('task is created with status planning initially, then updated to in_progress', async () => {
    const ws = seedWorkspace({ slug: 'ws-state-test' });
    seedAgent(ws.id);

    const res = await postActivate({
      workspace: 'ws-state-test',
      external_request_id: 'act-state-001',
    });
    const body = await res.json();

    const { queryOne } = getDb();
    const task = queryOne<{ status: string; initiative_id: string }>(
      'SELECT status, initiative_id FROM tasks WHERE id = ?',
      [body.task_id]
    );

    // Route creates task with 'planning', then immediately updates initiative to 'in_progress'
    // The task itself ends up as 'in_progress' (UPDATE runs right after INSERT)
    expect(task?.status).toBe('in_progress');
  });

  it('assigns task to workspace master agent when no agent_id provided', async () => {
    const ws = seedWorkspace({ slug: 'ws-master' });
    seedAgent(ws.id, { name: 'Specialist', is_master: 0 });
    const master = seedAgent(ws.id, { name: 'Master', is_master: 1 });

    const res = await postActivate({
      workspace: 'ws-master',
      external_request_id: 'act-master-001',
    });
    const body = await res.json();
    expect(body.agent_id).toBe(master.id);
  });

  it('creates an event row of type task_created', async () => {
    const ws = seedWorkspace({ slug: 'ws-event' });
    seedAgent(ws.id);

    const res = await postActivate({
      workspace: 'ws-event',
      external_request_id: 'act-ev-001',
    });
    const body = await res.json();

    const { queryOne } = getDb();
    const event = queryOne<{ type: string }>(
      "SELECT type FROM events WHERE task_id = ? AND type = 'task_created'",
      [body.task_id]
    );
    expect(event).toBeTruthy();
    expect(event?.type).toBe('task_created');
  });
});

// ─── TC-ACTIVATE-002: Idempotency ────────────────────────────────────────────

describe('POST /api/workspaces/activate — idempotency (TC-ACTIVATE-002)', () => {
  it('second call with same external_request_id returns idempotent:true, no duplicate task', async () => {
    const ws = seedWorkspace({ slug: 'ws-idem' });
    seedAgent(ws.id);

    const payload = { workspace: 'ws-idem', external_request_id: 'act-idem-001' };

    const res1 = await postActivate(payload);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);

    const res2 = await postActivate(payload);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.idempotent).toBe(true);
    expect(body2.task_id).toBe(body1.task_id);

    // Only 1 task in DB
    const { queryAll } = getDb();
    const tasks = queryAll<{ id: string }>(
      "SELECT id FROM tasks WHERE source = 'mission-control' AND external_request_id = 'act-idem-001'"
    );
    expect(tasks).toHaveLength(1);
  });

  it('second call does NOT re-trigger dispatch (no second fetch call for idempotent hit)', async () => {
    const ws = seedWorkspace({ slug: 'ws-idem2' });
    seedAgent(ws.id);

    const payload = { workspace: 'ws-idem2', external_request_id: 'act-idem-002' };
    mockFetch.mockClear();

    await postActivate(payload);
    const callsAfterFirst = mockFetch.mock.calls.length;

    await postActivate(payload); // idempotent
    const callsAfterSecond = mockFetch.mock.calls.length;

    // No extra fetch calls for the idempotent hit
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });
});

// ─── TC-ACTIVATE-003: Existing initiative_id ─────────────────────────────────

describe('POST /api/workspaces/activate — existing initiative_id (TC-ACTIVATE-003)', () => {
  it('links to provided initiative_id instead of generating new one', async () => {
    const ws = seedWorkspace({ slug: 'ws-init' });
    seedAgent(ws.id);

    const res = await postActivate({
      workspace: 'ws-init',
      external_request_id: 'act-init-001',
      initiative_id: 'INIT-150000',
    });
    const body = await res.json();
    expect(body.initiative_id).toBe('INIT-150000');
  });

  it('updates existing INITIATIVES.json entry to in-progress when initiative_id matches', async () => {
    const ws = seedWorkspace({ slug: 'ws-initjson' });
    seedAgent(ws.id);

    // Pre-populate INITIATIVES.json with a 'planned' initiative
    writeInitiativesFile(initiativesDir, [
      {
        id: 'INIT-200000',
        title: 'Pre-existing initiative',
        status: 'planned',
        lead: 'pho',
        participants: ['pho'],
        priority: 'high',
        created: '2026-02-01',
        target: 'TBD',
        summary: 'Pre-existing',
        source: 'mission-control',
        external_request_id: null,
        history: [{ status: 'planned', at: '2026-02-01T00:00:00Z', by: 'pho', note: 'Created' }],
      },
    ]);

    await postActivate({
      workspace: 'ws-initjson',
      external_request_id: 'act-initjson-001',
      initiative_id: 'INIT-200000',
    });

    // INITIATIVES.json should now show in-progress
    const data = readInitiativesFile(initiativesDir);
    const initiative = (data.initiatives ?? []).find(
      (i: Record<string, unknown>) => String(i.id).toUpperCase() === 'INIT-200000'
    ) as Record<string, unknown> | undefined;

    expect(initiative).toBeTruthy();
    expect(initiative?.status).toBe('in-progress');
    expect(
      (initiative?.history as Array<Record<string, unknown>>)?.at(-1)?.status
    ).toBe('in-progress');
  });
});

// ─── TC-STATE-001/002: State transitions ─────────────────────────────────────

describe('POST /api/workspaces/activate — state transitions', () => {
  it('TC-STATE-001: tasks with same initiative_id move to in_progress', async () => {
    const ws = seedWorkspace({ slug: 'ws-states' });
    const agent = seedAgent(ws.id);

    // Pre-seed a planning task in the same workspace + initiative
    seedTask(ws.id, {
      status: 'planning',
      initiative_id: 'INIT-333000',
      source: 'mission-control',
      assigned_agent_id: agent.id,
    });

    await postActivate({
      workspace: 'ws-states',
      external_request_id: 'act-states-001',
      initiative_id: 'INIT-333000',
    });

    const { queryAll } = getDb();
    const tasks = queryAll<{ status: string }>(
      "SELECT status FROM tasks WHERE initiative_id = 'INIT-333000'"
    );
    // All tasks in the initiative should now be in_progress
    expect(tasks.every((t) => t.status === 'in_progress')).toBe(true);
  });

  it('TC-STATE-002: INITIATIVES.json planned → in-progress', async () => {
    const ws = seedWorkspace({ slug: 'ws-planned' });
    seedAgent(ws.id);

    writeInitiativesFile(initiativesDir, [
      {
        id: 'INIT-400000',
        title: 'Planned initiative',
        status: 'planned',
        lead: 'pho',
        participants: ['pho'],
        priority: 'normal',
        created: '2026-02-01',
        target: 'TBD',
        summary: 'Planned',
        source: 'mission-control',
        external_request_id: null,
        history: [{ status: 'planned', at: '2026-02-01T00:00:00Z', by: 'pho', note: '' }],
      },
    ]);

    await postActivate({
      workspace: 'ws-planned',
      external_request_id: 'act-planned-001',
      initiative_id: 'INIT-400000',
    });

    const data = readInitiativesFile(initiativesDir);
    const initiative = (data.initiatives ?? []).find(
      (i: Record<string, unknown>) => String(i.id).toUpperCase() === 'INIT-400000'
    ) as Record<string, unknown> | undefined;
    expect(initiative?.status).toBe('in-progress');
    expect(initiative?.external_request_id).toBe('act-planned-001');
  });
});

// ─── TC-CONSISTENCY-002: DB ↔ INITIATIVES.json ───────────────────────────────

describe('POST /api/workspaces/activate — DB ↔ INITIATIVES.json consistency (TC-CONSISTENCY-002)', () => {
  it('task in DB and INITIATIVES.json both reflect activation after happy-path call', async () => {
    const ws = seedWorkspace({ slug: 'ws-consistency' });
    seedAgent(ws.id);

    writeInitiativesFile(initiativesDir, [
      {
        id: 'INIT-500000',
        title: 'Consistency init',
        status: 'planned',
        lead: 'pho',
        participants: ['pho'],
        priority: 'high',
        created: '2026-02-01',
        target: 'TBD',
        summary: 'Consistency',
        source: 'mission-control',
        external_request_id: null,
        history: [{ status: 'planned', at: '2026-02-01T00:00:00Z', by: 'pho', note: '' }],
      },
    ]);

    const res = await postActivate({
      workspace: 'ws-consistency',
      external_request_id: 'act-cons-001',
      initiative_id: 'INIT-500000',
    });
    const body = await res.json();

    // DB: task status = in_progress
    const { queryOne } = getDb();
    const task = queryOne<{ status: string; initiative_id: string; external_request_id: string }>(
      'SELECT status, initiative_id, external_request_id FROM tasks WHERE id = ?',
      [body.task_id]
    );
    expect(task?.status).toBe('in_progress');
    expect(task?.initiative_id).toBe('INIT-500000');
    expect(task?.external_request_id).toBe('act-cons-001');

    // JSON: initiative status = in-progress
    const data = readInitiativesFile(initiativesDir);
    const initiative = (data.initiatives ?? []).find(
      (i: Record<string, unknown>) => String(i.id).toUpperCase() === 'INIT-500000'
    ) as Record<string, unknown> | undefined;
    expect(initiative?.status).toBe('in-progress');
    expect(initiative?.external_request_id).toBe('act-cons-001');
  });

  it('INITIATIVES.json remains valid JSON after multiple activations', async () => {
    const ws = seedWorkspace({ slug: 'ws-json-valid' });
    seedAgent(ws.id);

    writeInitiativesFile(initiativesDir, []);

    await Promise.all([
      postActivate({ workspace: 'ws-json-valid', external_request_id: 'j1' }),
      postActivate({ workspace: 'ws-json-valid', external_request_id: 'j2' }),
      postActivate({ workspace: 'ws-json-valid', external_request_id: 'j3' }),
    ]);

    // Should be parseable (not corrupted)
    expect(() => readInitiativesFile(initiativesDir)).not.toThrow();
  });
});

// ─── TC-NEG-001: Workspace not found ─────────────────────────────────────────

describe('POST /api/workspaces/activate — negative cases', () => {
  it('TC-NEG-001: returns 404 for unknown workspace slug', async () => {
    const res = await postActivate({
      workspace: 'workspace-does-not-exist',
      external_request_id: 'act-404-001',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('TC-NEG-006: returns 400 when workspace field is missing', async () => {
    const res = await postActivate({ external_request_id: 'act-400-001' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty workspace string', async () => {
    const res = await postActivate({ workspace: '  ', external_request_id: 'act-400-002' });
    expect(res.status).toBe(400);
  });

  it('gateway warning does not prevent task creation', async () => {
    const ws = seedWorkspace({ slug: 'ws-gw-fail' });
    seedAgent(ws.id);

    // Simulate dispatch failing
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    const res = await postActivate({
      workspace: 'ws-gw-fail',
      external_request_id: 'act-gwfail-001',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Task is still created even when dispatch fails
    expect(body.success).toBe(true);
    expect(body.task_id).toBeTruthy();
    expect(body.warning).toBeTruthy(); // Warning should be present
    expect(body.gateway_triggered).toBe(false);
  });

  it('dispatch network error produces warning, task still created', async () => {
    const ws = seedWorkspace({ slug: 'ws-net-fail' });
    seedAgent(ws.id);

    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await postActivate({
      workspace: 'ws-net-fail',
      external_request_id: 'act-net-001',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.task_id).toBeTruthy();
    expect(body.warning).toBeTruthy();
  });
});

// ─── TC-ACTIVATE-004: Concurrent activations ─────────────────────────────────

describe('POST /api/workspaces/activate — concurrent requests (TC-ACTIVATE-004)', () => {
  it('3 concurrent activations for same workspace create no duplicate tasks', async () => {
    const ws = seedWorkspace({ slug: 'ws-concurrent' });
    seedAgent(ws.id);

    const payload = {
      workspace: 'ws-concurrent',
      external_request_id: 'act-conc-001',
    };

    const results = await Promise.allSettled([
      postActivate(payload),
      postActivate(payload),
      postActivate(payload),
    ]);

    // All requests should resolve
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }

    // Exactly 1 task row
    const tasks = dbQueryAll<{ id: string }>(
      "SELECT id FROM tasks WHERE source = 'mission-control' AND external_request_id = 'act-conc-001'"
    );
    expect(tasks).toHaveLength(1);
  });
});
