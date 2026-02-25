import { NextRequest, NextResponse } from 'next/server';
import { TASK_TYPE_REGISTRY } from '@/lib/task-types';

// GET /api/task-types - List available task types from the registry
export async function GET(request: NextRequest) {
  try {
    const implementedOnly = request.nextUrl.searchParams.get('implemented_only') === 'true';
    const includeConfigSchema = request.nextUrl.searchParams.get('include_config_schema') === 'true';

    let types = TASK_TYPE_REGISTRY;

    if (implementedOnly) {
      types = types.filter((t) => t.isImplemented);
    }

    const payload = types.map((t) => ({
      type: t.type,
      label: t.label,
      description: t.description,
      badge: t.badge,
      badgeColor: t.badgeColor,
      isImplemented: t.isImplemented,
      defaultConfig: t.defaultConfig ?? null,
      ...(includeConfigSchema ? { configSchema: t.configSchema ?? null } : {}),
    }));

    return NextResponse.json({ types: payload });
  } catch (error) {
    console.error('Failed to fetch task types:', error);
    return NextResponse.json({ error: 'Failed to fetch task types' }, { status: 500 });
  }
}
