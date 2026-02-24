import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { HealthCheck } from '@/lib/types';

// GET /api/health/history - Historical health checks with filters
export async function GET(request: NextRequest) {
  try {
    const targetType = request.nextUrl.searchParams.get('target_type');
    const targetId = request.nextUrl.searchParams.get('target_id');
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (targetType) {
      conditions.push('hc.target_type = ?');
      params.push(targetType);
    }
    if (targetId) {
      conditions.push('hc.target_id = ?');
      params.push(targetId);
    }

    let sql = `
      SELECT hc.*,
        CASE
          WHEN hc.target_type = 'capability' THEN c.name
          WHEN hc.target_type = 'integration' THEN i.name
        END as target_name
      FROM health_checks hc
      LEFT JOIN capabilities c ON hc.target_type = 'capability' AND c.id = hc.target_id
      LEFT JOIN integrations i ON hc.target_type = 'integration' AND i.id = hc.target_id
    `;

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY hc.checked_at DESC LIMIT ?';
    params.push(limit);

    const checks = queryAll<HealthCheck & { target_name: string | null }>(sql, params);
    return NextResponse.json(checks);
  } catch (error) {
    console.error('Failed to fetch health check history:', error);
    return NextResponse.json({ error: 'Failed to fetch health check history' }, { status: 500 });
  }
}
