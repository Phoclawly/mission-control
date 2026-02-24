import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { CreateCapabilitySchema } from '@/lib/validation';
import { broadcast } from '@/lib/events';
import type { Capability } from '@/lib/types';

// GET /api/capabilities - List capabilities with optional filters
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get('category');
    const status = request.nextUrl.searchParams.get('status');
    const agentId = request.nextUrl.searchParams.get('agent_id');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (category) {
      conditions.push('c.category = ?');
      params.push(category);
    }
    if (status) {
      conditions.push('c.status = ?');
      params.push(status);
    }

    let sql: string;

    if (agentId) {
      sql = `
        SELECT c.* FROM capabilities c
        JOIN agent_capabilities ac ON ac.capability_id = c.id
        WHERE ac.agent_id = ?
      `;
      params.unshift(agentId);
      if (conditions.length > 0) {
        sql += ' AND ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY c.name';
    } else {
      sql = 'SELECT c.* FROM capabilities c';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY c.name';
    }

    const capabilities = queryAll<Capability>(sql, params);
    return NextResponse.json(capabilities);
  } catch (error) {
    console.error('Failed to fetch capabilities:', error);
    return NextResponse.json({ error: 'Failed to fetch capabilities' }, { status: 500 });
  }
}

// POST /api/capabilities - Create a new capability
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CreateCapabilitySchema.safeParse(body);
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
      `INSERT INTO capabilities (id, name, category, description, provider, version, install_path, config_ref, is_shared, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.category,
        data.description || null,
        data.provider || null,
        data.version || null,
        data.install_path || null,
        data.config_ref || null,
        data.is_shared !== undefined ? (data.is_shared ? 1 : 0) : 1,
        data.status || 'unknown',
        data.metadata || null,
        now,
        now,
      ]
    );

    const capability = queryOne<Capability>('SELECT * FROM capabilities WHERE id = ?', [id]);
    broadcast({ type: 'capability_updated', payload: capability! });
    return NextResponse.json(capability, { status: 201 });
  } catch (error) {
    console.error('Failed to create capability:', error);
    return NextResponse.json({ error: 'Failed to create capability' }, { status: 500 });
  }
}
