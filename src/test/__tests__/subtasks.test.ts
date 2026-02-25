/**
 * Integration tests — Subtask support (parent_task_id)
 *
 * Tests:
 *   - POST /api/tasks creates subtask with parent_task_id
 *   - POST /api/tasks rejects subtask of subtask (depth limit)
 *   - POST /api/tasks rejects subtask with non-existent parent
 *   - GET /api/tasks/[id] includes subtasks array
 *   - PATCH /api/tasks/[id] supports parent_task_id update
 *   - GET /api/tasks filters by parent_task_id
 *   - GET /api/tasks with parent_task_id=none returns only top-level tasks
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  setupTestDb,
  teardownTestDb,
  resetTables,
  seedWorkspace,
  seedTask,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function postTask(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import('@/app/api/tasks/route');
  const req = new NextRequest('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

async function getTaskById(id: string): Promise<Response> {
  const { GET } = await import('@/app/api/tasks/[id]/route');
  const req = new NextRequest(`http://localhost/api/tasks/${id}`, {
    method: 'GET',
  });
  return GET(req, { params: Promise.resolve({ id }) });
}

async function patchTask(id: string, body: Record<string, unknown>): Promise<Response> {
  const { PATCH } = await import('@/app/api/tasks/[id]/route');
  const req = new NextRequest(`http://localhost/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id }) });
}

async function getTasks(params: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import('@/app/api/tasks/route');
  const qs = new URLSearchParams(params).toString();
  const req = new NextRequest(`http://localhost/api/tasks${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
  return GET(req);
}

// ─── POST /api/tasks — subtask creation ───────────────────────────────────────

describe('POST /api/tasks — subtask creation', () => {
  it('creates subtask with parent_task_id', async () => {
    const ws = seedWorkspace();
    const parent = seedTask(ws.id, { title: 'Parent task' });

    const res = await postTask({
      title: 'Child task',
      workspace_id: ws.id,
      parent_task_id: parent.id,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.parent_task_id).toBe(parent.id);
    expect(body.title).toBe('Child task');
  });

  it('rejects subtask of subtask (depth limit — 400 error)', async () => {
    const ws = seedWorkspace();
    const parent = seedTask(ws.id, { title: 'Parent task' });
    const child = seedTask(ws.id, { title: 'Child task', parent_task_id: parent.id });

    const res = await postTask({
      title: 'Grandchild task',
      workspace_id: ws.id,
      parent_task_id: child.id,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/depth limit/i);
  });

  it('rejects subtask with non-existent parent (400 error)', async () => {
    const ws = seedWorkspace();

    const res = await postTask({
      title: 'Orphan subtask',
      workspace_id: ws.id,
      parent_task_id: 'non-existent-parent-id',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/parent task not found/i);
  });
});

// ─── GET /api/tasks/[id] — subtasks included ─────────────────────────────────

describe('GET /api/tasks/[id] — subtasks included', () => {
  it('includes subtasks array in response', async () => {
    const ws = seedWorkspace();
    const parent = seedTask(ws.id, { title: 'Parent' });
    seedTask(ws.id, { title: 'Child A', parent_task_id: parent.id });
    seedTask(ws.id, { title: 'Child B', parent_task_id: parent.id });

    const res = await getTaskById(parent.id);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.id).toBe(parent.id);
    expect(Array.isArray(body.subtasks)).toBe(true);
    expect(body.subtasks).toHaveLength(2);
    const titles = body.subtasks.map((s: { title: string }) => s.title);
    expect(titles).toContain('Child A');
    expect(titles).toContain('Child B');
  });

  it('returns empty subtasks array when task has no children', async () => {
    const ws = seedWorkspace();
    const task = seedTask(ws.id, { title: 'Standalone' });

    const res = await getTaskById(task.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subtasks).toHaveLength(0);
  });
});

// ─── PATCH /api/tasks/[id] — parent_task_id update ───────────────────────────

describe('PATCH /api/tasks/[id] — parent_task_id update', () => {
  it('supports parent_task_id update', async () => {
    const ws = seedWorkspace();
    const parent = seedTask(ws.id, { title: 'New Parent' });
    const task = seedTask(ws.id, { title: 'Movable task' });

    const res = await patchTask(task.id, { parent_task_id: parent.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parent_task_id).toBe(parent.id);
  });

  it('rejects depth-violating parent_task_id update', async () => {
    const ws = seedWorkspace();
    const grandparent = seedTask(ws.id, { title: 'Grandparent' });
    const parentChild = seedTask(ws.id, { title: 'Parent-Child', parent_task_id: grandparent.id });
    const orphan = seedTask(ws.id, { title: 'Orphan' });

    // Try to set orphan's parent to parentChild (which already has a parent)
    const res = await patchTask(orphan.id, { parent_task_id: parentChild.id });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/depth limit/i);
  });
});

// ─── GET /api/tasks — parent_task_id filter ──────────────────────────────────

describe('GET /api/tasks — parent_task_id filter', () => {
  it('filters by parent_task_id', async () => {
    const ws = seedWorkspace();
    const parent = seedTask(ws.id, { title: 'Parent' });
    seedTask(ws.id, { title: 'Child 1', parent_task_id: parent.id });
    seedTask(ws.id, { title: 'Child 2', parent_task_id: parent.id });
    seedTask(ws.id, { title: 'Unrelated' });

    const res = await getTasks({ parent_task_id: parent.id });
    expect(res.status).toBe(200);
    const body: Array<{ parent_task_id: string }> = await res.json();
    expect(body).toHaveLength(2);
    expect(body.every((t) => t.parent_task_id === parent.id)).toBe(true);
  });

  it('with parent_task_id=none returns only top-level tasks', async () => {
    const ws = seedWorkspace();
    const parent = seedTask(ws.id, { title: 'Top-level Parent' });
    seedTask(ws.id, { title: 'Child', parent_task_id: parent.id });
    const topLevel = seedTask(ws.id, { title: 'Another top-level' });

    const res = await getTasks({ parent_task_id: 'none' });
    expect(res.status).toBe(200);
    const body: Array<{ id: string; parent_task_id: string | null }> = await res.json();

    // Should include parent and topLevel, but not the child
    expect(body.every((t) => t.parent_task_id === null)).toBe(true);
    const ids = body.map((t) => t.id);
    expect(ids).toContain(parent.id);
    expect(ids).toContain(topLevel.id);
  });
});
