import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { CreateCronJobSchema } from '@/lib/validation';
import type { CronJob } from '@/lib/types';

// GET /api/crons - List all cron jobs with optional filters
export async function GET(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get('agent_id');
    const status = request.nextUrl.searchParams.get('status');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (agentId) {
      conditions.push('cj.agent_id = ?');
      params.push(agentId);
    }
    if (status) {
      conditions.push('cj.status = ?');
      params.push(status);
    }

    let sql = `
      SELECT cj.*, a.name as agent_name
      FROM cron_jobs cj
      LEFT JOIN agents a ON a.id = cj.agent_id
    `;

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY cj.name';

    const crons = queryAll<CronJob>(sql, params);
    return NextResponse.json(crons);
  } catch (error) {
    console.error('Failed to fetch cron jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch cron jobs' }, { status: 500 });
  }
}

// POST /api/crons - Create a new cron job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CreateCronJobSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const id = uuidv4();
    const now = new Date().toISOString();

    // If agent_id provided, verify it exists
    if (data.agent_id) {
      const agent = queryOne<{ id: string }>('SELECT id FROM agents WHERE id = ?', [data.agent_id]);
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
    }

    run(
      `INSERT INTO cron_jobs (id, name, schedule, command, agent_id, type, status, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.schedule,
        data.command,
        data.agent_id || null,
        data.type || 'shell',
        data.status || 'active',
        data.description || null,
        now,
        now,
      ]
    );

    const cronJob = queryOne<CronJob>(
      `SELECT cj.*, a.name as agent_name
       FROM cron_jobs cj
       LEFT JOIN agents a ON a.id = cj.agent_id
       WHERE cj.id = ?`,
      [id]
    );

    return NextResponse.json(cronJob, { status: 201 });
  } catch (error) {
    console.error('Failed to create cron job:', error);
    return NextResponse.json({ error: 'Failed to create cron job' }, { status: 500 });
  }
}
