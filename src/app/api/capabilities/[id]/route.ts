import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { UpdateCapabilitySchema } from '@/lib/validation';
import { broadcast } from '@/lib/events';
import { buildPatchQuery, notFound } from '@/lib/api-helpers';
import type { Capability } from '@/lib/types';

// GET /api/capabilities/[id] - Get a single capability
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const capability = queryOne<Capability>('SELECT * FROM capabilities WHERE id = ?', [id]);

    if (!capability) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(capability);
  } catch (error) {
    console.error('Failed to fetch capability:', error);
    return NextResponse.json({ error: 'Failed to fetch capability' }, { status: 500 });
  }
}

// PATCH /api/capabilities/[id] - Update a capability
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validation = UpdateCapabilitySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const existing = queryOne<Capability>('SELECT * FROM capabilities WHERE id = ?', [id]);
    if (!existing) return notFound('Capability');

    const data = validation.data;
    // Convert boolean to SQLite integer before building query
    const patchBody: Record<string, unknown> = { ...data };
    if (patchBody.is_shared !== undefined) {
      patchBody.is_shared = patchBody.is_shared ? 1 : 0;
    }

    const patch = buildPatchQuery('capabilities', id, patchBody, [
      'name', 'category', 'description', 'provider', 'version',
      'install_path', 'config_ref', 'is_shared', 'status',
      'health_message', 'last_health_check', 'metadata',
    ]);
    if (!patch) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    run(patch.sql, patch.values);

    const capability = queryOne<Capability>('SELECT * FROM capabilities WHERE id = ?', [id]);
    broadcast({ type: 'capability_updated', payload: capability! });
    return NextResponse.json(capability);
  } catch (error) {
    console.error('Failed to update capability:', error);
    return NextResponse.json({ error: 'Failed to update capability' }, { status: 500 });
  }
}

// DELETE /api/capabilities/[id] - Delete a capability (cascades through agent_capabilities)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Capability>('SELECT * FROM capabilities WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // agent_capabilities has ON DELETE CASCADE, so it will be cleaned up automatically
    run('DELETE FROM capabilities WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete capability:', error);
    return NextResponse.json({ error: 'Failed to delete capability' }, { status: 500 });
  }
}
