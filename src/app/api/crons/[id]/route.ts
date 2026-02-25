import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { UpdateCronJobSchema } from '@/lib/validation';
import { buildPatchQuery, notFound } from '@/lib/api-helpers';
import type { CronJob } from '@/lib/types';

// GET /api/crons/[id] - Get a single cron job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cronJob = queryOne<CronJob>(
      `SELECT cj.*, a.name as agent_name
       FROM cron_jobs cj
       LEFT JOIN agents a ON a.id = cj.agent_id
       WHERE cj.id = ?`,
      [id]
    );

    if (!cronJob) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(cronJob);
  } catch (error) {
    console.error('Failed to fetch cron job:', error);
    return NextResponse.json({ error: 'Failed to fetch cron job' }, { status: 500 });
  }
}

// PATCH /api/crons/[id] - Update a cron job
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validation = UpdateCronJobSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const existing = queryOne<CronJob>('SELECT * FROM cron_jobs WHERE id = ?', [id]);
    if (!existing) return notFound('Cron job');

    const data = validation.data;
    const patch = buildPatchQuery('cron_jobs', id, data, [
      'name', 'schedule', 'command', 'agent_id', 'type', 'status',
      'description', 'last_run', 'last_result', 'last_duration_ms', 'error_count',
    ]);
    if (!patch) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    run(patch.sql, patch.values);

    const cronJob = queryOne<CronJob>(
      `SELECT cj.*, a.name as agent_name
       FROM cron_jobs cj
       LEFT JOIN agents a ON a.id = cj.agent_id
       WHERE cj.id = ?`,
      [id]
    );

    return NextResponse.json(cronJob);
  } catch (error) {
    console.error('Failed to update cron job:', error);
    return NextResponse.json({ error: 'Failed to update cron job' }, { status: 500 });
  }
}

// DELETE /api/crons/[id] - Delete a cron job
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<CronJob>('SELECT * FROM cron_jobs WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    run('DELETE FROM cron_jobs WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete cron job:', error);
    return NextResponse.json({ error: 'Failed to delete cron job' }, { status: 500 });
  }
}
