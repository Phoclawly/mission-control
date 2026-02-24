import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';
import type { AgentMemoryEntry, Agent } from '@/lib/types';

// GET /api/agents/[id]/memory - List memory index entries for an agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const agent = queryOne<Agent>('SELECT id FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const entries = queryAll<AgentMemoryEntry>(
      `SELECT * FROM agent_memory_index
       WHERE agent_id = ?
       ORDER BY date DESC
       LIMIT ?`,
      [id, limit]
    );

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Failed to fetch agent memory entries:', error);
    return NextResponse.json({ error: 'Failed to fetch agent memory entries' }, { status: 500 });
  }
}
