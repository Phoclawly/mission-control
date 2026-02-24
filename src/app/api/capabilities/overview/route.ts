import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';
import type { CapabilitiesOverview } from '@/lib/types';

// GET /api/capabilities/overview - Aggregated dashboard data
export async function GET(request: NextRequest) {
  try {
    // --- Capabilities summary ---
    const capTotal = queryOne<{ total: number }>(
      'SELECT COUNT(*) as total FROM capabilities'
    );

    const capByCategory = queryAll<{ category: string; count: number }>(
      'SELECT category, COUNT(*) as count FROM capabilities GROUP BY category'
    );

    const capByStatus = queryAll<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM capabilities GROUP BY status'
    );

    // --- Integrations summary ---
    const intTotal = queryOne<{ total: number }>(
      'SELECT COUNT(*) as total FROM integrations'
    );

    const intByStatus = queryAll<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM integrations GROUP BY status'
    );

    // --- Agents with capability/cron/memory info ---
    const agentRows = queryAll<{
      id: string;
      name: string;
      capabilityCount: number;
      uniqueCapabilities: number;
      cronCount: number;
      latestMemory: string | null;
    }>(
      `SELECT
        a.id,
        a.name,
        COALESCE(ac_counts.cap_count, 0) as capabilityCount,
        COALESCE(ac_counts.unique_caps, 0) as uniqueCapabilities,
        COALESCE(cron_counts.cron_count, 0) as cronCount,
        mem.latest_date as latestMemory
      FROM agents a
      LEFT JOIN (
        SELECT agent_id, COUNT(*) as cap_count, COUNT(DISTINCT capability_id) as unique_caps
        FROM agent_capabilities
        GROUP BY agent_id
      ) ac_counts ON ac_counts.agent_id = a.id
      LEFT JOIN (
        SELECT agent_id, COUNT(*) as cron_count
        FROM cron_jobs
        GROUP BY agent_id
      ) cron_counts ON cron_counts.agent_id = a.id
      LEFT JOIN (
        SELECT agent_id, MAX(date) as latest_date
        FROM agent_memory_index
        GROUP BY agent_id
      ) mem ON mem.agent_id = a.id
      ORDER BY a.name`
    );

    // Map null latestMemory to undefined for type compatibility
    const agents = agentRows.map(row => ({
      ...row,
      latestMemory: row.latestMemory ?? undefined,
    }));

    // --- Alerts: broken/expired integrations, broken capabilities ---
    const alerts: CapabilitiesOverview['alerts'] = [];

    const brokenCapabilities = queryAll<{ name: string; status: string; health_message: string | null }>(
      `SELECT name, status, health_message FROM capabilities WHERE status IN ('broken', 'degraded')`
    );
    for (const cap of brokenCapabilities) {
      alerts.push({
        type: cap.status === 'broken' ? 'error' : 'warning',
        target: cap.name,
        message: cap.health_message || `Capability "${cap.name}" is ${cap.status}`,
      });
    }

    const brokenIntegrations = queryAll<{ name: string; status: string; validation_message: string | null }>(
      `SELECT name, status, validation_message FROM integrations WHERE status IN ('broken', 'expired')`
    );
    for (const int of brokenIntegrations) {
      alerts.push({
        type: int.status === 'broken' ? 'error' : 'warning',
        target: int.name,
        message: int.validation_message || `Integration "${int.name}" is ${int.status}`,
      });
    }

    // --- Cron summary ---
    const cronSummaryRows = queryAll<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM cron_jobs GROUP BY status'
    );
    const cronSummary = { active: 0, disabled: 0, stale: 0 };
    for (const row of cronSummaryRows) {
      if (row.status === 'active') cronSummary.active = row.count;
      else if (row.status === 'disabled') cronSummary.disabled = row.count;
      else if (row.status === 'stale') cronSummary.stale = row.count;
    }

    // --- Last full check ---
    const lastCheck = queryOne<{ checked_at: string }>(
      'SELECT checked_at FROM health_checks ORDER BY checked_at DESC LIMIT 1'
    );

    const overview: CapabilitiesOverview = {
      capabilities: {
        total: capTotal?.total ?? 0,
        byCategory: Object.fromEntries(capByCategory.map(r => [r.category, r.count])),
        byStatus: Object.fromEntries(capByStatus.map(r => [r.status, r.count])),
      },
      integrations: {
        total: intTotal?.total ?? 0,
        byStatus: Object.fromEntries(intByStatus.map(r => [r.status, r.count])),
      },
      agents,
      alerts,
      cronSummary,
      lastFullCheck: lastCheck?.checked_at,
    };

    return NextResponse.json(overview);
  } catch (error) {
    console.error('Failed to fetch capabilities overview:', error);
    return NextResponse.json({ error: 'Failed to fetch capabilities overview' }, { status: 500 });
  }
}
