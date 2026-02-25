/**
 * Integration tests — GET /api/initiatives, GET /api/initiatives/[id]
 *
 * Tests:
 *   - List initiatives (empty, with counts, filtered by workspace/status)
 *   - Single initiative detail with history and linked tasks
 *   - 404 for non-existent initiative
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  setupTestDb,
  teardownTestDb,
  resetTables,
  seedWorkspace,
  seedTask,
  seedInitiativeCache,
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

async function getInitiatives(params: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import('@/app/api/initiatives/route');
  const qs = new URLSearchParams(params).toString();
  const req = new NextRequest(`http://localhost/api/initiatives${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
  return GET(req);
}

async function getInitiativeById(id: string): Promise<Response> {
  const { GET } = await import('@/app/api/initiatives/[id]/route');
  const req = new NextRequest(`http://localhost/api/initiatives/${id}`, {
    method: 'GET',
  });
  return GET(req, { params: Promise.resolve({ id }) });
}

// ─── GET /api/initiatives — list ──────────────────────────────────────────────

describe('GET /api/initiatives — list', () => {
  it('returns empty array when cache is empty', async () => {
    const res = await getInitiatives();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns cached initiatives with task counts', async () => {
    const ws = seedWorkspace();
    const init = seedInitiativeCache({ id: 'INIT-010', title: 'Build feature X', workspace_id: ws.id });

    // Seed tasks linked to this initiative
    seedTask(ws.id, { initiative_id: init.id, status: 'inbox' });
    seedTask(ws.id, { initiative_id: init.id, status: 'done' });
    seedTask(ws.id, { initiative_id: init.id, status: 'in_progress' });

    const res = await getInitiatives();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('INIT-010');
    expect(body[0].title).toBe('Build feature X');
    expect(body[0].task_count).toBe(3);
    expect(body[0].completed_task_count).toBe(1);
  });

  it('filters by workspace_id', async () => {
    const ws1 = seedWorkspace({ slug: 'ws-alpha' });
    const ws2 = seedWorkspace({ slug: 'ws-beta', name: 'Beta WS' });

    seedInitiativeCache({ id: 'INIT-020', title: 'Alpha initiative', workspace_id: ws1.id });
    seedInitiativeCache({ id: 'INIT-021', title: 'Beta initiative', workspace_id: ws2.id });

    const res = await getInitiatives({ workspace_id: ws1.id });
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('INIT-020');
  });

  it('filters by status', async () => {
    seedInitiativeCache({ id: 'INIT-030', title: 'Active one', status: 'in-progress' });
    seedInitiativeCache({ id: 'INIT-031', title: 'Done one', status: 'completed' });

    const res = await getInitiatives({ status: 'completed' });
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('INIT-031');
    expect(body[0].status).toBe('completed');
  });
});

// ─── GET /api/initiatives/[id] — detail ───────────────────────────────────────

describe('GET /api/initiatives/[id] — detail', () => {
  it('returns single initiative with history and linked tasks', async () => {
    const ws = seedWorkspace();
    const historyJson = JSON.stringify([
      { status: 'planned', at: '2025-01-01T00:00:00Z', by: 'mission-control', note: 'Created' },
      { status: 'in-progress', at: '2025-01-02T00:00:00Z', by: 'ventanal', note: 'Started work' },
    ]);

    seedInitiativeCache({
      id: 'INIT-040',
      title: 'Detailed initiative',
      status: 'in-progress',
      workspace_id: ws.id,
      history: historyJson,
      summary: 'A detailed summary',
    });

    seedTask(ws.id, { title: 'Sub task A', initiative_id: 'INIT-040', status: 'inbox' });
    seedTask(ws.id, { title: 'Sub task B', initiative_id: 'INIT-040', status: 'done' });

    const res = await getInitiativeById('INIT-040');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.id).toBe('INIT-040');
    expect(body.title).toBe('Detailed initiative');
    expect(body.summary).toBe('A detailed summary');
    expect(body.task_count).toBe(2);
    expect(body.completed_task_count).toBe(1);

    // history should be parsed from JSON
    expect(Array.isArray(body.history)).toBe(true);
    expect(body.history).toHaveLength(2);
    expect(body.history[0].status).toBe('planned');

    // tasks array should be present
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.tasks).toHaveLength(2);
    const taskTitles = body.tasks.map((t: { title: string }) => t.title);
    expect(taskTitles).toContain('Sub task A');
    expect(taskTitles).toContain('Sub task B');
  });

  it('returns 404 for non-existent initiative', async () => {
    const res = await getInitiativeById('INIT-999');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});
