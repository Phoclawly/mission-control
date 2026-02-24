import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, queryAll } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import { UpdateTaskSchema } from '@/lib/validation';
import type { Task, UpdateTaskRequest, Agent, TaskDeliverable } from '@/lib/types';
import fs from 'fs';
import path from 'path';

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to fetch task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

/**
 * Map Kanban status to INITIATIVES.json status
 */
function mapKanbanStatusToInitiative(kanbanStatus: string): string {
  switch (kanbanStatus) {
    case 'planning':
      return 'planned';
    case 'done':
    case 'completed':
    case 'review':
      return 'completed';
    case 'cancelled':
      return 'canceled';
    case 'in_progress':
    case 'inbox':
    case 'backlog':
    case 'assigned':
    default:
      return 'in-progress';
  }
}

/**
 * Write status change back to INITIATIVES.json for squad workspace tasks
 * Task IDs follow pattern "initiative-init-XXX" → maps to INIT-XXX in INITIATIVES.json
 */
function writebackToInitiatives(taskId: string, taskTitle: string, newStatus: string, initiativeId?: string | null): void {
  try {
    const squadStatusPath = process.env.SQUAD_STATUS_PATH || '/home/node/.openclaw/workspace/intel/status';
    const initiativesPath = path.join(squadStatusPath, 'INITIATIVES.json');

    if (!fs.existsSync(initiativesPath)) {
      console.warn('[writeback] INITIATIVES.json not found at:', initiativesPath);
      return;
    }

    const raw = fs.readFileSync(initiativesPath, 'utf-8');
    const data = JSON.parse(raw);

    if (!data.initiatives || !Array.isArray(data.initiatives)) {
      console.warn('[writeback] INITIATIVES.json has no initiatives array');
      return;
    }

    // Resolve initiative ID from explicit field first, then task-id pattern fallback
    let resolvedInitiativeId: string | null = initiativeId?.toUpperCase() || null;
    if (!resolvedInitiativeId) {
      const idMatch = taskId.match(/^initiative-(init-\d+)$/i);
      if (idMatch) {
        resolvedInitiativeId = idMatch[1].toUpperCase(); // e.g. "INIT-007"
      }
    }

    // Find initiative by ID or by title prefix
    let initiative = null;
    if (resolvedInitiativeId) {
      initiative = data.initiatives.find((init: { id?: string }) => init.id === resolvedInitiativeId);
    }

    // Fallback: match by title (task title starts with "INIT-XXX: ...")
    if (!initiative) {
      const titleMatch = taskTitle.match(/^(INIT-\d+):/i);
      if (titleMatch) {
        const titleId = titleMatch[1].toUpperCase();
        initiative = data.initiatives.find((init: { id?: string }) => init.id === titleId);
      }
    }

    if (!initiative) {
      console.warn('[writeback] No matching initiative found for task:', taskId, taskTitle);
      return;
    }

    const initiativeStatus = mapKanbanStatusToInitiative(newStatus);
    const now = new Date().toISOString();

    // Update status
    initiative.status = initiativeStatus;

    // Append to history
    if (!initiative.history) {
      initiative.history = [];
    }
    initiative.history.push({
      status: initiativeStatus,
      at: now,
      by: 'mission-control',
      note: `Updated via Kanban (${newStatus})`,
    });

    // Update lastUpdate timestamp
    data.lastUpdate = now;

    // Write back atomically
    const tmpPath = initiativesPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, initiativesPath);

    console.log(`[writeback] Updated initiative ${initiative.id} → ${initiativeStatus} (from kanban: ${newStatus})`);
  } catch (err) {
    // Non-fatal: log but don't fail the API request
    console.error('[writeback] Failed to write back to INITIATIVES.json:', err);
  }
}

