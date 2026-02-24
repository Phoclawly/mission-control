import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { broadcast } from '@/lib/events';
import type { HealthCheck } from '@/lib/types';

// GET /api/health - Aggregate health status (latest check per capability + integration)
export async function GET() {
  try {
    // Latest health check per capability
    const capabilityHealth = queryAll<HealthCheck & { target_name: string }>(
      `SELECT hc.*, c.name as target_name
       FROM health_checks hc
       INNER JOIN (
         SELECT target_id, MAX(checked_at) as max_checked
         FROM health_checks
         WHERE target_type = 'capability'
         GROUP BY target_id
       ) latest ON hc.target_id = latest.target_id AND hc.checked_at = latest.max_checked
       JOIN capabilities c ON c.id = hc.target_id
       WHERE hc.target_type = 'capability'
       ORDER BY c.name`
    );

    // Latest health check per integration
    const integrationHealth = queryAll<HealthCheck & { target_name: string }>(
      `SELECT hc.*, i.name as target_name
       FROM health_checks hc
       INNER JOIN (
         SELECT target_id, MAX(checked_at) as max_checked
         FROM health_checks
         WHERE target_type = 'integration'
         GROUP BY target_id
       ) latest ON hc.target_id = latest.target_id AND hc.checked_at = latest.max_checked
       JOIN integrations i ON i.id = hc.target_id
       WHERE hc.target_type = 'integration'
       ORDER BY i.name`
    );

    // Summary counts
    const allChecks = [...capabilityHealth, ...integrationHealth];
    const summary = {
      total: allChecks.length,
      pass: allChecks.filter(c => c.status === 'pass').length,
      fail: allChecks.filter(c => c.status === 'fail').length,
      warn: allChecks.filter(c => c.status === 'warn').length,
      skip: allChecks.filter(c => c.status === 'skip').length,
    };

    return NextResponse.json({
      summary,
      capabilities: capabilityHealth,
      integrations: integrationHealth,
    });
  } catch (error) {
    console.error('Failed to fetch health status:', error);
    return NextResponse.json({ error: 'Failed to fetch health status' }, { status: 500 });
  }
}

// POST /api/health - Record a health check result
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { target_type, target_id, status, message, duration_ms } = body as {
      target_type?: string;
      target_id?: string;
      status?: string;
      message?: string;
      duration_ms?: number;
    };

    if (!target_type || !target_id || !status) {
      return NextResponse.json(
        { error: 'target_type, target_id, and status are required' },
        { status: 400 }
      );
    }

    if (!['capability', 'integration'].includes(target_type)) {
      return NextResponse.json(
        { error: 'target_type must be "capability" or "integration"' },
        { status: 400 }
      );
    }

    if (!['pass', 'fail', 'warn', 'skip'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be "pass", "fail", "warn", or "skip"' },
        { status: 400 }
      );
    }

    // Verify target exists
    if (target_type === 'capability') {
      const cap = queryOne<{ id: string }>('SELECT id FROM capabilities WHERE id = ?', [target_id]);
      if (!cap) {
        return NextResponse.json({ error: 'Capability not found' }, { status: 404 });
      }
    } else {
      const int = queryOne<{ id: string }>('SELECT id FROM integrations WHERE id = ?', [target_id]);
      if (!int) {
        return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO health_checks (id, target_type, target_id, status, message, duration_ms, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, target_type, target_id, status, message || null, duration_ms || null, now]
    );

    // Update the target's health fields
    if (target_type === 'capability') {
      // Map health check status to capability status
      const capStatus = status === 'pass' ? 'healthy' : status === 'fail' ? 'broken' : status === 'warn' ? 'degraded' : 'unknown';
      run(
        'UPDATE capabilities SET status = ?, last_health_check = ?, health_message = ?, updated_at = ? WHERE id = ?',
        [capStatus, now, message || null, now, target_id]
      );
    } else {
      // Map health check status to integration status
      const intStatus = status === 'pass' ? 'connected' : status === 'fail' ? 'broken' : 'unknown';
      run(
        'UPDATE integrations SET status = ?, last_validated = ?, validation_message = ?, updated_at = ? WHERE id = ?',
        [intStatus, now, message || null, now, target_id]
      );
    }

    const healthCheck = queryOne<HealthCheck>('SELECT * FROM health_checks WHERE id = ?', [id]);
    broadcast({ type: 'health_check_completed', payload: healthCheck! });
    return NextResponse.json(healthCheck, { status: 201 });
  } catch (error) {
    console.error('Failed to record health check:', error);
    return NextResponse.json({ error: 'Failed to record health check' }, { status: 500 });
  }
}
