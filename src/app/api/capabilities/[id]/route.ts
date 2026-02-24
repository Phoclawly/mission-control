import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { UpdateCapabilitySchema } from '@/lib/validation';
import { broadcast } from '@/lib/events';
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
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = validation.data;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.category !== undefined) {
      updates.push('category = ?');
      values.push(data.category);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.provider !== undefined) {
      updates.push('provider = ?');
      values.push(data.provider);
    }
    if (data.version !== undefined) {
      updates.push('version = ?');
      values.push(data.version);
    }
    if (data.install_path !== undefined) {
      updates.push('install_path = ?');
      values.push(data.install_path);
    }
    if (data.config_ref !== undefined) {
      updates.push('config_ref = ?');
      values.push(data.config_ref);
    }
    if (data.is_shared !== undefined) {
      updates.push('is_shared = ?');
      values.push(data.is_shared ? 1 : 0);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.health_message !== undefined) {
      updates.push('health_message = ?');
      values.push(data.health_message);
    }
    if (data.last_health_check !== undefined) {
      updates.push('last_health_check = ?');
      values.push(data.last_health_check);
    }
    if (data.metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(data.metadata);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    run(`UPDATE capabilities SET ${updates.join(', ')} WHERE id = ?`, values);

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
