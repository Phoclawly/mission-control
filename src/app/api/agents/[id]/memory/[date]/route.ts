import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import fs from 'fs';
import type { AgentMemoryEntry, Agent } from '@/lib/types';

// GET /api/agents/[id]/memory/[date] - Return content of a specific memory file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; date: string }> }
) {
  try {
    const { id, date } = await params;

    const agent = queryOne<Agent>('SELECT id, name FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const entry = queryOne<AgentMemoryEntry>(
      'SELECT * FROM agent_memory_index WHERE agent_id = ? AND date = ?',
      [id, date]
    );

    if (!entry) {
      return NextResponse.json({ error: 'Memory entry not found for this date' }, { status: 404 });
    }

    // Try to read the actual file from disk
    if (entry.file_path && fs.existsSync(entry.file_path)) {
      const content = fs.readFileSync(entry.file_path, 'utf-8');
      return NextResponse.json({
        ...entry,
        content,
        source: 'file',
      });
    }

    // File doesn't exist on disk - return summary from index with a note
    return NextResponse.json({
      ...entry,
      content: entry.summary || null,
      source: 'index',
      note: 'Original file not found on disk. Showing summary from index.',
    });
  } catch (error) {
    console.error('Failed to fetch agent memory content:', error);
    return NextResponse.json({ error: 'Failed to fetch agent memory content' }, { status: 500 });
  }
}
