import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { CreateCronJobSchema } from '@/lib/validation';
import type { CronJob, Agent } from '@/lib/types';

// GET /api/agents/[id]/crons - List crons for a specific agent
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

    const crons = queryAll<CronJob>(
      `SELECT cj.*, a.name as agent_name
       FROM cron_jobs cj
       LEFT JOIN agents a ON a.id = cj.agent_id
       WHERE cj.agent_id = ?
       ORDER BY cj.name`,
      [id]
    );

    return NextResponse.json(crons);
  } catch (error) {
    console.error('Failed to fetch agent cron jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch agent cron jobs' }, { status: 500 });
  }
}

// POST /api/agents/[id]/crons - Create a cron job for a specific agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const agent = queryOne<Agent>('SELECT id, name FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const body = await request.json();
    // Override agent_id with the URL param
    const validation = CreateCronJobSchema.safeParse({ ...body, agent_id: id });
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const cronId = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO cron_jobs (id, name, schedule, command, agent_id, type, status, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cronId,
        data.name,
        data.schedule,
        data.command,
        id,
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
      [cronId]
    );

    return NextResponse.json(cronJob, { status: 201 });
  } catch (error) {
    console.error('Failed to create cron job for agent:', error);
    return NextResponse.json({ error: 'Failed to create cron job for agent' }, { status: 500 });
  }
}
