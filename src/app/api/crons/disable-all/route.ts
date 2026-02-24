import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';

// POST /api/crons/disable-all - Disable all active cron jobs
export async function POST(request: NextRequest) {
  try {
    const now = new Date().toISOString();
    const result = run(
      "UPDATE cron_jobs SET status = 'disabled', updated_at = ? WHERE status = 'active'",
      [now]
    );

    return NextResponse.json({
      success: true,
      affected: result.changes,
    });
  } catch (error) {
    console.error('Failed to disable all cron jobs:', error);
    return NextResponse.json({ error: 'Failed to disable all cron jobs' }, { status: 500 });
  }
}
