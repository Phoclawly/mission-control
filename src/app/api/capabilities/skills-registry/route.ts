import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const skills = db.prepare(`
      SELECT c.*,
        json_group_array(json_object('id',a.id,'name',a.name,'avatar_emoji',a.avatar_emoji))
          FILTER (WHERE a.id IS NOT NULL) as agents_json
      FROM capabilities c
      LEFT JOIN agent_capabilities ac ON ac.capability_id = c.id
      LEFT JOIN agents a ON a.id = ac.agent_id
      WHERE c.category = 'skill'
      GROUP BY c.id ORDER BY c.name
    `).all();

    const result = (skills as Array<Record<string, unknown>>).map((s) => ({
      ...s,
      agents: JSON.parse((s.agents_json as string) || '[]'),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch skills registry:', error);
    return NextResponse.json({ error: 'Failed to fetch skills registry' }, { status: 500 });
  }
}