// PATCH /api/tasks/[id] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateTaskRequest & { updated_by_agent_id?: string } = await request.json();

    // Validate input with Zod
    const validation = UpdateTaskSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const validatedData = validation.data;

    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();

    // Workflow enforcement for agent-initiated approvals
    // If an agent is trying to move review→done, they must be a master agent
    // User-initiated moves (no agent ID) are allowed
    if (validatedData.status === 'done' && existing.status === 'review' && validatedData.updated_by_agent_id) {
      const updatingAgent = queryOne<Agent>(
        'SELECT is_master FROM agents WHERE id = ?',
        [validatedData.updated_by_agent_id]
      );

      if (!updatingAgent || !updatingAgent.is_master) {
        return NextResponse.json(
          { error: 'Forbidden: only the master agent can approve tasks' },
          { status: 403 }
        );
      }
    }

    if (validatedData.title !== undefined) {
      updates.push('title = ?');
      values.push(validatedData.title);
    }
    if (validatedData.description !== undefined) {
      updates.push('description = ?');
      values.push(validatedData.description);
    }
    if (validatedData.priority !== undefined) {
      updates.push('priority = ?');
      values.push(validatedData.priority);
    }
    if (validatedData.due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(validatedData.due_date);
    }
    if (validatedData.initiative_id !== undefined) {
      updates.push('initiative_id = ?');
      values.push(validatedData.initiative_id);
    }
    if (validatedData.external_request_id !== undefined) {
      updates.push('external_request_id = ?');
      values.push(validatedData.external_request_id);
    }
    if (validatedData.source !== undefined) {
      updates.push('source = ?');
      values.push(validatedData.source);
    }
    if (validatedData.task_type !== undefined) {
      updates.push('task_type = ?');
      values.push(validatedData.task_type);
    }
    if (validatedData.task_type_config !== undefined) {
      updates.push('task_type_config = ?');
      values.push(validatedData.task_type_config !== null ? JSON.stringify(validatedData.task_type_config) : null);
    }

    // Track if we need to dispatch task
    let shouldDispatch = false;
    let statusChanged = false;

    // Handle status change
    if (validatedData.status !== undefined && validatedData.status !== existing.status) {
      updates.push('status = ?');
      values.push(validatedData.status);
      statusChanged = true;

      // Auto-dispatch when moving to assigned
      if (validatedData.status === 'assigned' && existing.assigned_agent_id) {
        shouldDispatch = true;
      }

      // Log status change event
      const eventType = validatedData.status === 'done' ? 'task_completed' : 'task_status_changed';
      run(
        `INSERT INTO events (id, type, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), eventType, id, `Task "${existing.title}" moved to ${validatedData.status}`, now]
      );
    }

    // Handle assignment change
    if (validatedData.assigned_agent_id !== undefined && validatedData.assigned_agent_id !== existing.assigned_agent_id) {
      updates.push('assigned_agent_id = ?');
      values.push(validatedData.assigned_agent_id);

      if (validatedData.assigned_agent_id) {
        const agent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [validatedData.assigned_agent_id]);
        if (agent) {
          run(
            `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_assigned', validatedData.assigned_agent_id, id, `"${existing.title}" assigned to ${agent.name}`, now]
          );

          // Auto-dispatch if already in assigned status or being assigned now
          if (existing.status === 'assigned' || validatedData.status === 'assigned') {
            shouldDispatch = true;
          }
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    try {
      run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('UNIQUE constraint failed: tasks.source, tasks.external_request_id')
      ) {
        return NextResponse.json(
          { error: 'Duplicate external_request_id for this source' },
          { status: 409 }
        );
      }
      throw err;
    }

    // Writeback to INITIATIVES.json for all tasks with initiative IDs or matching naming
    if (statusChanged && validatedData.status) {
      writebackToInitiatives(id, existing.title, validatedData.status, validatedData.initiative_id || existing.initiative_id || null);
    }

    // Fetch updated task with all joined fields
    const task = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name,
        ca.avatar_emoji as created_by_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
       WHERE t.id = ?`,
      [id]
    );

    // Broadcast task update via SSE
    if (task) {
      broadcast({
        type: 'task_updated',
        payload: task,
      });
    }

    // Trigger auto-dispatch if needed
    if (shouldDispatch) {
      // Call dispatch endpoint asynchronously (don't wait for response)
      const missionControlUrl = getMissionControlUrl();
      fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => {
        console.error('Auto-dispatch failed:', err);
      });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete or nullify related records first (foreign key constraints)
    // Note: task_activities and task_deliverables have ON DELETE CASCADE
    run('DELETE FROM openclaw_sessions WHERE task_id = ?', [id]);
    run('DELETE FROM events WHERE task_id = ?', [id]);
    // Conversations reference tasks - nullify or delete
    run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [id]);

    // Now delete the task (cascades to task_activities and task_deliverables)
    run('DELETE FROM tasks WHERE id = ?', [id]);

    // Broadcast deletion via SSE
    broadcast({
      type: 'task_deleted',
      payload: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
