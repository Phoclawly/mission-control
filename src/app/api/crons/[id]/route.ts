import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { UpdateCronJobSchema } from '@/lib/validation';
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
    if (data.schedule !== undefined) {
      updates.push('schedule = ?');
      values.push(data.schedule);
    }
    if (data.command !== undefined) {
      updates.push('command = ?');
      values.push(data.command);
    }
    if (data.agent_id !== undefined) {
      updates.push('agent_id = ?');
      values.push(data.agent_id);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.last_run !== undefined) {
      updates.push('last_run = ?');
      values.push(data.last_run);
    }
    if (data.last_result !== undefined) {
      updates.push('last_result = ?');
      values.push(data.last_result);
    }
    if (data.last_duration_ms !== undefined) {
      updates.push('last_duration_ms = ?');
      values.push(data.last_duration_ms);
    }
    if (data.error_count !== undefined) {
      updates.push('error_count = ?');
      values.push(data.error_count);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    run(`UPDATE cron_jobs SET ${updates.join(', ')} WHERE id = ?`, values);

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
