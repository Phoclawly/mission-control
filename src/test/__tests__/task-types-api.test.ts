/**
 * Integration tests — GET /api/task-types, POST /api/tasks with type configs
 *
 * Tests:
 *   - GET /api/task-types returns all types
 *   - GET /api/task-types?implemented_only=true filters correctly
 *   - GET /api/task-types?include_config_schema=true includes configSchema
 *   - POST /api/tasks rejects bad claude-team config (missing team_size)
 *   - POST /api/tasks rejects bad multi-hypothesis config (empty hypotheses)
 *   - POST /api/tasks accepts valid claude-team config
 *   - POST /api/tasks accepts valid multi-hypothesis config
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  setupTestDb,
  teardownTestDb,
  resetTables,
  seedWorkspace,
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

async function getTaskTypes(params: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import('@/app/api/task-types/route');
  const qs = new URLSearchParams(params).toString();
  const req = new NextRequest(`http://localhost/api/task-types${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
  return GET(req);
}

async function postTask(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import('@/app/api/tasks/route');
  const req = new NextRequest('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

// ─── GET /api/task-types ──────────────────────────────────────────────────────

describe('GET /api/task-types', () => {
  it('returns all types', async () => {
    const res = await getTaskTypes();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.types).toBeDefined();
    expect(Array.isArray(body.types)).toBe(true);
    // The registry has at least 6 types (openclaw-native, claude-team, multi-hypothesis, e2e-validation, prd-flow, mcp-task)
    expect(body.types.length).toBeGreaterThanOrEqual(6);

    // Each type should have required fields
    for (const t of body.types) {
      expect(t.type).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.isImplemented).toBe('boolean');
    }
  });

  it('filters by implemented_only=true', async () => {
    const res = await getTaskTypes({ implemented_only: 'true' });
    expect(res.status).toBe(200);
    const body = await res.json();

    // All returned types should be implemented
    expect(body.types.every((t: { isImplemented: boolean }) => t.isImplemented === true)).toBe(true);

    // openclaw-native, claude-team, multi-hypothesis are implemented
    const typeNames = body.types.map((t: { type: string }) => t.type);
    expect(typeNames).toContain('openclaw-native');
    expect(typeNames).toContain('claude-team');
    expect(typeNames).toContain('multi-hypothesis');

    // e2e-validation, prd-flow, mcp-task are NOT implemented
    expect(typeNames).not.toContain('e2e-validation');
    expect(typeNames).not.toContain('prd-flow');
    expect(typeNames).not.toContain('mcp-task');
  });

  it('includes configSchema when include_config_schema=true', async () => {
    const res = await getTaskTypes({ include_config_schema: 'true' });
    expect(res.status).toBe(200);
    const body = await res.json();

    // claude-team should have a configSchema
    const claudeTeam = body.types.find((t: { type: string }) => t.type === 'claude-team');
    expect(claudeTeam).toBeDefined();
    expect(claudeTeam.configSchema).toBeDefined();
    expect(claudeTeam.configSchema.type).toBe('object');
    expect(claudeTeam.configSchema.properties.team_size).toBeDefined();

    // multi-hypothesis should have a configSchema
    const multiHyp = body.types.find((t: { type: string }) => t.type === 'multi-hypothesis');
    expect(multiHyp).toBeDefined();
    expect(multiHyp.configSchema).toBeDefined();
    expect(multiHyp.configSchema.properties.hypotheses).toBeDefined();

    // openclaw-native has no configSchema (null)
    const ocNative = body.types.find((t: { type: string }) => t.type === 'openclaw-native');
    expect(ocNative).toBeDefined();
    expect(ocNative.configSchema).toBeNull();
  });

  it('does not include configSchema by default', async () => {
    const res = await getTaskTypes();
    expect(res.status).toBe(200);
    const body = await res.json();

    const claudeTeam = body.types.find((t: { type: string }) => t.type === 'claude-team');
    expect(claudeTeam).toBeDefined();
    expect(claudeTeam.configSchema).toBeUndefined();
  });
});

// ─── POST /api/tasks — task_type_config validation ───────────────────────────

describe('POST /api/tasks — task type config validation', () => {
  it('rejects bad claude-team config (missing team_size)', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Bad team task',
      workspace_id: ws.id,
      task_type: 'claude-team',
      task_type_config: { team_members: [] },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
  });

  it('rejects bad multi-hypothesis config (empty hypotheses array)', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Bad hypothesis task',
      workspace_id: ws.id,
      task_type: 'multi-hypothesis',
      task_type_config: { hypotheses: [] },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
  });

  it('accepts valid claude-team config', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Valid team task',
      workspace_id: ws.id,
      task_type: 'claude-team',
      task_type_config: {
        team_size: 3,
        team_members: [
          { name: 'Frontend', focus: 'UI work', role: 'developer' },
          { name: 'Backend', focus: 'API work', role: 'developer' },
        ],
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task_type).toBe('claude-team');
    // task_type_config should be stored as JSON string
    const config = typeof body.task_type_config === 'string'
      ? JSON.parse(body.task_type_config)
      : body.task_type_config;
    expect(config.team_size).toBe(3);
    expect(config.team_members).toHaveLength(2);
  });

  it('accepts valid multi-hypothesis config', async () => {
    const ws = seedWorkspace();
    const res = await postTask({
      title: 'Valid hypothesis task',
      workspace_id: ws.id,
      task_type: 'multi-hypothesis',
      task_type_config: {
        hypotheses: [
          { label: 'Approach A', focus_description: 'Try the simple path' },
          { label: 'Approach B', focus_description: 'Try the complex path' },
        ],
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task_type).toBe('multi-hypothesis');
    const config = typeof body.task_type_config === 'string'
      ? JSON.parse(body.task_type_config)
      : body.task_type_config;
    expect(config.hypotheses).toHaveLength(2);
    expect(config.hypotheses[0].label).toBe('Approach A');
  });
});
