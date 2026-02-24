import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { UpdateIntegrationSchema } from '@/lib/validation';
import { broadcast } from '@/lib/events';
import type { Integration } from '@/lib/types';

// GET /api/integrations/[id] - Get a single integration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const integration = queryOne<Integration>('SELECT * FROM integrations WHERE id = ?', [id]);

    if (!integration) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(integration);
  } catch (error) {
    console.error('Failed to fetch integration:', error);
    return NextResponse.json({ error: 'Failed to fetch integration' }, { status: 500 });
  }
}

// PATCH /api/integrations/[id] - Update an integration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validation = UpdateIntegrationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const existing = queryOne<Integration>('SELECT * FROM integrations WHERE id = ?', [id]);
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
    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
    }
    if (data.provider !== undefined) {
      updates.push('provider = ?');
      values.push(data.provider);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.credential_source !== undefined) {
      updates.push('credential_source = ?');
      values.push(data.credential_source);
    }
    if (data.validation_message !== undefined) {
      updates.push('validation_message = ?');
      values.push(data.validation_message);
    }
    if (data.last_validated !== undefined) {
      updates.push('last_validated = ?');
      values.push(data.last_validated);
    }
    if (data.config !== undefined) {
      updates.push('config = ?');
      values.push(data.config);
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

    run(`UPDATE integrations SET ${updates.join(', ')} WHERE id = ?`, values);

    const integration = queryOne<Integration>('SELECT * FROM integrations WHERE id = ?', [id]);
    broadcast({ type: 'integration_updated', payload: integration! });
    return NextResponse.json(integration);
  } catch (error) {
    console.error('Failed to update integration:', error);
    return NextResponse.json({ error: 'Failed to update integration' }, { status: 500 });
  }
}

// DELETE /api/integrations/[id] - Delete an integration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Integration>('SELECT * FROM integrations WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    run('DELETE FROM integrations WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete integration:', error);
    return NextResponse.json({ error: 'Failed to delete integration' }, { status: 500 });
  }
}
