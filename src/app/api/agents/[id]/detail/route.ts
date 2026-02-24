import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';
import type { Agent, TaskActivity, OpenClawSession } from '@/lib/types';

// GET /api/agents/[id]/detail - Get enriched agent data with stats, activity, and session info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Fetch task stats
    const statsRow = queryOne<{ tasksAssigned: number; tasksCompleted: number; totalTasks: number }>(
      `SELECT
        COUNT(CASE WHEN status != 'done' THEN 1 END) AS tasksAssigned,
        COUNT(CASE WHEN status = 'done' THEN 1 END) AS tasksCompleted,
        COUNT(*) AS totalTasks
      FROM tasks
      WHERE assigned_agent_id = ?`,
      [id]
    );

    const stats = {
      tasksAssigned: statsRow?.tasksAssigned ?? 0,
      tasksCompleted: statsRow?.tasksCompleted ?? 0,
      totalTasks: statsRow?.totalTasks ?? 0,
    };

    // Fetch active session (if any)
    const activeSession = queryOne<OpenClawSession>(
      `SELECT * FROM openclaw_sessions
       WHERE agent_id = ? AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    ) ?? null;

    // Fetch last 10 activity entries
    const recentActivity = queryAll<TaskActivity>(
      `SELECT * FROM task_activities
       WHERE agent_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );

    return NextResponse.json({
      agent,
      stats,
      activeSession,
      recentActivity,
    });
  } catch (error) {
    console.error('Failed to fetch agent detail:', error);
    return NextResponse.json({ error: 'Failed to fetch agent detail' }, { status: 500 });
  }
}
