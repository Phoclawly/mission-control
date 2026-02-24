import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Capability, Agent } from '@/lib/types';

// GET /api/agents/[id]/capabilities - List capabilities for an agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const agent = queryOne<Agent>('SELECT id FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const capabilities = queryAll<Capability & { enabled: number; config_override: string | null }>(
      `SELECT c.*, ac.enabled, ac.config_override
       FROM capabilities c
       JOIN agent_capabilities ac ON ac.capability_id = c.id
       WHERE ac.agent_id = ?
       ORDER BY c.name`,
      [id]
    );

    return NextResponse.json(capabilities);
  } catch (error) {
    console.error('Failed to fetch agent capabilities:', error);
    return NextResponse.json({ error: 'Failed to fetch agent capabilities' }, { status: 500 });
  }
}

// POST /api/agents/[id]/capabilities - Assign a capability to an agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { capability_id, enabled, config_override } = body as {
      capability_id?: string;
      enabled?: boolean;
      config_override?: string;
    };

    if (!capability_id) {
      return NextResponse.json({ error: 'capability_id is required' }, { status: 400 });
    }

    const agent = queryOne<Agent>('SELECT id FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const capability = queryOne<Capability>('SELECT id FROM capabilities WHERE id = ?', [capability_id]);
    if (!capability) {
      return NextResponse.json({ error: 'Capability not found' }, { status: 404 });
    }

    // Check if already assigned
    const existing = queryOne<{ agent_id: string }>(
      'SELECT agent_id FROM agent_capabilities WHERE agent_id = ? AND capability_id = ?',
      [id, capability_id]
    );
    if (existing) {
      return NextResponse.json({ error: 'Capability already assigned to this agent' }, { status: 409 });
    }

    run(
      'INSERT INTO agent_capabilities (agent_id, capability_id, enabled, config_override) VALUES (?, ?, ?, ?)',
      [id, capability_id, enabled !== undefined ? (enabled ? 1 : 0) : 1, config_override || null]
    );

    const result = queryOne<Capability & { enabled: number; config_override: string | null }>(
      `SELECT c.*, ac.enabled, ac.config_override
       FROM capabilities c
       JOIN agent_capabilities ac ON ac.capability_id = c.id
       WHERE ac.agent_id = ? AND ac.capability_id = ?`,
      [id, capability_id]
    );

    broadcast({ type: 'capability_updated', payload: result! });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Failed to assign capability to agent:', error);
    return NextResponse.json({ error: 'Failed to assign capability to agent' }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/capabilities - Remove a capability from an agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { capability_id } = body as { capability_id?: string };

    if (!capability_id) {
      return NextResponse.json({ error: 'capability_id is required' }, { status: 400 });
    }

    const existing = queryOne<{ agent_id: string }>(
      'SELECT agent_id FROM agent_capabilities WHERE agent_id = ? AND capability_id = ?',
      [id, capability_id]
    );
    if (!existing) {
      return NextResponse.json({ error: 'Capability not assigned to this agent' }, { status: 404 });
    }

    run(
      'DELETE FROM agent_capabilities WHERE agent_id = ? AND capability_id = ?',
      [id, capability_id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove capability from agent:', error);
    return NextResponse.json({ error: 'Failed to remove capability from agent' }, { status: 500 });
  }
}
