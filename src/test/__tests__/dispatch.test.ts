/**
 * Integration tests — POST /api/tasks/[id]/dispatch
 *
 * Tests map to plan:
 *   TC-DISPATCH-001  Dispatch success — correct payload sent to OpenClaw
 *   TC-DISPATCH-002  Gateway unavailable → 503
 *   TC-DISPATCH-003  task not found → 404
 *   TC-DISPATCH-004  task without assigned agent → 400
 *   TC-DISPATCH-005  Orchestrator conflict (other master available) → 409
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
  dbQueryOne,
  dbQueryAll,
  dbRun,
} from '../helpers/db';

// ─── OpenClaw client mock factory ────────────────────────────────────────────

const mockCall = vi.fn();
const mockConnect = vi.fn();
const mockIsConnected = vi.fn();

vi.mock('@/lib/openclaw/client', () => ({
  getOpenClawClient: vi.fn(() => ({
    isConnected: mockIsConnected,
    connect: mockConnect,
    call: mockCall,
  })),
}));

vi.mock('@/lib/events', () => ({
  broadcast: vi.fn(),
  registerClient: vi.fn(),
  unregisterClient: vi.fn(),
  getActiveConnectionCount: vi.fn(() => 0),
}));

// Use a predictable projects path for tests
vi.mock('@/lib/config', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...original,
    getMissionControlUrl: () => 'http://localhost:4000',
    getProjectsPath: () => '/tmp/mc-test-projects',
  };
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(() => setupTestDb());
afterAll(() => teardownTestDb());

beforeEach(() => {
  resetTables();
  vi.clearAllMocks();
  // Default: connected, call succeeds
  mockIsConnected.mockReturnValue(true);
  mockConnect.mockResolvedValue(undefined);
  mockCall.mockResolvedValue({ success: true });
});

// ─── Helper ──────────────────────────────────────────────────────────────────

async function postDispatch(
  taskId: string,
  body: Record<string, unknown> = {}
): Promise<Response> {
  const { POST } = await import('@/app/api/tasks/[id]/dispatch/route');
  const req = new NextRequest(`http://localhost/api/tasks/${taskId}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: taskId }) });
}

function getDb() {
  return { queryOne: dbQueryOne, queryAll: dbQueryAll };
}

// ─── TC-DISPATCH-001: Nominal dispatch ───────────────────────────────────────

describe('POST /api/tasks/[id]/dispatch — nominal (TC-DISPATCH-001)', () => {
  it('returns 200 success response', async () => {
    const ws = seedWorkspace({ slug: 'dispatch-ws' });
    const agent = seedAgent(ws.id, { name: 'Worker Agent' });
    const task = seedTask(ws.id, {
      assigned_agent_id: agent.id,
      external_request_id: 'req-dispatch-001',
    });

    const res = await postDispatch(task.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.task_id).toBe(task.id);
    expect(body.agent_id).toBe(agent.id);
  });

  it('calls chat.send with correct sessionKey and message', async () => {
    const ws = seedWorkspace({ slug: 'dispatch-msg-ws' });
    const agent = seedAgent(ws.id, { name: 'Msg Agent' });
    const task = seedTask(ws.id, {
      title: 'Build landing page',
      assigned_agent_id: agent.id,
      external_request_id: 'req-msg-001',
    });

    await postDispatch(task.id, { external_request_id: 'req-msg-001' });

    expect(mockCall).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      sessionKey: `dm:${agent.id}`,
      message: expect.stringContaining('Build landing page'),
      idempotencyKey: expect.stringContaining('dispatch-req-msg-001'),
    }));
  });

  it('uses override_message when provided', async () => {
    const ws = seedWorkspace({ slug: 'override-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    const customMsg = 'Custom instruction: build the thing';
    await postDispatch(task.id, { override_message: customMsg });

    expect(mockCall).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      message: customMsg,
    }));
  });

  it('updates task status to in_progress after successful dispatch', async () => {
    const ws = seedWorkspace({ slug: 'status-update-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id, status: 'assigned' });

    await postDispatch(task.id);

    const { queryOne } = getDb();
    const updated = queryOne<{ status: string }>(
      'SELECT status FROM tasks WHERE id = ?',
      [task.id]
    );
    expect(updated?.status).toBe('in_progress');
  });

  it('creates an openclaw_sessions row if none exists', async () => {
    const ws = seedWorkspace({ slug: 'session-create-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    await postDispatch(task.id);

    const { queryOne } = getDb();
    const session = queryOne<{ agent_id: string; status: string }>(
      'SELECT agent_id, status FROM openclaw_sessions WHERE agent_id = ?',
      [agent.id]
    );
    expect(session).toBeTruthy();
    expect(session?.status).toBe('active');
  });

  it('reuses existing active session instead of creating a new one', async () => {
    const ws = seedWorkspace({ slug: 'session-reuse-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    // Dispatch twice
    await postDispatch(task.id);
    await postDispatch(task.id);

    const { queryAll } = getDb();
    const sessions = queryAll<{ id: string }>(
      'SELECT id FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [agent.id, 'active']
    );
    // Only 1 active session should exist
    expect(sessions).toHaveLength(1);
  });

  it('logs dispatch event to events table', async () => {
    const ws = seedWorkspace({ slug: 'event-log-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    await postDispatch(task.id);

    const { queryOne } = getDb();
    const event = queryOne<{ type: string }>(
      "SELECT type FROM events WHERE task_id = ? AND type = 'task_dispatched'",
      [task.id]
    );
    expect(event).toBeTruthy();
  });

  it('connects to gateway if not connected', async () => {
    const ws = seedWorkspace({ slug: 'connect-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    mockIsConnected.mockReturnValue(false);
    await postDispatch(task.id);

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockCall).toHaveBeenCalled();
  });
});

// ─── TC-DISPATCH-002: Gateway failures ───────────────────────────────────────

describe('POST /api/tasks/[id]/dispatch — gateway failures (TC-DISPATCH-002)', () => {
  it('returns 503 when gateway connection fails', async () => {
    const ws = seedWorkspace({ slug: 'gw-down-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    mockIsConnected.mockReturnValue(false);
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await postDispatch(task.id);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/connect.*gateway|gateway/i);
  });

  it('returns 500 when chat.send throws', async () => {
    const ws = seedWorkspace({ slug: 'send-fail-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    mockIsConnected.mockReturnValue(true);
    mockCall.mockRejectedValue(new Error('WebSocket disconnected'));

    const res = await postDispatch(task.id);
    expect(res.status).toBe(500);
  });

  it('does NOT update task status to in_progress when dispatch fails', async () => {
    const ws = seedWorkspace({ slug: 'no-status-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id, status: 'assigned' });

    mockIsConnected.mockReturnValue(false);
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    await postDispatch(task.id);

    const { queryOne } = getDb();
    const updated = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [task.id]);
    // Status should NOT have changed to in_progress since dispatch failed
    expect(updated?.status).toBe('assigned');
  });
});

// ─── Validation: task not found, no agent ────────────────────────────────────

describe('POST /api/tasks/[id]/dispatch — validation errors', () => {
  it('returns 404 for unknown task id', async () => {
    const res = await postDispatch('non-existent-task-id');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 400 when task has no assigned_agent_id', async () => {
    const ws = seedWorkspace({ slug: 'no-agent-ws' });
    const task = seedTask(ws.id, { assigned_agent_id: null });

    const res = await postDispatch(task.id);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no assigned agent/i);
  });

  it('returns 404 when assigned agent does not exist in agents table', async () => {
    const ws = seedWorkspace({ slug: 'ghost-agent-ws' });
    const { v4: uuidv4 } = await import('uuid');
    const taskId = uuidv4();
    const now = new Date().toISOString();
    // Use dbRun but disable FK temporarily via a separate connection
    const { default: Database } = await import('better-sqlite3');
    const tmpDb = new Database(process.env.DATABASE_PATH!);
    tmpDb.pragma('foreign_keys = OFF');
    tmpDb.prepare(
      `INSERT INTO tasks (id, title, status, workspace_id, assigned_agent_id, source, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, 'Orphan task', 'assigned', ws.id, 'ghost-agent-id', 'mission-control', 'normal', now, now);
    tmpDb.close();

    const res = await postDispatch(taskId);
    expect(res.status).toBe(404);
  });
});

// ─── TC-DISPATCH-005: Orchestrator conflict ───────────────────────────────────

describe('POST /api/tasks/[id]/dispatch — orchestrator conflict', () => {
  it('returns 409 when dispatching to master while other online orchestrator exists', async () => {
    const ws = seedWorkspace({ slug: 'orch-conflict-ws' });

    // Master agent #1 (the one we dispatch to)
    const master1 = seedAgent(ws.id, {
      name: 'Master 1',
      is_master: 1,
      status: 'standby',
    });

    // Master agent #2 (the other orchestrator — should trigger 409)
    seedAgent(ws.id, {
      name: 'Master 2',
      is_master: 1,
      status: 'standby',
    });

    const task = seedTask(ws.id, { assigned_agent_id: master1.id });

    const res = await postDispatch(task.id);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.warning).toMatch(/orchestrator/i);
    expect(body.otherOrchestrators).toBeDefined();
    expect(body.otherOrchestrators.length).toBeGreaterThanOrEqual(1);
  });

  it('allows dispatch to master when no other orchestrators exist', async () => {
    const ws = seedWorkspace({ slug: 'solo-master-ws' });
    const master = seedAgent(ws.id, { name: 'Solo Master', is_master: 1, status: 'standby' });
    const task = seedTask(ws.id, { assigned_agent_id: master.id });

    const res = await postDispatch(task.id);
    expect(res.status).toBe(200);
  });

  it('allows dispatch to master when other orchestrators are offline', async () => {
    const ws = seedWorkspace({ slug: 'offline-orch-ws' });
    const master1 = seedAgent(ws.id, { name: 'Online Master', is_master: 1, status: 'standby' });
    seedAgent(ws.id, { name: 'Offline Master', is_master: 1, status: 'offline' });
    const task = seedTask(ws.id, { assigned_agent_id: master1.id });

    const res = await postDispatch(task.id);
    // Offline orchestrators should NOT block dispatch
    expect(res.status).toBe(200);
  });

  it('allows dispatch to non-master agent regardless of other orchestrators', async () => {
    const ws = seedWorkspace({ slug: 'specialist-ws' });
    const specialist = seedAgent(ws.id, { name: 'Specialist', is_master: 0 });
    // Even with a master in the workspace
    seedAgent(ws.id, { name: 'Master', is_master: 1 });

    const task = seedTask(ws.id, { assigned_agent_id: specialist.id });

    const res = await postDispatch(task.id);
    // Non-master dispatch should not be blocked
    expect(res.status).toBe(200);
  });
});

// ─── TC-DISPATCH-004: idempotency key in chat.send ───────────────────────────

describe('POST /api/tasks/[id]/dispatch — idempotency key', () => {
  it('uses external_request_id in idempotencyKey when provided', async () => {
    const ws = seedWorkspace({ slug: 'idem-key-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    await postDispatch(task.id, { external_request_id: 'ext-req-xyz' });

    expect(mockCall).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      idempotencyKey: 'dispatch-ext-req-xyz',
    }));
  });

  it('falls back to task-id-based key when no external_request_id', async () => {
    const ws = seedWorkspace({ slug: 'no-idem-key-ws' });
    const agent = seedAgent(ws.id);
    const task = seedTask(ws.id, { assigned_agent_id: agent.id });

    await postDispatch(task.id);

    expect(mockCall).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      idempotencyKey: expect.stringContaining(`dispatch-${task.id}`),
    }));
  });
});
