import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { CreateTaskSchema } from '@/lib/validation';
import type { Task, CreateTaskRequest, Agent } from '@/lib/types';
import fs from 'fs';
import path from 'path';

// GET /api/tasks - List all tasks with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const businessId = searchParams.get('business_id');
    const workspaceId = searchParams.get('workspace_id');
    const assignedAgentId = searchParams.get('assigned_agent_id');
    const initiativeId = searchParams.get('initiative_id');
    const parentTaskId = searchParams.get('parent_task_id');

    let sql = `
      SELECT
        t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name
      FROM tasks t
      LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
      LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (status) {
      // Support comma-separated status values (e.g., status=inbox,testing,in_progress)
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        sql += ' AND t.status = ?';
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        sql += ` AND t.status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }
    }
    if (businessId) {
      sql += ' AND t.business_id = ?';
      params.push(businessId);
    }
    if (workspaceId) {
      sql += ' AND t.workspace_id = ?';
      params.push(workspaceId);
    }
    if (assignedAgentId) {
      sql += ' AND t.assigned_agent_id = ?';
      params.push(assignedAgentId);
    }
    if (initiativeId) {
      sql += ' AND t.initiative_id = ?';
      params.push(initiativeId);
    }
    if (parentTaskId) {
      if (parentTaskId === 'none') {
        sql += ' AND t.parent_task_id IS NULL';
      } else {
        sql += ' AND t.parent_task_id = ?';
        params.push(parentTaskId);
      }
    }

    sql += ' ORDER BY t.created_at DESC';

    const tasks = queryAll<Task & { assigned_agent_name?: string; assigned_agent_emoji?: string; created_by_agent_name?: string }>(sql, params);

    // Transform to include nested agent info
    const transformedTasks = tasks.map((task) => ({
      ...task,
      assigned_agent: task.assigned_agent_id
        ? {
            id: task.assigned_agent_id,
            name: task.assigned_agent_name,
            avatar_emoji: task.assigned_agent_emoji,
          }
        : undefined,
    }));

    return NextResponse.json(transformedTasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  const hasTaskMetadataColumns = (): boolean => {
    try {
      const columns = queryAll<{ name: string }>('PRAGMA table_info(tasks)');
      const names = new Set(columns.map(c => c.name));
      return (
        names.has('initiative_id') &&
        names.has('external_request_id') &&
        names.has('source')
      );
    } catch {
      return false;
    }
  };

  const hasTaskTypeColumns = (): boolean => {
    try {
      const columns = queryAll<{ name: string }>('PRAGMA table_info(tasks)');
      const names = new Set(columns.map(c => c.name));
      return names.has('task_type') && names.has('task_type_config');
    } catch {
      return false;
    }
  };

  const appendPlannedInitiative = (initiativeId: string, title: string, externalRequestId?: string) => {
    try {
      const squadStatusPath = process.env.SQUAD_STATUS_PATH || '/home/node/.openclaw/workspace/intel/status';
      const initiativesPath = path.join(squadStatusPath, 'INITIATIVES.json');
      const now = new Date().toISOString();
      let data: { lastUpdate?: string; initiatives?: Array<Record<string, unknown>> } = { initiatives: [] };

      if (fs.existsSync(initiativesPath)) {
        data = JSON.parse(fs.readFileSync(initiativesPath, 'utf-8'));
      }
      if (!Array.isArray(data.initiatives)) {
        data.initiatives = [];
      }

      const existing = data.initiatives.find((init) => {
        const initId = String((init as { id?: unknown }).id || '').toUpperCase();
        const reqId = (init as { external_request_id?: unknown }).external_request_id;
        return initId === initiativeId || (externalRequestId && reqId === externalRequestId);
      });

      if (!existing) {
        data.initiatives.push({
          id: initiativeId,
          title,
          status: 'planned',
          lead: 'ventanal',
          participants: ['ventanal'],
          priority: 'high',
          created: now.split('T')[0],
          target: 'TBD',
          summary: title,
          source: 'mission-control',
          external_request_id: externalRequestId || null,
          history: [
            {
              status: 'planned',
              at: now,
              by: 'mission-control',
              note: 'Created from Mission Control panel',
            },
          ],
        });
        data.lastUpdate = now;
        const tmpPath = `${initiativesPath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tmpPath, initiativesPath);
      }
    } catch (err) {
      console.warn('[POST /api/tasks] INITIATIVES planned append failed:', err);
    }
  };

  try {
    const body: CreateTaskRequest = await request.json();
    console.log('[POST /api/tasks] Received body:', JSON.stringify(body));

    // Validate input with Zod
    const validation = CreateTaskSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const validatedData = validation.data;

    const now = new Date().toISOString();
    const source = validatedData.source || 'mission-control';

    const taskMetadataColumnsReady = hasTaskMetadataColumns();
    const taskTypeColumnsReady = hasTaskTypeColumns();

    // Idempotent create for panel-originated requests
    if (validatedData.external_request_id && taskMetadataColumnsReady) {
      const existingByRequest = queryOne<Task>(
        'SELECT * FROM tasks WHERE source = ? AND external_request_id = ?',
        [source, validatedData.external_request_id]
      );
      if (existingByRequest) {
        return NextResponse.json(existingByRequest);
      }
    }

    const id = uuidv4();

    // Resolve workspace_id: use provided value, fall back to first available workspace
    let workspaceId = validatedData.workspace_id;
    if (!workspaceId) {
      const defaultWorkspace = queryOne<{ id: string }>('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1', []);
      workspaceId = defaultWorkspace?.id || 'default';
    }
    const status = validatedData.status || 'inbox';

    // Validate parent_task_id if provided
    if (validatedData.parent_task_id) {
      const parentTask = queryOne<Task>('SELECT id, parent_task_id FROM tasks WHERE id = ?', [validatedData.parent_task_id]);
      if (!parentTask) {
        return NextResponse.json({ error: 'Parent task not found' }, { status: 400 });
      }
      if (parentTask.parent_task_id) {
        return NextResponse.json(
          { error: 'Subtask depth limit exceeded: only one level of nesting allowed' },
          { status: 400 }
        );
      }
    }

    try {
      if (taskMetadataColumnsReady) {
        if (taskTypeColumnsReady) {
          run(
            `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, initiative_id, external_request_id, source, task_type, task_type_config, parent_task_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              validatedData.title,
              validatedData.description || null,
              status,
              validatedData.priority || 'normal',
              validatedData.assigned_agent_id || null,
              validatedData.created_by_agent_id || null,
              workspaceId,
              validatedData.business_id || 'default',
              validatedData.due_date || null,
              validatedData.initiative_id || null,
              validatedData.external_request_id || null,
              source,
              validatedData.task_type || 'openclaw-native',
              validatedData.task_type_config ? JSON.stringify(validatedData.task_type_config) : null,
              validatedData.parent_task_id || null,
              now,
              now,
            ]
          );
        } else {
          run(
            `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, initiative_id, external_request_id, source, parent_task_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              validatedData.title,
              validatedData.description || null,
              status,
              validatedData.priority || 'normal',
              validatedData.assigned_agent_id || null,
              validatedData.created_by_agent_id || null,
              workspaceId,
              validatedData.business_id || 'default',
              validatedData.due_date || null,
              validatedData.initiative_id || null,
              validatedData.external_request_id || null,
              source,
              validatedData.parent_task_id || null,
              now,
              now,
            ]
          );
        }
      } else {
        run(
          `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, parent_task_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            validatedData.title,
            validatedData.description || null,
            status,
            validatedData.priority || 'normal',
            validatedData.assigned_agent_id || null,
            validatedData.created_by_agent_id || null,
            workspaceId,
            validatedData.business_id || 'default',
            validatedData.due_date || null,
            validatedData.parent_task_id || null,
            now,
            now,
          ]
        );
      }
    } catch (err) {
      if (
        taskMetadataColumnsReady &&
        err instanceof Error &&
        err.message.includes('UNIQUE constraint failed: tasks.source, tasks.external_request_id')
      ) {
        const existingByRequest = queryOne<Task>(
          'SELECT * FROM tasks WHERE source = ? AND external_request_id = ?',
          [source, validatedData.external_request_id]
        );
        if (existingByRequest) {
          return NextResponse.json(existingByRequest);
        }
        return NextResponse.json({ error: 'Duplicate external_request_id for this source' }, { status: 409 });
      }
      throw err;
    }

    if (validatedData.initiative_id) {
      appendPlannedInitiative(
        validatedData.initiative_id,
        validatedData.title,
        validatedData.external_request_id
      );
    }

    // Log event
    let eventMessage = `New task: ${validatedData.title}`;
    if (validatedData.created_by_agent_id) {
      const creator = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [validatedData.created_by_agent_id]);
      if (creator) {
        eventMessage = `${creator.name} created task: ${validatedData.title}`;
      }
    }

    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'task_created',
        body.created_by_agent_id || null,
        id,
        eventMessage,
        JSON.stringify({
          source,
          initiative_id: validatedData.initiative_id || null,
          external_request_id: validatedData.external_request_id || null,
        }),
        now,
      ]
    );

    if (validatedData.initiative_id) {
      run(
        `INSERT INTO events (id, type, task_id, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'task_status_changed',
          id,
          `Initiative ${validatedData.initiative_id} created as planned from panel`,
          JSON.stringify({
            source,
            initiative_id: validatedData.initiative_id,
            external_request_id: validatedData.external_request_id || null,
            next_status: 'planned',
          }),
          now,
        ]
      );
    }

    // Fetch created task with all joined fields
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
    
    // Broadcast task creation via SSE
    if (task) {
      broadcast({
        type: 'task_created',
        payload: task,
      });
    }
    
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
