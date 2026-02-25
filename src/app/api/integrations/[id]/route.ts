import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { UpdateIntegrationSchema } from '@/lib/validation';
import { broadcast } from '@/lib/events';
import { buildPatchQuery, notFound } from '@/lib/api-helpers';
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
    if (!existing) return notFound('Integration');

    const data = validation.data;
    const patch = buildPatchQuery('integrations', id, data, [
      'name', 'type', 'provider', 'status', 'credential_source',
      'validation_message', 'last_validated', 'config', 'metadata',
    ]);
    if (!patch) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    run(patch.sql, patch.values);

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
