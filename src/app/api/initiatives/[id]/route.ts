import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import type { Task } from '@/lib/types';

interface InitiativeCacheRow {
  id: string;
  title: string;
  status: string;
  lead: string | null;
  participants: string | null;
  priority: string | null;
  created: string | null;
  target: string | null;
  summary: string | null;
  source: string | null;
  external_request_id: string | null;
  history: string | null;
  raw_json: string | null;
  workspace_id: string | null;
  synced_at: string;
  created_at: string | null;
  updated_at: string | null;
  task_count: number;
  completed_task_count: number;
}

function parseJsonField(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// GET /api/initiatives/[id] - Get a single initiative with linked tasks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const row = queryOne<InitiativeCacheRow>(
      `SELECT
        ic.*,
        COUNT(t.id) as task_count,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as completed_task_count
      FROM initiative_cache ic
      LEFT JOIN tasks t ON t.initiative_id = ic.id
      WHERE ic.id = ?
      GROUP BY ic.id`,
      [id]
    );

    if (!row) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    const tasks = queryAll<Task>(
      `SELECT t.*,
        a.name as assigned_agent_name,
        a.avatar_emoji as assigned_agent_emoji
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.initiative_id = ?
      ORDER BY t.created_at DESC`,
      [id]
    );

    const initiative = {
      ...row,
      participants: parseJsonField(row.participants),
      history: parseJsonField(row.history),
      task_count: Number(row.task_count),
      completed_task_count: Number(row.completed_task_count),
      tasks,
    };

    return NextResponse.json(initiative);
  } catch (error) {
    console.error('Failed to fetch initiative:', error);
    return NextResponse.json({ error: 'Failed to fetch initiative' }, { status: 500 });
  }
}
