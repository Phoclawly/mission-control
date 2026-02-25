import { NextRequest, NextResponse } from 'next/server';
import { queryAll, run, queryOne } from '@/lib/db';

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

// GET /api/initiatives - List initiatives with task counts
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspace_id');
    const status = request.nextUrl.searchParams.get('status');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (workspaceId) {
      conditions.push('ic.workspace_id = ?');
      params.push(workspaceId);
    }
    if (status) {
      conditions.push('ic.status = ?');
      params.push(status);
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT
        ic.*,
        COUNT(t.id) as task_count,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as completed_task_count
      FROM initiative_cache ic
      LEFT JOIN tasks t ON t.initiative_id = ic.id
      ${where}
      GROUP BY ic.id
      ORDER BY ic.created DESC,
        CASE ic.status WHEN 'in-progress' THEN 0 ELSE 1 END
    `;

    const rows = queryAll<InitiativeCacheRow>(sql, params);

    const initiatives = rows.map((row) => ({
      ...row,
      participants: parseJsonField(row.participants),
      history: parseJsonField(row.history),
      task_count: Number(row.task_count),
      completed_task_count: Number(row.completed_task_count),
    }));

    return NextResponse.json(initiatives);
  } catch (error) {
    console.error('Failed to fetch initiatives:', error);
    return NextResponse.json({ error: 'Failed to fetch initiatives' }, { status: 500 });
  }
}

// POST /api/initiatives - Create a new initiative
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, status, lead, priority, summary, source, workspace_id, created, synced_at, history } = body;

    if (!id || !title) {
      return NextResponse.json({ error: 'id and title are required' }, { status: 400 });
    }

    run(
      `INSERT INTO initiative_cache (id, title, status, lead, priority, summary, source, workspace_id, created, synced_at, history)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, status || 'planned', lead || null, priority || 'normal', summary || null, source || 'mission-control', workspace_id || 'default', created || new Date().toISOString(), synced_at || new Date().toISOString(), typeof history === 'string' ? history : JSON.stringify(history || [])]
    );

    const created_row = queryOne<InitiativeCacheRow>(
      `SELECT ic.*, COUNT(t.id) as task_count, SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as completed_task_count
       FROM initiative_cache ic LEFT JOIN tasks t ON t.initiative_id = ic.id
       WHERE ic.id = ? GROUP BY ic.id`,
      [id]
    );

    if (!created_row) {
      return NextResponse.json({ error: 'Failed to read back created initiative' }, { status: 500 });
    }

    return NextResponse.json({
      ...created_row,
      participants: parseJsonField(created_row.participants),
      history: parseJsonField(created_row.history),
      task_count: Number(created_row.task_count),
      completed_task_count: Number(created_row.completed_task_count),
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create initiative:', error);
    return NextResponse.json({ error: 'Failed to create initiative' }, { status: 500 });
  }
}
