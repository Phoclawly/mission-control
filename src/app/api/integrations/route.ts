import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { CreateIntegrationSchema } from '@/lib/validation';
import { broadcast } from '@/lib/events';
import type { Integration } from '@/lib/types';

// GET /api/integrations - List integrations with optional filters
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status');
    const type = request.nextUrl.searchParams.get('type');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    let sql = 'SELECT * FROM integrations';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY name';

    const integrations = queryAll<Integration>(sql, params);
    return NextResponse.json(integrations);
  } catch (error) {
    console.error('Failed to fetch integrations:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}

// POST /api/integrations - Create a new integration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CreateIntegrationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const id = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO integrations (id, name, type, provider, status, credential_source, config, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.type,
        data.provider || null,
        data.status || 'unknown',
        data.credential_source || null,
        data.config || null,
        data.metadata || null,
        now,
        now,
      ]
    );

    const integration = queryOne<Integration>('SELECT * FROM integrations WHERE id = ?', [id]);
    broadcast({ type: 'integration_updated', payload: integration! });
    return NextResponse.json(integration, { status: 201 });
  } catch (error) {
    console.error('Failed to create integration:', error);
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
}
