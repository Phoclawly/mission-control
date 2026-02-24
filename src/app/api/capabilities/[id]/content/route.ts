import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { getDb } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const capability = db.prepare('SELECT skill_path FROM capabilities WHERE id = ?').get(id) as { skill_path: string | null } | undefined;

    if (!capability || !capability.skill_path) {
      return NextResponse.json({ error: 'No skill_path configured' }, { status: 404 });
    }

    try {
      const content = readFileSync(capability.skill_path, 'utf-8');
      return new Response(content, { headers: { 'Content-Type': 'text/plain' } });
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Failed to fetch capability content:', error);
    return NextResponse.json({ error: 'Failed to fetch capability content' }, { status: 500 });
  }
}
