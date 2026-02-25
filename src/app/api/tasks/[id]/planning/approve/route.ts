import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface PlanningMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// Generate spec markdown from planning message history (Q&A extraction)
function generateSpecFromMessages(task: { title: string; description?: string }, messages: PlanningMessage[]): string {
  const lines: string[] = [];

  lines.push(`# ${task.title}`);
  lines.push('');
  lines.push('**Status:** SPEC LOCKED');
  lines.push('');

  if (task.description) {
    lines.push('## Original Request');
    lines.push(task.description);
    lines.push('');
  }

  // Extract Q&A pairs from message history
  lines.push('## Planning Discussion');
  lines.push('');

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'system') continue;

    if (msg.role === 'assistant') {
      lines.push(`**Q:** ${msg.content}`);
    } else if (msg.role === 'user') {
      lines.push(`> ${msg.content}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*Spec locked at ${new Date().toISOString()}*`);

  return lines.join('\n');
}

// POST /api/tasks/[id]/planning/approve - Lock spec and move to inbox
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const db = getDb();

    // Get task with planning columns
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string;
      title: string;
      description?: string;
      status: string;
      planning_messages?: string;
      planning_spec?: string;
      planning_complete?: number;
    } | undefined;

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if already locked
    if (task.planning_complete === 1) {
      return NextResponse.json({ error: 'Spec already locked' }, { status: 400 });
    }

    // Determine the spec markdown
    let specMarkdown: string;

    if (task.planning_spec) {
      // Spec already written on the task — use it directly
      specMarkdown = task.planning_spec;
    } else {
      // Generate spec from planning messages
      const messages: PlanningMessage[] = task.planning_messages
        ? JSON.parse(task.planning_messages)
        : [];

      if (messages.length === 0) {
        return NextResponse.json({
          error: 'No planning spec or messages found — nothing to approve',
        }, { status: 400 });
      }

      specMarkdown = generateSpecFromMessages(task, messages);
    }

    // Lock the spec and move to inbox
    db.prepare(`
      UPDATE tasks
      SET planning_complete = 1,
          planning_spec = ?,
          status = 'inbox',
          description = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(specMarkdown, specMarkdown, taskId);

    // Write to planning_specs table for backward compatibility
    const specId = crypto.randomUUID();
    try {
      db.prepare(`
        INSERT INTO planning_specs (id, task_id, spec_markdown, locked_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(specId, taskId, specMarkdown);
    } catch {
      // planning_specs table may not exist — non-fatal
    }

    // Log activity
    try {
      const activityId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO task_activities (id, task_id, activity_type, message)
        VALUES (?, ?, 'status_changed', 'Planning complete - spec locked and moved to inbox')
      `).run(activityId, taskId);
    } catch {
      // Non-fatal if task_activities table is missing
    }

    return NextResponse.json({
      success: true,
      specMarkdown,
    });
  } catch (error) {
    console.error('Failed to approve spec:', error);
    return NextResponse.json({ error: 'Failed to approve spec' }, { status: 500 });
  }
}
